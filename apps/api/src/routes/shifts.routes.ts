import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ShiftForbiddenError,
  ShiftService,
  ShiftValidationError,
} from "../modules/shifts/shift.service.js";

const openSchema = z.object({
  outletId: z.string().uuid(),
  openingCashMinor: z.number().int().min(0),
  notes: z.string().max(500).optional(),
});

const closeSchema = z.object({
  countedCashMinor: z.number().int().min(0),
  notes: z.string().max(500).optional(),
});

const cashEventSchema = z.object({
  eventType: z.enum(["cash_in", "cash_out"]),
  amountMinor: z.number().int().positive(),
  reason: z.string().min(3).max(200),
});

function mapErr(err: unknown) {
  if (err instanceof ShiftValidationError) return { status: 400, body: { error: err.message } };
  if (err instanceof ShiftForbiddenError) return { status: 403, body: { error: err.message } };
  return null;
}

export async function registerShiftRoutes(app: FastifyInstance) {
  const shifts = new ShiftService(app.db);

  app.get(
    "/api/v1/shifts/current",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const qs = request.query as { outletId?: string };
      if (!qs.outletId) return reply.status(400).send({ error: "outletId required" });
      try {
        const row = await shifts.getOpenShift(request.auth!, qs.outletId);
        return { data: row ?? null };
      } catch (err) {
        const mapped = mapErr(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );

  app.get(
    "/api/v1/shifts",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const qs = request.query as { outletId?: string; limit?: string };
      try {
        const rows = await shifts.listShifts(
          request.auth!,
          qs.outletId,
          qs.limit ? Number(qs.limit) : 20,
        );
        return { data: rows };
      } catch (err) {
        const mapped = mapErr(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );

  app.post(
    "/api/v1/shifts/open",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = openSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
      try {
        const row = await shifts.openShift(request.auth!, parsed.data);
        return reply.status(201).send({ data: row });
      } catch (err) {
        const mapped = mapErr(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );

  app.post(
    "/api/v1/shifts/:shiftId/close",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { shiftId } = request.params as { shiftId: string };
      const parsed = closeSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
      try {
        return { data: await shifts.closeShift(request.auth!, shiftId, parsed.data) };
      } catch (err) {
        const mapped = mapErr(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );

  app.post(
    "/api/v1/shifts/:shiftId/cash-events",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { shiftId } = request.params as { shiftId: string };
      const parsed = cashEventSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
      try {
        return {
          data: await shifts.addCashMovement(request.auth!, shiftId, parsed.data),
        };
      } catch (err) {
        const mapped = mapErr(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );
}
