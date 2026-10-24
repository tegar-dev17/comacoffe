import type { FastifyInstance } from "fastify";
import { RefundListService } from "../modules/payment/services/refund-list.service.js";
import { mapPaymentDomainError } from "../modules/payment/payment-errors.js";

export async function registerRefundRoutes(app: FastifyInstance) {
  const list = new RefundListService(app.db);

  app.get(
    "/api/v1/refunds/pending",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const qs = request.query as { limit?: string };
      try {
        const data = await list.listPendingApprovals(
          request.auth!,
          qs.limit ? Number(qs.limit) : 50,
        );
        return { data };
      } catch (err) {
        const mapped = mapPaymentDomainError(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );
}
