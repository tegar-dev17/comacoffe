import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema/index.js";
import type { AuthContext } from "../auth/types.js";
import { PERMISSIONS, roleHasPermission } from "../auth/permissions.js";

type Db = NodePgDatabase<typeof schema>;

export class ReportsForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportsForbiddenError";
  }
}

export class ReportsService {
  constructor(private readonly db: Db) {}

  private assertPermission(auth: AuthContext) {
    if (!roleHasPermission(auth.role, PERMISSIONS.REPORT_READ)) {
      throw new ReportsForbiddenError("Insufficient permission");
    }
  }

  async salesSummary(
    auth: AuthContext,
    params: { from: Date; to: Date; outletId?: string },
  ) {
    this.assertPermission(auth);

    const orderFilters = [
      eq(schema.orders.tenantId, auth.tenantId),
      eq(schema.orders.status, "paid"),
      gte(schema.orders.paidAt, params.from),
      lte(schema.orders.paidAt, params.to),
    ];
    if (params.outletId) {
      orderFilters.push(eq(schema.orders.outletId, params.outletId));
    }

    const [totals] = await this.db
      .select({
        transactionCount: sql<number>`count(*)::int`,
        grossMinor: sql<number>`coalesce(sum(${schema.orders.totalMinor}), 0)::int`,
      })
      .from(schema.orders)
      .where(and(...orderFilters));

    const count = totals?.transactionCount ?? 0;
    const grossMinor = totals?.grossMinor ?? 0;
    const avgMinor = count > 0 ? Math.round(grossMinor / count) : 0;

    const paymentRows = await this.db
      .select({
        paymentMethod: schema.payments.paymentMethod,
        totalMinor: sql<number>`coalesce(sum(${schema.payments.amountMinor}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.payments)
      .innerJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
      .where(
        and(
          eq(schema.payments.tenantId, auth.tenantId),
          eq(schema.payments.status, "SUCCEEDED"),
          ...orderFilters.slice(1),
        ),
      )
      .groupBy(schema.payments.paymentMethod);

    const topProducts = await this.db
      .select({
        productName: schema.orderItems.productName,
        quantity: sql<number>`coalesce(sum(${schema.orderItems.quantity}), 0)::int`,
        revenueMinor: sql<number>`coalesce(sum(${schema.orderItems.lineTotalMinor}), 0)::int`,
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .where(and(...orderFilters))
      .groupBy(schema.orderItems.productName)
      .orderBy(desc(sql`sum(${schema.orderItems.quantity})`))
      .limit(5);

    const recentOrders = await this.db.query.orders.findMany({
      where: and(...orderFilters),
      orderBy: desc(schema.orders.paidAt),
      limit: 10,
    });

    return {
      period: { from: params.from.toISOString(), to: params.to.toISOString() },
      transactionCount: count,
      grossSalesMinor: grossMinor,
      averageTicketMinor: avgMinor,
      paymentMethods: paymentRows.map((r) => ({
        method: r.paymentMethod,
        count: r.count,
        totalMinor: r.totalMinor,
      })),
      topProducts: topProducts.map((p) => ({
        name: p.productName,
        quantity: p.quantity,
        revenueMinor: p.revenueMinor,
      })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        totalMinor: o.totalMinor,
        paidAt: o.paidAt?.toISOString() ?? null,
        outletId: o.outletId,
      })),
    };
  }
}
