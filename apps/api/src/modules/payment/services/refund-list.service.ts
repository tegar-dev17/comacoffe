import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../../db/schema/index.js";
import type { AuthContext } from "../../auth/types.js";
import { PERMISSIONS, roleHasPermission } from "../../auth/permissions.js";
import { PaymentForbiddenError } from "./payment.service.js";

type Db = NodePgDatabase<typeof schema>;

export class RefundListService {
  constructor(private readonly db: Db) {}

  async listPendingApprovals(auth: AuthContext, limit = 50) {
    if (!roleHasPermission(auth.role, PERMISSIONS.PAYMENT_REFUND)) {
      throw new PaymentForbiddenError("Insufficient permission");
    }
    const cap = Math.min(100, Math.max(1, limit));
    const rows = await this.db
      .select({
        refundId: schema.paymentRefunds.id,
        paymentId: schema.paymentRefunds.paymentId,
        amountMinor: schema.paymentRefunds.amountMinor,
        reason: schema.paymentRefunds.reason,
        status: schema.paymentRefunds.status,
        approvalStatus: schema.paymentRefunds.approvalStatus,
        createdAt: schema.paymentRefunds.createdAt,
        orderId: schema.payments.orderId,
        providerReference: schema.payments.providerReference,
      })
      .from(schema.paymentRefunds)
      .innerJoin(schema.payments, eq(schema.paymentRefunds.paymentId, schema.payments.id))
      .where(
        and(
          eq(schema.paymentRefunds.tenantId, auth.tenantId),
          eq(schema.paymentRefunds.approvalStatus, "PENDING"),
        ),
      )
      .orderBy(desc(schema.paymentRefunds.createdAt))
      .limit(cap);

    return rows.map((r) => ({
      id: r.refundId,
      paymentId: r.paymentId,
      orderId: r.orderId,
      amountMinor: r.amountMinor,
      reason: r.reason,
      status: r.status,
      approvalStatus: r.approvalStatus,
      providerReference: r.providerReference,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
