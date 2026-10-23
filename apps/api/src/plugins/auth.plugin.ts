import fp from "fastify-plugin";
import { jwtVerify, SignJWT } from "jose";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthContext } from "../modules/auth/types.js";

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
        const { payload } = await jwtVerify(token, secret);
        request.auth = {
          userId: String(payload.userId),
          tenantId: String(payload.tenantId),
          role: String(payload.role),
          outletId: payload.outletId ? String(payload.outletId) : null,
          email: String(payload.email),
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
