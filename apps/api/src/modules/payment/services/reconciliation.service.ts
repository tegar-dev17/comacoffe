import { and, eq, inArray, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Env } from "../../../config/env.js";
import * as schema from "../../../db/schema/index.js";
import type { AuthContext } from "../../auth/types.js";
import { PERMISSIONS, roleHasPermission } from "../../auth/permissions.js";
import { createProviderAdapter } from "../providers/factory.js";
import { PaymentForbiddenError, PaymentService } from "./payment.service.js";

type Db = NodePgDatabase<typeof schema>;

export class ReconciliationService {
  private paymentService: PaymentService;

  constructor(
    private readonly db: Db,
    private readonly env: Env,
  ) {
    this.paymentService = new PaymentService(db, env);
  }

  async runBatch(auth: AuthContext, tenantId?: string) {
    if (!roleHasPermission(auth.role, PERMISSIONS.PAYMENT_RECONCILE)) {
      throw new PaymentForbiddenError("Insufficient permission");
    }
    const targetTenant = tenantId ?? auth.tenantId;
    if (targetTenant !== auth.tenantId && auth.role !== "owner" && auth.role !== "admin") {
      throw new PaymentForbiddenError("Cross-tenant reconciliation denied");
    }

    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
    const candidates = await this.db
      .select()
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tenantId, targetTenant),
          inArray(schema.payments.status, ["PENDING", "UNKNOWN"]),
          lt(schema.payments.updatedAt, staleBefore),
        ),
      )
      .limit(this.env.RECONCILIATION_BATCH_SIZE);

    const results = [];
    for (const payment of candidates) {
      if (payment.provider === "cash") continue;
      const adapter = createProviderAdapter(this.env, payment.provider);
      if (!adapter?.capabilities().inquiry || !payment.providerReference) continue;
      try {
        const status = await adapter.getPaymentStatus({
          providerPaymentId: payment.providerPaymentId ?? undefined,
          providerReference: payment.providerReference,
        });
        const matched =
          status.normalizedStatus === payment.status &&
          (status.amountMinor === undefined || status.amountMinor === payment.amountMinor);

        await this.db.insert(schema.paymentReconciliations).values({
          paymentId: payment.id,
          status: matched ? "MATCHED" : "MISMATCH",
          internalStatus: payment.status,
          providerStatus: status.providerStatus,
          amountMinorInternal: payment.amountMinor,
          amountMinorProvider: status.amountMinor,
          notes: matched ? "Auto reconciliation matched" : "Auto reconciliation mismatch",
        });

        if (!matched && status.amountMinor === payment.amountMinor) {
          await this.paymentService.applyStatusTransition(
            payment,
            status.normalizedStatus,
            "reconciliation.job",
            undefined,
            status.rawResponse,
          );
        }
        results.push({ paymentId: payment.id, status: matched ? "MATCHED" : "MISMATCH" });
      } catch (err) {
        await this.db.insert(schema.paymentReconciliations).values({
          paymentId: payment.id,
          status: "FAILED",
          internalStatus: payment.status,
          notes: err instanceof Error ? err.message : "Inquiry failed",
        });
        results.push({ paymentId: payment.id, status: "FAILED" });
      }
    }
    return { processed: results.length, results };
  }

  async listExceptions(auth: AuthContext) {
    if (!roleHasPermission(auth.role, PERMISSIONS.PAYMENT_RECONCILE)) {
      throw new PaymentForbiddenError("Insufficient permission");
    }
    const rows = await this.db
      .select({
        reconciliation: schema.paymentReconciliations,
        payment: schema.payments,
      })
      .from(schema.paymentReconciliations)
      .innerJoin(schema.payments, eq(schema.paymentReconciliations.paymentId, schema.payments.id))
      .where(
        and(
          eq(schema.payments.tenantId, auth.tenantId),
          inArray(schema.paymentReconciliations.status, ["MISMATCH", "OPEN", "FAILED"]),
        ),
      )
      .limit(100);
    return rows.map((r) => ({
      reconciliationId: r.reconciliation.id,
      paymentId: r.payment.id,
      orderId: r.payment.orderId,
      status: r.reconciliation.status,
      notes: r.reconciliation.notes,
      createdAt: r.reconciliation.createdAt.toISOString(),
    }));
  }
}
