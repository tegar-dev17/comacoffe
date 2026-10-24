import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as schema from "../db/schema/index.js";
import { verifyPassword } from "../modules/auth/password.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await app.db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const token = await app.signAuthToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      outletId: user.outletId,
      email: user.email,
    });

    return {
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          outletId: user.outletId,
          tenantId: user.tenantId,
        },
      },
    };
  });

  app.get("/api/v1/auth/me", { preHandler: [app.authenticate] }, async (request) => {
    const auth = request.auth!;
    const user = await app.db.query.users.findFirst({
      where: and(eq(schema.users.id, auth.userId), eq(schema.users.tenantId, auth.tenantId)),
    });
    return {
      data: {
        id: auth.userId,
        email: auth.email,
        displayName: user?.displayName ?? auth.email,
        role: auth.role,
        outletId: auth.outletId,
        tenantId: auth.tenantId,
      },
    };
  });
}
