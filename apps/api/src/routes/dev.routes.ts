import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { devRoutesEnabled } from "../config/runtime.js";
import * as schema from "../db/schema/index.js";
import { hashPassword } from "../modules/auth/password.js";
import { PaymentService } from "../modules/payment/services/payment.service.js";

const DEMO_PASSWORD = "demo1234";

async function seedDemoCatalog(
  app: FastifyInstance,
  tenantId: string,
  outletId: string,
) {
  const [coffeeCat] = await app.db
    .insert(schema.productCategories)
    .values({ tenantId, name: "Coffee", sortOrder: 1 })
    .returning();
  const [pastryCat] = await app.db
    .insert(schema.productCategories)
    .values({ tenantId, name: "Pastry", sortOrder: 2 })
    .returning();

  const catalog = [
    { name: "Espresso", sku: "ESP-001", priceMinor: 18000, categoryId: coffeeCat!.id },
    { name: "Cappuccino", sku: "CAP-001", priceMinor: 28000, categoryId: coffeeCat!.id },
    { name: "Latte", sku: "LAT-001", priceMinor: 30000, categoryId: coffeeCat!.id },
    { name: "Croissant", sku: "CRO-001", priceMinor: 22000, categoryId: pastryCat!.id },
    { name: "Chocolate Muffin", sku: "MUF-001", priceMinor: 25000, categoryId: pastryCat!.id },
  ];

  for (const item of catalog) {
    const [product] = await app.db
      .insert(schema.products)
      .values({ tenantId, ...item })
      .returning();
    await app.db.insert(schema.outletProductStock).values({
      outletId,
      productId: product!.id,
      quantityOnHand: 50,
    });
  }
}

/** Development-only helpers for obtaining JWT and seeding demo tenant. */
export async function registerDevRoutes(app: FastifyInstance, env: Env) {
  if (!devRoutesEnabled(env)) {
    return;
  }

  app.post("/api/v1/dev/bootstrap", async (_request, reply) => {
    if (!devRoutesEnabled(env)) {
      return reply.status(404).send({ error: "Not found" });
    }

    const existing = await app.db.query.tenants.findFirst({
      where: eq(schema.tenants.slug, "demo-coffee"),
    });
    if (existing) {
      return reply.send({ message: "Already bootstrapped", tenantId: existing.id });
    }

    const [tenant] = await app.db
      .insert(schema.tenants)
      .values({ name: "Demo Coffee", slug: "demo-coffee" })
      .returning();
    const [outlet] = await app.db
      .insert(schema.outlets)
      .values({ tenantId: tenant!.id, name: "Senayan", code: "SNY01" })
      .returning();
    const passwordHash = hashPassword(DEMO_PASSWORD);
    const [admin] = await app.db
      .insert(schema.users)
      .values({
        tenantId: tenant!.id,
        email: "admin@demo.coffee",
        displayName: "Admin Demo",
        role: "admin",
        outletId: null,
        passwordHash,
      })
      .returning();
    const [cashier] = await app.db
      .insert(schema.users)
      .values({
        tenantId: tenant!.id,
        email: "cashier@demo.coffee",
        displayName: "Kasir Demo",
        role: "cashier",
        outletId: outlet!.id,
        passwordHash,
      })
      .returning();

    await seedDemoCatalog(app, tenant!.id, outlet!.id);

    return {
      tenantId: tenant!.id,
      outletId: outlet!.id,
      users: { admin: admin!.id, cashier: cashier!.id },
      login: {
        adminEmail: "admin@demo.coffee",
        cashierEmail: "cashier@demo.coffee",
        password: DEMO_PASSWORD,
      },
    };
  });

  app.post("/api/v1/dev/token", async (request, reply) => {
    if (!devRoutesEnabled(env)) {
      return reply.status(404).send({ error: "Not found" });
    }
    const body = request.body as { userId?: string };
    if (!body.userId) {
      return reply.status(400).send({ error: "userId required" });
    }
    const user = await app.db.query.users.findFirst({
      where: eq(schema.users.id, body.userId),
    });
    if (!user) return reply.status(404).send({ error: "User not found" });
    const token = await app.signAuthToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      outletId: user.outletId,
      email: user.email,
    });
    return { token };
  });

  app.post("/api/v1/dev/payments/:paymentId/simulate-success", async (request, reply) => {
    if (!devRoutesEnabled(env)) {
      return reply.status(404).send({ error: "Not found" });
    }
    const { paymentId } = request.params as { paymentId: string };
    const payment = await app.db.query.payments.findFirst({
      where: eq(schema.payments.id, paymentId),
    });
    if (!payment) return reply.status(404).send({ error: "Payment not found" });

    const payments = new PaymentService(app.db, env);
    await payments.applyStatusTransition(payment, "SUCCEEDED", "dev.simulate", undefined, {
      simulated: true,
    });
    const updated = await app.db.query.payments.findFirst({
      where: eq(schema.payments.id, paymentId),
    });
    return {
      data: {
        paymentId,
        status: updated?.status,
        orderId: payment.orderId,
      },
    };
  });
}
