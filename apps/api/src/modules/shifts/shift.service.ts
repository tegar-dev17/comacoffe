import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema/index.js";
import type { AuthContext } from "../auth/types.js";
import { PERMISSIONS, roleHasPermission } from "../auth/permissions.js";
import { writeAuditLog } from "../audit/audit.service.js";

type Db = NodePgDatabase<typeof schema>;

export class ShiftForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShiftForbiddenError";
  }
}

export class ShiftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShiftValidationError";
  }
}

export class ShiftService {
  constructor(private readonly db: Db) {}

  private assertShiftAccess(auth: AuthContext) {
    if (!roleHasPermission(auth.role, PERMISSIONS.SHIFT_MANAGE)) {
      throw new ShiftForbiddenError("Insufficient permission");
    }
  }

  async getOpenShift(auth: AuthContext, outletId: string) {
    this.assertShiftAccess(auth);
    if (auth.outletId && auth.role === "cashier" && outletId !== auth.outletId) {
      throw new ShiftForbiddenError("Outlet access denied");
    }
    return this.db.query.cashierShifts.findFirst({
      where: and(
        eq(schema.cashierShifts.tenantId, auth.tenantId),
        eq(schema.cashierShifts.outletId, outletId),
        eq(schema.cashierShifts.status, "open"),
      ),
    });
  }

  async openShift(
    auth: AuthContext,
    input: { outletId: string; openingCashMinor: number; notes?: string },
  ) {
    this.assertShiftAccess(auth);
    if (auth.outletId && auth.role === "cashier" && input.outletId !== auth.outletId) {
      throw new ShiftForbiddenError("Outlet access denied");
    }
    if (input.openingCashMinor < 0) {
      throw new ShiftValidationError("Opening cash cannot be negative");
    }

    const existing = await this.getOpenShift(auth, input.outletId);
    if (existing) {
      throw new ShiftValidationError("A shift is already open for this outlet");
    }

    const [shift] = await this.db
      .insert(schema.cashierShifts)
      .values({
        tenantId: auth.tenantId,
        outletId: input.outletId,
        cashierUserId: auth.userId,
        status: "open",
        openingCashMinor: input.openingCashMinor,
        notes: input.notes ?? null,
      })
      .returning();

    await writeAuditLog(this.db, {
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "shift.open",
      resourceType: "cashier_shift",
      resourceId: shift!.id,
    });

    return shift!;
  }

  async recordCashEvent(
    db: Db,
    input: {
      tenantId: string;
      shiftId: string;
      eventType: "sale" | "cash_in" | "cash_out";
      amountMinor: number;
      reason?: string;
      orderId?: string;
      actorUserId?: string;
    },
  ) {
    await db.insert(schema.shiftCashEvents).values({
      shiftId: input.shiftId,
      tenantId: input.tenantId,
      eventType: input.eventType,
      amountMinor: input.amountMinor,
      reason: input.reason ?? null,
      orderId: input.orderId ?? null,
      actorUserId: input.actorUserId ?? null,
    });
  }

  async recordCashSaleIfOpen(
    auth: AuthContext,
    outletId: string,
    orderId: string,
    amountMinor: number,
  ) {
    const open = await this.db.query.cashierShifts.findFirst({
      where: and(
        eq(schema.cashierShifts.tenantId, auth.tenantId),
        eq(schema.cashierShifts.outletId, outletId),
        eq(schema.cashierShifts.status, "open"),
      ),
    });
    if (!open) return;
    await this.recordCashEvent(this.db, {
      tenantId: auth.tenantId,
      shiftId: open.id,
      eventType: "sale",
      amountMinor,
      orderId,
      actorUserId: auth.userId,
    });
  }

  async addCashMovement(
    auth: AuthContext,
    shiftId: string,
    input: { eventType: "cash_in" | "cash_out"; amountMinor: number; reason: string },
  ) {
    this.assertShiftAccess(auth);
    if (input.amountMinor <= 0) throw new ShiftValidationError("Amount must be positive");
    const shift = await this.db.query.cashierShifts.findFirst({
      where: and(
        eq(schema.cashierShifts.id, shiftId),
        eq(schema.cashierShifts.tenantId, auth.tenantId),
        eq(schema.cashierShifts.status, "open"),
      ),
    });
    if (!shift) throw new ShiftValidationError("Open shift not found");
    if (auth.outletId && auth.role === "cashier" && shift.outletId !== auth.outletId) {
      throw new ShiftForbiddenError("Outlet access denied");
    }

    await this.recordCashEvent(this.db, {
      tenantId: auth.tenantId,
      shiftId,
      eventType: input.eventType,
      amountMinor: input.amountMinor,
      reason: input.reason,
      actorUserId: auth.userId,
    });

    return { ok: true };
  }

  private async computeExpectedCash(shiftId: string): Promise<number> {
    const shift = await this.db.query.cashierShifts.findFirst({
      where: eq(schema.cashierShifts.id, shiftId),
    });
    if (!shift) return 0;

    const [agg] = await this.db
      .select({
        net: sql<number>`coalesce(sum(case when ${schema.shiftCashEvents.eventType} = 'cash_out' then -${schema.shiftCashEvents.amountMinor} else ${schema.shiftCashEvents.amountMinor} end), 0)::int`,
      })
      .from(schema.shiftCashEvents)
      .where(eq(schema.shiftCashEvents.shiftId, shiftId));

    return shift.openingCashMinor + (agg?.net ?? 0);
  }

  async closeShift(
    auth: AuthContext,
    shiftId: string,
    input: { countedCashMinor: number; notes?: string },
  ) {
    this.assertShiftAccess(auth);
    if (input.countedCashMinor < 0) {
      throw new ShiftValidationError("Counted cash cannot be negative");
    }

    const shift = await this.db.query.cashierShifts.findFirst({
      where: and(
        eq(schema.cashierShifts.id, shiftId),
        eq(schema.cashierShifts.tenantId, auth.tenantId),
        eq(schema.cashierShifts.status, "open"),
      ),
    });
    if (!shift) throw new ShiftValidationError("Open shift not found");
    if (auth.outletId && auth.role === "cashier" && shift.outletId !== auth.outletId) {
      throw new ShiftForbiddenError("Outlet access denied");
    }

    const expected = await this.computeExpectedCash(shiftId);
    const variance = input.countedCashMinor - expected;
    const now = new Date();

    const [closed] = await this.db
      .update(schema.cashierShifts)
      .set({
        status: "closed",
        closedAt: now,
        expectedCashMinor: expected,
        countedCashMinor: input.countedCashMinor,
        cashVarianceMinor: variance,
        notes: input.notes ?? shift.notes,
        updatedAt: now,
      })
      .where(eq(schema.cashierShifts.id, shiftId))
      .returning();

    await writeAuditLog(this.db, {
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "shift.close",
      resourceType: "cashier_shift",
      resourceId: shiftId,
      metadata: { varianceMinor: variance },
    });

    return closed!;
  }

  async listShifts(auth: AuthContext, outletId?: string, limit = 20) {
    this.assertShiftAccess(auth);
    const conditions = [eq(schema.cashierShifts.tenantId, auth.tenantId)];
    if (outletId) conditions.push(eq(schema.cashierShifts.outletId, outletId));
    if (auth.outletId && auth.role === "cashier") {
      conditions.push(eq(schema.cashierShifts.outletId, auth.outletId));
    }

    return this.db.query.cashierShifts.findMany({
      where: and(...conditions),
      orderBy: desc(schema.cashierShifts.openedAt),
      limit: Math.min(100, limit),
    });
  }
}
