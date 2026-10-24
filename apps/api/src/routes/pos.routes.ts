import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { mapPaymentDomainError } from "../modules/payment/payment-errors.js";
import { resolvePosPaymentCapabilities } from "../modules/payment/payment-capabilities.js";
import {
  PosForbiddenError,
  PosService,
  PosValidationError,
} from "../modules/pos/pos.service.js";

const checkoutSchema = z.object({
  outletId: z.string().uuid(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
    }),
  ).min(1),
  paymentMethod: z.enum(["cash", "qris"]),
  idempotencyKey: z.string().min(8).max(128),
  provider: z.enum(["midtrans", "xendit"]).optional(),
  localOperationId: z.string().uuid().optional(),
  deviceId: z.string().max(128).optional(),
});

function mapPosError(err: unknown) {
  if (err instanceof PosValidationError) return { status: 400, body: { error: err.message } };
  if (err instanceof PosForbiddenError) return { status: 403, body: { error: err.message } };
  return null;
}

export async function registerPosRoutes(app: FastifyInstance, env: Env) {
  const pos = new PosService(app.db, env);

  app.get(
    "/api/v1/pos/capabilities",
    { preHandler: [app.authenticate] },
    async () => ({ data: resolvePosPaymentCapabilities(env) }),
  );

  app.post(
    "/api/v1/pos/checkout",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = checkoutSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        const result = await pos.checkout(request.auth!, parsed.data);
        return reply.status(201).send({ data: result });
      } catch (err) {
        const mapped = mapPosError(err) ?? mapPaymentDomainError(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        request.log.error({ err }, "pos checkout failed");
        const message = err instanceof Error ? err.message : "Internal server error";
        return reply.status(500).send({ error: message });
      }
    },
  );
}
