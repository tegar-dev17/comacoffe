import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { PaymentService } from "../modules/payment/services/payment.service.js";
import { RefundService } from "../modules/payment/services/refund.service.js";
import {
  PaymentConflictError,
  PaymentForbiddenError,
  PaymentNotFoundError,
  PaymentValidationError,
} from "../modules/payment/services/payment.service.js";
import { ProviderCapabilityError } from "../modules/payment/providers/midtrans.adapter.js";

const createPaymentSchema = z.object({
  orderId: z.string().uuid(),
  paymentMethod: z.enum(["qris", "cash", "card", "ewallet", "other"]),
  idempotencyKey: z.string().min(8).max(128),
  provider: z.enum(["midtrans", "xendit"]).optional(),
  localOperationId: z.string().uuid().optional(),
  deviceId: z.string().max(128).optional(),
});

const refundSchema = z.object({
  amountMinor: z.number().int().positive(),
  reason: z.string().min(3).max(500),
  idempotencyKey: z.string().min(8).max(128),
});

function handlePaymentError(err: unknown) {
  if (err instanceof PaymentNotFoundError) return { status: 404, body: { error: err.message } };
  if (err instanceof PaymentForbiddenError) return { status: 403, body: { error: err.message } };
  if (err instanceof PaymentValidationError) return { status: 400, body: { error: err.message } };
  if (err instanceof PaymentConflictError) return { status: 409, body: { error: err.message } };
  if (err instanceof ProviderCapabilityError) return { status: 422, body: { error: err.message } };
  return { status: 500, body: { error: "Internal server error" } };
}

export async function registerPaymentRoutes(app: FastifyInstance, env: Env) {
  const paymentService = new PaymentService(app.db, env);
  const refundService = new RefundService(app.db, env);

  app.post(
    "/api/v1/payments",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = createPaymentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        const result = await paymentService.createPayment(request.auth!, parsed.data);
        return reply.status(201).send({ data: result });
      } catch (err) {
        const mapped = handlePaymentError(err);
        if (mapped.status === 500) request.log.error({ err }, "create payment failed");
        return reply.status(mapped.status).send(mapped.body);
      }
    },
  );

  app.get(
    "/api/v1/payments/:paymentId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { paymentId } = request.params as { paymentId: string };
      try {
        const result = await paymentService.getPayment(request.auth!, paymentId);
        return { data: result };
      } catch (err) {
        const mapped = handlePaymentError(err);
        return reply.status(mapped.status).send(mapped.body);
      }
    },
  );

  app.get(
    "/api/v1/payments/:paymentId/detail",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { paymentId } = request.params as { paymentId: string };
      try {
        const result = await paymentService.getPaymentDetail(request.auth!, paymentId);
        return { data: result };
      } catch (err) {
        const mapped = handlePaymentError(err);
        return reply.status(mapped.status).send(mapped.body);
      }
    },
  );

  app.get(
    "/api/v1/payments",
    { preHandler: [app.authenticate] },
    async (request) => {
      const q = request.query as Record<string, string | undefined>;
      const result = await paymentService.listPayments(request.auth!, {
        outletId: q.outletId,
        status: q.status,
        paymentMethod: q.paymentMethod,
        provider: q.provider,
        orderId: q.orderId,
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
        page: q.page ? Number(q.page) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
      });
      return result;
    },
  );

  app.post(
    "/api/v1/payments/:paymentId/refresh",
    {
      preHandler: [app.authenticate],
      config: {
        rateLimit: {
          max: env.PAYMENT_REFRESH_RATE_LIMIT_PER_MINUTE,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const { paymentId } = request.params as { paymentId: string };
      try {
        const result = await paymentService.refreshPayment(request.auth!, paymentId);
        return { data: result };
      } catch (err) {
        const mapped = handlePaymentError(err);
        return reply.status(mapped.status).send(mapped.body);
      }
    },
  );

  app.post(
    "/api/v1/payments/:paymentId/cancel",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { paymentId } = request.params as { paymentId: string };
      try {
        const result = await paymentService.cancelPayment(request.auth!, paymentId);
        return { data: result };
      } catch (err) {
        const mapped = handlePaymentError(err);
        return reply.status(mapped.status).send(mapped.body);
      }
    },
  );

  app.post(
    "/api/v1/payments/:paymentId/refunds",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = refundSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const { paymentId } = request.params as { paymentId: string };
      try {
        const result = await refundService.createRefund(request.auth!, paymentId, parsed.data);
        return reply.status(201).send({ data: result });
      } catch (err) {
        const mapped = handlePaymentError(err);
        return reply.status(mapped.status).send(mapped.body);
      }
    },
  );

  app.post(
    "/api/v1/payments/:paymentId/refunds/:refundId/approve",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { paymentId, refundId } = request.params as { paymentId: string; refundId: string };
      try {
        const result = await refundService.approveRefund(request.auth!, paymentId, refundId);
        return { data: result };
      } catch (err) {
        const mapped = handlePaymentError(err);
        return reply.status(mapped.status).send(mapped.body);
      }
    },
  );

  app.post(
    "/api/v1/payments/:paymentId/refunds/:refundId/reject",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = (request.body ?? {}) as { reason?: string };
      const { paymentId, refundId } = request.params as { paymentId: string; refundId: string };
      if (!body.reason || body.reason.length < 3) {
        return reply.status(400).send({ error: "reason required" });
      }
      try {
        const result = await refundService.rejectRefund(
          request.auth!,
          paymentId,
          refundId,
          body.reason,
        );
        return { data: result };
      } catch (err) {
        const mapped = handlePaymentError(err);
        return reply.status(mapped.status).send(mapped.body);
      }
    },
  );
}
