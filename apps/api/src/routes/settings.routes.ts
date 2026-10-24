import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import {
  SettingsForbiddenError,
  SettingsService,
  SettingsValidationError,
} from "../modules/settings/settings.service.js";
import { PERMISSIONS, roleHasPermission } from "../modules/auth/permissions.js";

const updateSchema = z.object({
  businessName: z.string().max(200).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().nullable().optional(),
  receiptFooter: z.string().max(500).nullable().optional(),
  timezone: z.string().max(64).optional(),
  currency: z.string().length(3).optional(),
  taxRateBps: z.number().int().min(0).max(10_000).optional(),
  serviceChargeBps: z.number().int().min(0).max(10_000).optional(),
  requireOpenShift: z.boolean().optional(),
});

function mapErr(err: unknown) {
  if (err instanceof SettingsValidationError) return { status: 400, body: { error: err.message } };
  if (err instanceof SettingsForbiddenError) return { status: 403, body: { error: err.message } };
  return null;
}

export async function registerSettingsRoutes(app: FastifyInstance, env: Env) {
  const settings = new SettingsService(app.db);

  app.get(
    "/api/v1/settings",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!roleHasPermission(request.auth!.role, PERMISSIONS.SETTINGS_MANAGE)) {
        return reply.status(403).send({ error: "Insufficient permission" });
      }
      try {
        return { data: await settings.getSettings(request.auth!) };
      } catch (err) {
        const mapped = mapErr(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );

  app.put(
    "/api/v1/settings",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
      try {
        return { data: await settings.updateSettings(request.auth!, parsed.data) };
      } catch (err) {
        const mapped = mapErr(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );

  app.get(
    "/api/v1/settings/payment-provider",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        return {
          data: await settings.paymentProviderStatus(request.auth!, {
            PAYMENT_PROVIDER: env.PAYMENT_PROVIDER,
          }),
        };
      } catch (err) {
        const mapped = mapErr(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );
}
