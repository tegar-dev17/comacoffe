import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { v4 as uuidv4 } from "uuid";
import type { Env } from "../../../config/env.js";
import * as schema from "../../../db/schema/index.js";
import type { AuthContext } from "../../auth/types.js";
import { PERMISSIONS, roleHasPermission } from "../../auth/permissions.js";
import { createProviderAdapter } from "../providers/factory.js";
import { createCashPaymentResult } from "../providers/cash.handler.js";
import {
  isQrisChannelNotActivatedError,
  qrisStagingFallbackEnabled,
} from "../qris-staging-fallback.js";
import { DevMidtransAdapter } from "../providers/dev-midtrans.adapter.js";
import { ProviderCapabilityError } from "../providers/midtrans.adapter.js";
import { resolveTransition, isPaidStatus } from "../state-machine.js";
import type { CreatePaymentInput, PaymentMethod, PaymentProvider } from "../types.js";
import { stableHash } from "../utils/hash.js";
import { MerchantConfigService } from "./merchant-config.service.js";
import { enqueueOutboxEvent } from "./outbox.service.js";
import {
  ACTIVE_PAYMENT_STATUSES,
  DUPLICATE_ACTIVE_PAYMENT_MESSAGE,
} from "../active-payment-statuses.js";
import { commitOrderInventory } from "../../pos/inventory.service.js";

type Db = NodePgDatabase<typeof schema>;

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

function throwIfDuplicateActivePayment(err: unknown): never {
  if (isPgUniqueViolation(err)) {
    throw new PaymentConflictError(DUPLICATE_ACTIVE_PAYMENT_MESSAGE);
  }
  throw err;
}

export class PaymentService {
  constructor(
    private readonly db: Db,
    private readonly env: Env,
  ) {}

  private async resolveAdapterForPayment(payment: typeof schema.payments.$inferSelect) {
    if (payment.provider === "cash") return null;
    const merchantConfigs = new MerchantConfigService(this.db, this.env);
    const runtime = await merchantConfigs.resolveRuntimeConfig({
      tenantId: payment.tenantId,
      outletId: payment.outletId,
      provider: payment.provider,
    });
    return createProviderAdapter(this.env, payment.provider, runtime);
  }

  private assertPermission(auth: AuthContext, permission: string) {
    if (!roleHasPermission(auth.role, permission as (typeof PERMISSIONS)[keyof typeof PERMISSIONS])) {
      throw new PaymentForbiddenError("Insufficient permission");
    }
  }

  async createPayment(auth: AuthContext, input: CreatePaymentInput) {
    this.assertPermission(auth, PERMISSIONS.PAYMENT_CREATE);
    const requestHash = stableHash({
      orderId: input.orderId,
      paymentMethod: input.paymentMethod,
      provider: input.provider,
    });

    const existingIdem = await this.db.query.idempotencyRecords.findFirst({
      where: and(
        eq(schema.idempotencyRecords.tenantId, auth.tenantId),
        eq(schema.idempotencyRecords.scope, "payment.create"),
        eq(schema.idempotencyRecords.idempotencyKey, input.idempotencyKey),
      ),
    });
    if (existingIdem) {
      if (existingIdem.requestHash !== requestHash) {
        throw new PaymentConflictError("Idempotency key reused with different payload");
      }
      return existingIdem.responseJson;
    }

    const order = await this.db.query.orders.findFirst({
      where: and(eq(schema.orders.id, input.orderId), eq(schema.orders.tenantId, auth.tenantId)),
    });
    if (!order) throw new PaymentNotFoundError("Order not found");
    if (auth.outletId && auth.role === "cashier" && order.outletId !== auth.outletId) {
      throw new PaymentForbiddenError("Outlet access denied");
    }
    if (order.status !== "pending_payment" && order.status !== "draft") {
      throw new PaymentValidationError("Order is not eligible for payment");
    }

    const provider: PaymentProvider =
      input.paymentMethod === "cash" ? "cash" : (input.provider ?? this.env.PAYMENT_PROVIDER);

    const paymentId = uuidv4();
    const providerReference = `${order.orderNumber}-${paymentId.slice(0, 8)}`;

    let payment: typeof schema.payments.$inferSelect;
    try {
      payment = await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`,
        );

        const lockedOrder = await tx.query.orders.findFirst({
          where: eq(schema.orders.id, order.id),
        });
        if (
          !lockedOrder ||
          (lockedOrder.status !== "pending_payment" && lockedOrder.status !== "draft")
        ) {
          throw new PaymentValidationError("Order is not eligible for payment");
        }

        const activeExisting = await tx
          .select({ id: schema.payments.id })
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.orderId, order.id),
              inArray(schema.payments.status, [...ACTIVE_PAYMENT_STATUSES]),
            ),
          )
          .limit(1);

        if (activeExisting.length > 0) {
          throw new PaymentConflictError(DUPLICATE_ACTIVE_PAYMENT_MESSAGE);
        }

        const inserted = await tx
          .insert(schema.payments)
          .values({
            id: paymentId,
            tenantId: auth.tenantId,
            outletId: order.outletId,
            orderId: order.id,
            provider,
            idempotencyKey: input.idempotencyKey,
            paymentMethod: input.paymentMethod as PaymentMethod,
            amountMinor: order.totalMinor,
            currency: order.currency,
            status: "CREATED",
            providerReference,
            metadataJson: {
              localOperationId: input.localOperationId,
              deviceId: input.deviceId,
            },
          })
          .returning();

        const row = inserted[0];
        if (!row) throw new Error("Failed to create payment");

        await tx.insert(schema.paymentEvents).values({
          paymentId: row.id,
          toStatus: "CREATED",
          source: "api.create",
          payloadJson: {},
        });

        return row;
      });
    } catch (err) {
      if (err instanceof PaymentConflictError) throw err;
      throwIfDuplicateActivePayment(err);
    }

    let providerResult;
    let attemptError: string | undefined;
    try {
      if (provider === "cash") {
        providerResult = createCashPaymentResult({
          paymentId,
          amountMinor: order.totalMinor,
          cashAmountReceivedMinor: input.cashAmountReceivedMinor,
        });
      } else {
        const merchantConfigs = new MerchantConfigService(this.db, this.env);
        const runtime = await merchantConfigs.resolveRuntimeConfig({
          tenantId: auth.tenantId,
          outletId: order.outletId,
          provider,
        });
        const adapter = createProviderAdapter(this.env, provider, runtime);
        if (!adapter) throw new Error("Provider adapter missing");
        const orderLines = await this.db.query.orderItems.findMany({
          where: eq(schema.orderItems.orderId, order.id),
        });
        const chargeParams = {
          paymentId,
          orderId: order.id,
          orderReference: providerReference,
          amountMinor: order.totalMinor,
          currency: order.currency,
          paymentMethod: input.paymentMethod,
          lineItems: orderLines.map((line) => ({
            id: line.productId ?? line.id,
            name: line.productName,
            priceMinor: line.unitPriceMinor,
            quantity: line.quantity,
          })),
        };
        try {
          providerResult = await adapter.createPayment(chargeParams);
        } catch (providerErr) {
          if (
            qrisStagingFallbackEnabled(this.env) &&
            input.paymentMethod === "qris" &&
            isQrisChannelNotActivatedError(providerErr)
          ) {
            providerResult = await new DevMidtransAdapter().createPayment(chargeParams);
          } else {
            throw providerErr;
          }
        }
      }
    } catch (err) {
      attemptError = err instanceof Error ? err.message : "Provider error";
      await this.db
        .update(schema.payments)
        .set({ status: "FAILED", failedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.payments.id, paymentId));
      await this.recordEvent(paymentId, "CREATED", "FAILED", "provider.error", undefined, {
        error: attemptError,
      });
      throw err;
    }

    await this.db.insert(schema.paymentAttempts).values({
      paymentId,
      attemptNumber: 1,
      providerResponseJson: providerResult.rawResponse,
      errorMessage: attemptError,
    });

    const nextStatus = resolveTransition("CREATED", providerResult.normalizedStatus);
    const [updated] = await this.db
      .update(schema.payments)
      .set({
        status: nextStatus,
        providerPaymentId: providerResult.providerPaymentId,
        providerReference: providerResult.providerReference,
        expiresAt: "expiresAt" in providerResult ? providerResult.expiresAt : undefined,
        succeededAt: nextStatus === "SUCCEEDED" ? new Date() : null,
        updatedAt: new Date(),
        metadataJson: {
          ...(payment.metadataJson ?? {}),
          instructions: providerResult.instructions,
        },
      })
      .where(eq(schema.payments.id, paymentId))
      .returning();

    await this.recordEvent(payment.id, "CREATED", nextStatus, "provider.create", undefined, {
      provider: providerResult.rawResponse,
    });

    if (nextStatus === "SUCCEEDED") {
      await this.markOrderPaid(order.id, auth.userId);
    }

    const response = this.toPublicPayment(updated!, providerResult.instructions);
    await this.db.insert(schema.idempotencyRecords).values({
      tenantId: auth.tenantId,
      scope: "payment.create",
      idempotencyKey: input.idempotencyKey,
      requestHash,
      responseJson: response,
    });
    return response;
  }

  async getPayment(auth: AuthContext, paymentId: string) {
    this.assertPermission(auth, PERMISSIONS.PAYMENT_READ);
    const payment = await this.getPaymentForTenant(auth, paymentId);
    const instructions = (payment.metadataJson as { instructions?: unknown })?.instructions;
    return this.toPublicPayment(payment, instructions as import("../types.js").PaymentInstructions);
  }

  async listPayments(
    auth: AuthContext,
    filters: {
      outletId?: string;
      status?: string;
      paymentMethod?: string;
      provider?: string;
      orderId?: string;
      from?: Date;
      to?: Date;
      page?: number;
      limit?: number;
    },
  ) {
    this.assertPermission(auth, PERMISSIONS.PAYMENT_READ);
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [eq(schema.payments.tenantId, auth.tenantId)];
    if (filters.outletId) conditions.push(eq(schema.payments.outletId, filters.outletId));
    if (auth.outletId && auth.role === "cashier") {
      conditions.push(eq(schema.payments.outletId, auth.outletId));
    }
    if (filters.status) {
      conditions.push(
        eq(schema.payments.status, filters.status as import("../types.js").PaymentStatus),
      );
    }
    if (filters.paymentMethod) {
      conditions.push(eq(schema.payments.paymentMethod, filters.paymentMethod as PaymentMethod));
    }
    if (filters.provider) {
      conditions.push(eq(schema.payments.provider, filters.provider as PaymentProvider));
    }
    if (filters.orderId) conditions.push(eq(schema.payments.orderId, filters.orderId));
    if (filters.from) conditions.push(gte(schema.payments.createdAt, filters.from));
    if (filters.to) conditions.push(lte(schema.payments.createdAt, filters.to));

    const items = await this.db
      .select()
      .from(schema.payments)
      .where(and(...conditions))
      .orderBy(desc(schema.payments.createdAt))
      .limit(limit)
      .offset(offset);

    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.payments)
      .where(and(...conditions));
    const count = countRows[0]?.count ?? 0;

    return {
      data: items.map((p) => this.toPublicPayment(p)),
      pagination: { page, limit, total: count },
    };
  }

  async refreshPayment(auth: AuthContext, paymentId: string) {
    this.assertPermission(auth, PERMISSIONS.PAYMENT_REFRESH);
    const payment = await this.getPaymentForTenant(auth, paymentId);
    if (payment.provider === "cash") {
      return this.toPublicPayment(payment);
    }
    const adapter = await this.resolveAdapterForPayment(payment);
    if (!adapter?.capabilities().inquiry) {
      throw new ProviderCapabilityError("Provider does not support inquiry");
    }
    if (!payment.providerReference) {
      throw new PaymentValidationError("Missing provider reference");
    }

    let statusResult;
    try {
      statusResult = await adapter.getPaymentStatus({
        providerPaymentId: payment.providerPaymentId ?? undefined,
        providerReference: payment.providerReference,
      });
    } catch {
      await this.applyStatusTransition(payment, "UNKNOWN", "refresh.timeout", undefined, {});
      const refreshed = await this.getPaymentForTenant(auth, paymentId);
      return this.toPublicPayment(refreshed);
    }

    if (
      statusResult.amountMinor !== undefined &&
      statusResult.amountMinor !== payment.amountMinor
    ) {
      await this.db.insert(schema.paymentReconciliations).values({
        paymentId: payment.id,
        status: "MISMATCH",
        internalStatus: payment.status,
        providerStatus: statusResult.providerStatus,
        amountMinorInternal: payment.amountMinor,
        amountMinorProvider: statusResult.amountMinor,
        notes: "Amount mismatch on refresh",
      });
      return this.toPublicPayment(await this.getPaymentForTenant(auth, paymentId));
    }

    await this.applyStatusTransition(
      payment,
      statusResult.normalizedStatus,
      "refresh.inquiry",
      undefined,
      statusResult.rawResponse,
    );
    return this.toPublicPayment(await this.getPaymentForTenant(auth, paymentId));
  }

  async cancelPayment(auth: AuthContext, paymentId: string) {
    this.assertPermission(auth, PERMISSIONS.PAYMENT_CANCEL);
    const payment = await this.getPaymentForTenant(auth, paymentId);
    if (isPaidStatus(payment.status)) {
      throw new PaymentValidationError("Paid payment cannot be cancelled");
    }
    if (payment.provider === "cash") {
      await this.applyStatusTransition(payment, "CANCELLED", "api.cancel", undefined, {});
      return this.toPublicPayment(await this.getPaymentForTenant(auth, paymentId));
    }
    const adapter = await this.resolveAdapterForPayment(payment);
    if (!adapter?.capabilities().cancel) {
      throw new ProviderCapabilityError("Provider does not support cancel");
    }
    const result = await adapter.cancelPayment({ providerReference: payment.providerReference! });
    await this.applyStatusTransition(
      payment,
      result.normalizedStatus,
      "provider.cancel",
      undefined,
      result.rawResponse,
    );
    return this.toPublicPayment(await this.getPaymentForTenant(auth, paymentId));
  }

  async applyStatusTransition(
    payment: typeof schema.payments.$inferSelect,
    toStatus: import("../types.js").PaymentStatus,
    source: string,
    providerEventId?: string,
    payload?: Record<string, unknown>,
  ) {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM payments WHERE id = ${payment.id} FOR UPDATE`,
      );

      const current = await tx.query.payments.findFirst({
        where: eq(schema.payments.id, payment.id),
      });
      if (!current) throw new PaymentNotFoundError("Payment not found");

      const next = resolveTransition(current.status, toStatus);
      if (next === current.status) {
        return current;
      }

      const now = new Date();
      await tx
        .update(schema.payments)
        .set({
          status: next,
          succeededAt: next === "SUCCEEDED" ? now : current.succeededAt,
          failedAt: next === "FAILED" ? now : current.failedAt,
          updatedAt: now,
        })
        .where(eq(schema.payments.id, current.id));

      await tx.insert(schema.paymentEvents).values({
        paymentId: current.id,
        fromStatus: current.status,
        toStatus: next,
        source,
        providerEventId,
        payloadJson: payload,
      });

      if (next === "SUCCEEDED" && !isPaidStatus(current.status)) {
        await tx
          .update(schema.orders)
          .set({ status: "paid", paidAt: now, updatedAt: now })
          .where(eq(schema.orders.id, current.orderId));
        await commitOrderInventory(tx, {
          tenantId: current.tenantId,
          outletId: current.outletId,
          orderId: current.orderId,
        });
      }

      await enqueueOutboxEvent(tx, {
        tenantId: current.tenantId,
        aggregateType: "payment",
        aggregateId: current.id,
        eventType: "payment.status_changed",
        dedupeKey: `payment:${current.id}:status:${next}:${providerEventId ?? source}`,
        payload: {
          paymentId: current.id,
          orderId: current.orderId,
          fromStatus: current.status,
          toStatus: next,
          source,
        },
      });

      return { ...current, status: next, succeededAt: next === "SUCCEEDED" ? now : current.succeededAt, updatedAt: now };
    });
  }

  async getPaymentDetail(auth: AuthContext, paymentId: string) {
    const payment = await this.getPaymentForTenant(auth, paymentId);
    const events = await this.db
      .select()
      .from(schema.paymentEvents)
      .where(eq(schema.paymentEvents.paymentId, paymentId))
      .orderBy(asc(schema.paymentEvents.createdAt));
    const refunds = await this.db.query.paymentRefunds.findMany({
      where: eq(schema.paymentRefunds.paymentId, paymentId),
    });
    const reconciliations = await this.db.query.paymentReconciliations.findMany({
      where: eq(schema.paymentReconciliations.paymentId, paymentId),
    });
    const attempts = await this.db.query.paymentAttempts.findMany({
      where: eq(schema.paymentAttempts.paymentId, paymentId),
    });

    const instructions = (payment.metadataJson as { instructions?: import("../types.js").PaymentInstructions })
      ?.instructions;

    return {
      payment: this.toPublicPayment(payment, instructions),
      statusHistory: events.map((e) => ({
        id: e.id,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        source: e.source,
        createdAt: e.createdAt.toISOString(),
      })),
      refunds: refunds.map((r) => ({
        id: r.id,
        amountMinor: r.amountMinor,
        status: r.status,
        approvalStatus: r.approvalStatus,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      })),
      reconciliations: reconciliations.map((r) => ({
        id: r.id,
        status: r.status,
        notes: r.notes,
        providerStatus: r.providerStatus,
        createdAt: r.createdAt.toISOString(),
      })),
      inquiries: attempts.map((a) => ({
        id: a.id,
        attemptNumber: a.attemptNumber,
        httpStatus: a.httpStatus,
        errorMessage: a.errorMessage,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  async markOrderPaid(orderId: string, actorUserId?: string) {
    await this.db.transaction(async (tx) => {
      const order = await tx.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      });
      if (!order) return;
      const now = new Date();
      if (order.status !== "paid") {
        await tx
          .update(schema.orders)
          .set({ status: "paid", paidAt: now, updatedAt: now })
          .where(eq(schema.orders.id, orderId));
      }
      await commitOrderInventory(tx, {
        tenantId: order.tenantId,
        outletId: order.outletId,
        orderId,
        actorUserId,
      });
    });
  }

  async getPaymentForTenant(auth: AuthContext, paymentId: string) {
    const payment = await this.db.query.payments.findFirst({
      where: and(eq(schema.payments.id, paymentId), eq(schema.payments.tenantId, auth.tenantId)),
    });
    if (!payment) throw new PaymentNotFoundError("Payment not found");
    if (auth.outletId && auth.role === "cashier" && payment.outletId !== auth.outletId) {
      throw new PaymentForbiddenError("Outlet access denied");
    }
    return payment;
  }

  async getPaymentByProviderReference(providerReference: string) {
    return this.db.query.payments.findFirst({
      where: eq(schema.payments.providerReference, providerReference),
    });
  }

  private async recordEvent(
    paymentId: string,
    from: import("../types.js").PaymentStatus | null,
    to: import("../types.js").PaymentStatus,
    source: string,
    providerEventId: string | undefined,
    payload: Record<string, unknown>,
  ) {
    await this.db.insert(schema.paymentEvents).values({
      paymentId,
      fromStatus: from ?? undefined,
      toStatus: to,
      source,
      providerEventId,
      payloadJson: payload,
    });
  }

  private toPublicPayment(
    payment: typeof schema.payments.$inferSelect,
    instructions?: import("../types.js").PaymentInstructions,
  ) {
    const meta = payment.metadataJson as { instructions?: import("../types.js").PaymentInstructions };
    return {
      id: payment.id,
      orderId: payment.orderId,
      outletId: payment.outletId,
      provider: payment.provider,
      paymentMethod: payment.paymentMethod,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      status: payment.status,
      settlementStatus: payment.settlementStatus,
      providerReference: payment.providerReference,
      expiresAt: payment.expiresAt?.toISOString() ?? null,
      succeededAt: payment.succeededAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
      instructions: instructions ?? meta?.instructions ?? null,
    };
  }
}

export class PaymentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentNotFoundError";
  }
}

export class PaymentForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentForbiddenError";
  }
}

export class PaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentValidationError";
  }
}

export class PaymentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConflictError";
  }
}
