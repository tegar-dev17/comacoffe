import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  StaffForbiddenError,
  StaffService,
  StaffValidationError,
} from "../modules/staff/staff.service.js";

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(120),
  role: z.enum(["cashier", "supervisor", "admin"]),
  outletId: z.string().uuid().nullable().optional(),
});

const updateSchema = z.object({
  displayName: z.string().min(2).max(120).optional(),
  role: z.enum(["cashier", "supervisor", "admin"]).optional(),
  outletId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

const resetSchema = z.object({
  newPassword: z.string().min(8).max(128),
});

function mapErr(err: unknown) {
  if (err instanceof StaffValidationError) return { status: 400, body: { error: err.message } };
  if (err instanceof StaffForbiddenError) return { status: 403, body: { error: err.message } };
  return null;
}

export async function registerStaffRoutes(app: FastifyInstance) {
  const staff = new StaffService(app.db);

  app.get(
    "/api/v1/staff",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        return { data: await staff.listStaff(request.auth!) };
      } catch (err) {
        const mapped = mapErr(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );

  app.post(
    "/api/v1/staff",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
      try {
        const row = await staff.createStaff(request.auth!, parsed.data);
        return reply.status(201).send({ data: row });
      } catch (err) {
        const mapped = mapErr(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );

  app.patch(
    "/api/v1/staff/:userId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
      try {
        return { data: await staff.updateStaff(request.auth!, userId, parsed.data) };
      } catch (err) {
        const mapped = mapErr(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );

  app.post(
    "/api/v1/staff/:userId/reset-password",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const parsed = resetSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
      try {
        return { data: await staff.resetPassword(request.auth!, userId, parsed.data.newPassword) };
      } catch (err) {
        const mapped = mapErr(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );
}
