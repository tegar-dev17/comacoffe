import { and, eq, isNull, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Env } from "../../../config/env.js";
import * as schema from "../../../db/schema/index.js";
import { EnvCredentialProvider } from "../credentials/env-credential.provider.js";
import type { ProviderRuntimeConfig } from "../providers/runtime-config.js";
import { fallbackRuntimeFromEnv } from "../providers/runtime-config.js";
import type { PaymentProvider } from "../types.js";

type Db = NodePgDatabase<typeof schema>;

export class MerchantConfigService {
  private readonly credentials = new EnvCredentialProvider();

  constructor(
    private readonly db: Db,
    private readonly env: Env,
  ) {}

  async resolveRuntimeConfig(params: {
    tenantId: string;
    outletId: string;
    provider: PaymentProvider;
  }): Promise<ProviderRuntimeConfig> {
    if (params.provider === "cash") {
      throw new Error("Cash has no provider runtime config");
    }

    const rows = await this.db
      .select()
      .from(schema.merchantProviderConfigs)
      .where(
        and(
          eq(schema.merchantProviderConfigs.tenantId, params.tenantId),
          eq(schema.merchantProviderConfigs.provider, params.provider),
          eq(schema.merchantProviderConfigs.status, "active"),
          or(
            eq(schema.merchantProviderConfigs.outletId, params.outletId),
            isNull(schema.merchantProviderConfigs.outletId),
          ),
        ),
      );

    const outletSpecific = rows.find((r) => r.outletId === params.outletId);
    const tenantWide = rows.find((r) => r.outletId === null);
    const config = outletSpecific ?? tenantWide;
    if (!config) {
      return fallbackRuntimeFromEnv(this.env, params.provider);
    }

    if (this.env.NODE_ENV === "production" && config.environment !== "production") {
      throw new Error("Sandbox provider configuration cannot be used in production");
    }
    if (config.environment === "production" && this.env.PAYMENT_ENV === "sandbox") {
      throw new Error("Production merchant config blocked while PAYMENT_ENV=sandbox");
    }

    const serverKey = await this.credentials.resolve(
      config.serverCredentialRef ??
        (params.provider === "midtrans" ? "env:MIDTRANS_SERVER_KEY" : "env:XENDIT_SECRET_KEY"),
    );
    const webhookToken = await this.credentials.resolve(
      config.webhookCredentialRef ??
        (params.provider === "xendit" ? "env:XENDIT_WEBHOOK_TOKEN" : undefined),
    );

    return {
      provider: params.provider,
      environment: config.environment,
      credentials: {
        serverKey,
        clientKey: await this.credentials.resolve(config.clientCredentialRef ?? "env:MIDTRANS_CLIENT_KEY"),
        webhookToken,
        apiBaseUrl: config.apiBaseUrl ?? undefined,
      },
    };
  }
}
