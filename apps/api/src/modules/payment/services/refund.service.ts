import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { v4 as uuidv4 } from "uuid";
import type { Env } from "../../../config/env.js";
import * as schema from "../../../db/schema/index.js";
import type { AuthContext } from "../../auth/types.js";
import { PERMISSIONS, roleHasPermission } from "../../auth/permissions.js";
import { createProviderAdapter } from "../providers/factory.js";
import { ProviderCapabilityError } from "../providers/midtrans.adapter.js";
import { isPaidStatus, resolveTransition } from "../state-machine.js";
import { stableHash } from "../utils/hash.js";
import {
  PaymentForbiddenError,
  PaymentNotFoundError,
  PaymentValidationError,
  PaymentConflictError,
  PaymentService,
} from "./payment.service.js";

type Db = NodePgDatabase<typeof schema>;

const REFUND_APPROVAL_THRESHOLD_MINOR = 500_000;

export class RefundService {
  private paymentService: PaymentService;

  constructor(
    private readonly db: Db,
    private readonly env: Env,
  ) {
    this.paymentService = new PaymentService(db, env);
  }

  async createRefund(
    auth: AuthContext,
    paymentId: string,
    input: { amountMinor: number; reason: string; idempotencyKey: string },
  ) {
    if (!roleHasPermission(auth.role, PERMISSIONS.PAYMENT_REFUND)) {
      throw new PaymentForbiddenError("Insufficient permission");
    }

    const requestHash = stableHash(input);
    const existingIdem = await this.db.query.idempotencyRecords.findFirst({
      where: and(
        eq(schema.idempotencyRecords.tenantId, auth.tenantId),
        eq(schema.idempotencyRecords.scope, "payment.refund"),
        eq(schema.idempotencyRecords.idempotencyKey, input.idempotencyKey),
      ),
    });
    if (existingIdem) {
      if (existingIdem.requestHash !== requestHash) {
        throw new PaymentConflictError("Idempotency key reused with different payload");
      }
      return existingIdem.responseJson;
    }

    const payment = await this.paymentService.getPaymentForTenant(auth, paymentId);
    if (!isPaidStatus(payment.status) || payment.status === "REFUNDED") {
      throw new PaymentValidationError("Payment is not refundable");
    }

    if (
      input.amountMinor > REFUND_APPROVAL_THRESHOLD_MINOR &&
      !["owner", "admin", "supervisor"].includes(auth.role)
    ) {
      throw new PaymentForbiddenError("Refund amount requires supervisor approval");
    }

    const refundSumRows = await this.db
      .select({
        refunded: sql<number>`coalesce(sum(${schema.paymentRefunds.amountMinor}), 0)::int`,
      })
      .from(schema.paymentRefunds)
      .where(
        and(
          eq(schema.paymentRefunds.paymentId, paymentId),
          eq(schema.paymentRefunds.status, "SUCCEEDED"),
        ),
      );

    const refunded = refundSumRows[0]?.refunded ?? 0;
    const refundableRemaining = payment.amountMinor - refunded;
    if (input.amountMinor <= 0 || input.amountMinor > refundableRemaining) {
      throw new PaymentValidationError("Invalid refund amount");
    }

    const refundId = uuidv4();
    await this.db.insert(schema.paymentRefunds).values({
      id: refundId,
      paymentId,
      tenantId: auth.tenantId,
      amountMinor: input.amountMinor,
      currency: payment.currency,
      reason: input.reason,
      status: "PENDING",
      idempotencyKey: input.idempotencyKey,
      requestedByUserId: auth.userId,
    });

    if (payment.provider === "cash") {
      const response = await this.finalizeRefund(payment, refundId, input.amountMinor, refundableRemaining);
      await this.storeIdempotency(auth.tenantId, input.idempotencyKey, requestHash, response);
      return response;
    }

    const adapter = createProviderAdapter(this.env, payment.provider);
    if (!adapter?.capabilities().refund) {
      throw new ProviderCapabilityError("Provider does not support refund");
    }

    await this.paymentService.applyStatusTransition(
      payment,
      "REFUND_PENDING",
      "api.refund",
      undefined,
      { refundId },
    );

    try {
      const result = await adapter.refundPayment({
        providerReference: payment.providerReference!,
        amountMinor: input.amountMinor,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      });

      await this.db
        .update(schema.paymentRefunds)
        .set({
          providerRefundId: result.providerRefundId,
          status: result.normalizedStatus === "SUCCEEDED" ? "SUCCEEDED" : "PENDING",
          updatedAt: new Date(),
        })
        .where(eq(schema.paymentRefunds.id, refundId));

      const refreshedPayment = await this.paymentService.getPaymentForTenant(auth, paymentId);
      const response = await this.finalizeRefund(
        refreshedPayment,
        refundId,
        input.amountMinor,
        refundableRemaining,
        result.normalizedStatus === "SUCCEEDED",
      );
      await this.storeIdempotency(auth.tenantId, input.idempotencyKey, requestHash, response);
      return response;
    } catch (err) {
      await this.db
        .update(schema.paymentRefunds)
        .set({ status: "FAILED", updatedAt: new Date() })
        .where(eq(schema.paymentRefunds.id, refundId));
      throw err;
    }
  }

  private async finalizeRefund(
    payment: typeof schema.payments.$inferSelect,
    refundId: string,
    amountMinor: number,
    refundableBefore: number,
    succeeded = true,
  ) {
    if (succeeded) {
      await this.db
        .update(schema.paymentRefunds)
        .set({ status: "SUCCEEDED", updatedAt: new Date() })
        .where(eq(schema.paymentRefunds.id, refundId));

      const newRefunded = refundableBefore - amountMinor;
      const targetStatus =
        newRefunded === 0
          ? ("REFUNDED" as const)
          : ("PARTIALLY_REFUNDED" as const);
      const next = resolveTransition(payment.status, targetStatus);
      await this.paymentService.applyStatusTransition(
        payment,
        next,
        "refund.completed",
        refundId,
        { amountMinor },
      );
    }

    const refund = await this.db.query.paymentRefunds.findFirst({
      where: eq(schema.paymentRefunds.id, refundId),
    });
    if (!refund) throw new PaymentNotFoundError("Refund not found");
    return {
      id: refund.id,
      paymentId: refund.paymentId,
      amountMinor: refund.amountMinor,
      currency: refund.currency,
      status: refund.status,
      reason: refund.reason,
      providerRefundId: refund.providerRefundId,
      createdAt: refund.createdAt.toISOString(),
    };
  }

  private async storeIdempotency(
    tenantId: string,
    key: string,
    requestHash: string,
    response: unknown,
  ) {
    await this.db.insert(schema.idempotencyRecords).values({
      tenantId,
      scope: "payment.refund",
      idempotencyKey: key,
      requestHash,
      responseJson: response as Record<string, unknown>,
    });
  }
}
