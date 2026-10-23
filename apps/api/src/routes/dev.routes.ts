import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { devRoutesEnabled } from "../config/runtime.js";
import * as schema from "../db/schema/index.js";

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
    const [admin] = await app.db
      .insert(schema.users)
      .values({
        tenantId: tenant!.id,
        email: "admin@demo.coffee",
        displayName: "Admin Demo",
        role: "admin",
        outletId: null,
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
      })
      .returning();

    return {
      tenantId: tenant!.id,
      outletId: outlet!.id,
      users: { admin: admin!.id, cashier: cashier!.id },
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
}
