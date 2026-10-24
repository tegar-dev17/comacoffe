import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import {
  MerchantConfigAdminService,
  MerchantConfigForbiddenError,
} from "../modules/payment/services/merchant-config-admin.service.js";

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  outletId: z.string().uuid().nullable().optional(),
  provider: z.enum(["midtrans", "xendit"]),
  environment: z.enum(["sandbox", "production"]),
  merchantReference: z.string().max(120).nullable().optional(),
  enabledMethods: z.array(z.string()).optional(),
  serverCredentialRef: z.string().max(200).nullable().optional(),
  clientCredentialRef: z.string().max(200).nullable().optional(),
  webhookCredentialRef: z.string().max(200).nullable().optional(),
  apiBaseUrl: z.string().url().nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export async function registerMerchantConfigRoutes(app: FastifyInstance, env: Env) {
  const admin = new MerchantConfigAdminService(app.db, env);

  app.get(
    "/api/v1/admin/merchant-configs",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        return { data: await admin.listConfigs(request.auth!) };
      } catch (err) {
        if (err instanceof MerchantConfigForbiddenError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  app.get(
    "/api/v1/admin/merchant-configs/status",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        return { data: admin.statusSummary(request.auth!) };
      } catch (err) {
        if (err instanceof MerchantConfigForbiddenError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  app.put(
    "/api/v1/admin/merchant-configs",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = upsertSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
      try {
        const row = await admin.upsertConfig(request.auth!, parsed.data);
        return { data: { id: row.id, provider: row.provider, environment: row.environment, status: row.status } };
      } catch (err) {
        if (err instanceof MerchantConfigForbiddenError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }
    },
  );
}
