import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../db/schema/index.js";
import { setupIntegrationDb } from "../../test/setup.integration.js";
import type { AppDatabase } from "../../db/client.js";
import type pg from "pg";
import { ShiftService } from "./shift.service.js";

describe("cashier shifts", () => {
  let db: AppDatabase;
  let pool: pg.Pool;
  let auth: { userId: string; tenantId: string; role: string; outletId: string; email: string };
  let outletId: string;

  beforeAll(async () => {
    const setup = await setupIntegrationDb();
    db = setup.db;
    pool = setup.pool;
    const suffix = crypto.randomUUID().slice(0, 8);
    const [tenant] = await db
      .insert(schema.tenants)
      .values({ name: "Shift Test", slug: `shift-${suffix}` })
      .returning();
    const [outlet] = await db
      .insert(schema.outlets)
      .values({ tenantId: tenant!.id, name: "Outlet", code: `SH-${suffix}` })
      .returning();
    outletId = outlet!.id;
    const [user] = await db
      .insert(schema.users)
      .values({
        tenantId: tenant!.id,
        email: `cashier-${suffix}@example.com`,
        displayName: "Cashier",
        role: "cashier",
        outletId: outlet!.id,
      })
      .returning();
    auth = {
      userId: user!.id,
      tenantId: tenant!.id,
      role: "cashier",
      outletId: outlet!.id,
      email: user!.email,
    };
  });

  afterAll(async () => {
    await pool.end();
  });

  it("opens and closes with variance", async () => {
    const shifts = new ShiftService(db);
    const open = await shifts.openShift(auth, { outletId, openingCashMinor: 50_000 });
    const closed = await shifts.closeShift(auth, open.id, { countedCashMinor: 48_000 });
    expect(closed.status).toBe("closed");
    expect(closed.cashVarianceMinor).toBe(-2000);
  });
});
