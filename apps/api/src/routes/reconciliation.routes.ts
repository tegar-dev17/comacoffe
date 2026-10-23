import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { ReconciliationService } from "../modules/payment/services/reconciliation.service.js";
import { PaymentForbiddenError } from "../modules/payment/services/payment.service.js";

export async function registerReconciliationRoutes(app: FastifyInstance, env: Env) {
  const service = new ReconciliationService(app.db, env);

  app.post(
    "/api/v1/admin/reconciliation/run",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const body = (request.body ?? {}) as { tenantId?: string };
        const result = await service.runBatch(request.auth!, body.tenantId);
        return { data: result };
      } catch (err) {
        if (err instanceof PaymentForbiddenError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  app.get(
    "/api/v1/admin/reconciliation/exceptions",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const result = await service.listExceptions(request.auth!);
        return { data: result };
      } catch (err) {
        if (err instanceof PaymentForbiddenError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }
    },
  );
}
