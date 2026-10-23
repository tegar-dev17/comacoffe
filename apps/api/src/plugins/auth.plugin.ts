import fp from "fastify-plugin";
import { jwtVerify, SignJWT } from "jose";
import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthContext } from "../modules/auth/types.js";
import * as schema from "../db/schema/index.js";
import { z } from "zod";

const authClaimsSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: z.string().min(1),
  outletId: z.string().uuid().nullable().optional(),
  email: z.string().min(3).max(320),
});

declare module "fastify" {
  interface FastifyInstance {
    signAuthToken: (ctx: AuthContext) => Promise<string>;
  }
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export default fp(async (app, opts: { jwtSecret: string }) => {
  const secret = new TextEncoder().encode(opts.jwtSecret);

  app.decorate("signAuthToken", async (ctx: AuthContext) => {
    return new SignJWT({ ...ctx })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("12h")
      .sign(secret);
  });

  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const header = request.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      const token = header.slice("Bearer ".length);
      try {
        const { payload } = await jwtVerify(token, secret, {
          algorithms: ["HS256"],
        });

        const parsed = authClaimsSchema.safeParse({
          userId: payload.userId,
          tenantId: payload.tenantId,
          role: payload.role,
          outletId: payload.outletId ?? null,
          email: payload.email,
        });
        if (!parsed.success) {
          return reply.status(401).send({ error: "Invalid token claims" });
        }

        const user = await app.db.query.users.findFirst({
          where: eq(schema.users.id, parsed.data.userId),
        });
        if (!user || user.tenantId !== parsed.data.tenantId) {
          return reply.status(401).send({ error: "Invalid token subject" });
        }
        if (user.role !== parsed.data.role || user.email !== parsed.data.email) {
          return reply.status(401).send({ error: "Stale token" });
        }
        if (parsed.data.outletId && user.outletId && user.outletId !== parsed.data.outletId) {
          return reply.status(401).send({ error: "Stale outlet claim" });
        }

        request.auth = {
          userId: parsed.data.userId,
          tenantId: parsed.data.tenantId,
          role: parsed.data.role,
          outletId: parsed.data.outletId ?? user.outletId,
          email: parsed.data.email,
        };
      } catch {
        return reply.status(401).send({ error: "Invalid token" });
      }
    },
  );
});

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
