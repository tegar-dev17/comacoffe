import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../../config/env.js";
import * as schema from "../../db/schema/index.js";
import { setupIntegrationDb } from "../../test/setup.integration.js";
import type { AppDatabase } from "../../db/client.js";
import type pg from "pg";
import {
  PaymentConflictError,
  PaymentService,
  PaymentValidationError,
} from "./services/payment.service.js";
import { DUPLICATE_ACTIVE_PAYMENT_MESSAGE } from "./active-payment-statuses.js";

describe("duplicate active payment protection", () => {
  let db: AppDatabase;
  let pool: pg.Pool;
  let admin: { userId: string; tenantId: string; role: string; outletId: null; email: string };
  let orderId: string;

  beforeAll(async () => {
    const setup = await setupIntegrationDb();
    db = setup.db;
    pool = setup.pool;
    const suffix = crypto.randomUUID().slice(0, 8);

    const [tenant] = await db
      .insert(schema.tenants)
      .values({ name: "Dup Test", slug: `dup-${suffix}` })
      .returning();
    const [outlet] = await db
      .insert(schema.outlets)
      .values({ tenantId: tenant!.id, name: "O1", code: `O1-${suffix}` })
      .returning();
    const [user] = await db
      .insert(schema.users)
      .values({
        tenantId: tenant!.id,
        email: `admin-${suffix}@example.com`,
        displayName: "Admin",
        role: "admin",
      })
      .returning();

    admin = {
      userId: user!.id,
      tenantId: tenant!.id,
      role: "admin",
      outletId: null,
      email: user!.email,
    };

    const [order] = await db
      .insert(schema.orders)
      .values({
        tenantId: tenant!.id,
        outletId: outlet!.id,
        orderNumber: `ORD-DUP-${suffix}`,
        totalMinor: 15000,
        currency: "IDR",
        status: "pending_payment",
      })
      .returning();
    orderId = order!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function freshOrder(): Promise<string> {
    const suffix = crypto.randomUUID().slice(0, 8);
    const outlet = await db.query.outlets.findFirst({
      where: eq(schema.outlets.tenantId, admin.tenantId),
    });
    const [order] = await db
      .insert(schema.orders)
      .values({
        tenantId: admin.tenantId,
        outletId: outlet!.id,
        orderNumber: `ORD-${suffix}`,
        totalMinor: 12000,
        currency: "IDR",
        status: "pending_payment",
      })
      .returning();
    return order!.id;
  }

  it("allows the first payment for an order", async () => {
    const env = loadEnv();
    const service = new PaymentService(db, env);
    const oid = await freshOrder();
    const result = await service.createPayment(admin, {
      orderId: oid,
      paymentMethod: "cash",
      idempotencyKey: `first-${crypto.randomUUID()}`,
    });
    expect((result as { status: string }).status).toBe("SUCCEEDED");
  });

  it("rejects a second active payment with a different idempotency key (409)", async () => {
    const env = loadEnv();
    const service = new PaymentService(db, env);
    const oid = await freshOrder();
    await db.insert(schema.payments).values({
      tenantId: admin.tenantId,
      outletId: (await db.query.outlets.findFirst({
        where: eq(schema.outlets.tenantId, admin.tenantId),
      }))!.id,
      orderId: oid,
      provider: "midtrans",
      idempotencyKey: `seed-${crypto.randomUUID()}`,
      paymentMethod: "qris",
      amountMinor: 12000,
      currency: "IDR",
      status: "PENDING",
      providerReference: `REF-${crypto.randomUUID().slice(0, 8)}`,
      providerPaymentId: `tx-${crypto.randomUUID()}`,
    });

    await expect(
      service.createPayment(admin, {
        orderId: oid,
        paymentMethod: "cash",
        idempotencyKey: `second-${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({
      name: "PaymentConflictError",
      message: DUPLICATE_ACTIVE_PAYMENT_MESSAGE,
    });
  });

  it("returns the same result for repeated idempotency key", async () => {
    const env = loadEnv();
    const service = new PaymentService(db, env);
    const oid = await freshOrder();
    const key = `idem-repeat-${crypto.randomUUID()}`;
    const first = await service.createPayment(admin, {
      orderId: oid,
      paymentMethod: "cash",
      idempotencyKey: key,
    });
    const second = await service.createPayment(admin, {
      orderId: oid,
      paymentMethod: "cash",
      idempotencyKey: key,
    });
    expect(second).toEqual(first);
  });

  it("allows a new payment after the previous one failed", async () => {
    const env = loadEnv();
    const service = new PaymentService(db, env);
    const oid = await freshOrder();
    const outlet = await db.query.outlets.findFirst({
      where: eq(schema.outlets.tenantId, admin.tenantId),
    });

    await db.insert(schema.payments).values({
      tenantId: admin.tenantId,
      outletId: outlet!.id,
      orderId: oid,
      provider: "midtrans",
      idempotencyKey: `failed-${crypto.randomUUID()}`,
      paymentMethod: "qris",
      amountMinor: 12000,
      currency: "IDR",
      status: "FAILED",
      providerReference: `REF-F-${crypto.randomUUID().slice(0, 8)}`,
      providerPaymentId: `tx-f-${crypto.randomUUID()}`,
    });

    const result = await service.createPayment(admin, {
      orderId: oid,
      paymentMethod: "cash",
      idempotencyKey: `after-fail-${crypto.randomUUID()}`,
    });
    expect((result as { status: string }).status).toBe("SUCCEEDED");
  });

  it("prevents concurrent creation of two active payments", async () => {
    const env = loadEnv();
    const service = new PaymentService(db, env);
    const oid = await freshOrder();

    const results = await Promise.allSettled([
      service.createPayment(admin, {
        orderId: oid,
        paymentMethod: "cash",
        idempotencyKey: `race-a-${crypto.randomUUID()}`,
      }),
      service.createPayment(admin, {
        orderId: oid,
        paymentMethod: "cash",
        idempotencyKey: `race-b-${crypto.randomUUID()}`,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(
      err instanceof PaymentConflictError || err instanceof PaymentValidationError,
    ).toBe(true);

    const orderPayments = await db.query.payments.findMany({
      where: eq(schema.payments.orderId, oid),
    });
    expect(orderPayments).toHaveLength(1);
    expect((fulfilled[0] as PromiseFulfilledResult<{ status: string }>).value.status).toBe(
      "SUCCEEDED",
    );
  });

  it("cash payment regression on shared beforeAll order", async () => {
    const env = loadEnv();
    const service = new PaymentService(db, env);
    const result = await service.createPayment(admin, {
      orderId,
      paymentMethod: "cash",
      idempotencyKey: `cash-reg-${crypto.randomUUID()}`,
    });
    expect((result as { status: string }).status).toBe("SUCCEEDED");
    const order = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, admin.tenantId)),
    });
    expect(order?.status).toBe("paid");
  });
});
