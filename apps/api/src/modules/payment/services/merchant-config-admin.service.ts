import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Env } from "../../../config/env.js";
import * as schema from "../../../db/schema/index.js";
import type { AuthContext } from "../../auth/types.js";
import { PERMISSIONS, roleHasPermission } from "../../auth/permissions.js";
import { writeAuditLog } from "../../audit/audit.service.js";
import { resolvePosPaymentCapabilities } from "../payment-capabilities.js";

type Db = NodePgDatabase<typeof schema>;

export class MerchantConfigForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MerchantConfigForbiddenError";
  }
}

export class MerchantConfigAdminService {
  constructor(
    private readonly db: Db,
    private readonly env: Env,
  ) {}

  private assertConfigure(auth: AuthContext) {
    if (!roleHasPermission(auth.role, PERMISSIONS.PAYMENT_PROVIDER_CONFIGURE)) {
      throw new MerchantConfigForbiddenError("Insufficient permission");
    }
  }

  async listConfigs(auth: AuthContext) {
    this.assertConfigure(auth);
    const rows = await this.db.query.merchantProviderConfigs.findMany({
      where: eq(schema.merchantProviderConfigs.tenantId, auth.tenantId),
    });
    return rows.map((r) => ({
      id: r.id,
      outletId: r.outletId,
      provider: r.provider,
      environment: r.environment,
      merchantReference: r.merchantReference,
      enabledMethods: r.enabledMethods,
      serverCredentialRef: r.serverCredentialRef,
      clientCredentialRef: r.clientCredentialRef,
      webhookCredentialRef: r.webhookCredentialRef,
      apiBaseUrl: r.apiBaseUrl,
      status: r.status,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async upsertConfig(
    auth: AuthContext,
    input: {
      id?: string;
      outletId?: string | null;
      provider: "midtrans" | "xendit";
      environment: "sandbox" | "production";
      merchantReference?: string | null;
      enabledMethods?: string[];
      serverCredentialRef?: string | null;
      clientCredentialRef?: string | null;
      webhookCredentialRef?: string | null;
      apiBaseUrl?: string | null;
      status?: "active" | "inactive";
    },
  ) {
    this.assertConfigure(auth);
    const now = new Date();
    const values = {
      tenantId: auth.tenantId,
      outletId: input.outletId ?? null,
      provider: input.provider,
      environment: input.environment,
      merchantReference: input.merchantReference ?? null,
      enabledMethods: input.enabledMethods ?? ["qris"],
      serverCredentialRef: input.serverCredentialRef ?? `env:${input.provider === "midtrans" ? "MIDTRANS_SERVER_KEY" : "XENDIT_SECRET_KEY"}`,
      clientCredentialRef: input.clientCredentialRef ?? null,
      webhookCredentialRef: input.webhookCredentialRef ?? null,
      apiBaseUrl: input.apiBaseUrl ?? null,
      status: input.status ?? "active",
      updatedByUserId: auth.userId,
      updatedAt: now,
    };

    let row;
    if (input.id) {
      [row] = await this.db
        .update(schema.merchantProviderConfigs)
        .set(values)
        .where(
          and(
            eq(schema.merchantProviderConfigs.id, input.id),
            eq(schema.merchantProviderConfigs.tenantId, auth.tenantId),
          ),
        )
        .returning();
    } else {
      [row] = await this.db
        .insert(schema.merchantProviderConfigs)
        .values({ ...values, createdByUserId: auth.userId })
        .returning();
    }

    await writeAuditLog(this.db, {
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "merchant_config.upsert",
      resourceType: "merchant_provider_config",
      resourceId: row!.id,
    });

    return row!;
  }

  statusSummary(auth: AuthContext) {
    this.assertConfigure(auth);
    const caps = resolvePosPaymentCapabilities(this.env);
    return {
      envProvider: this.env.PAYMENT_PROVIDER,
      envPaymentEnv: this.env.PAYMENT_ENV,
      qrisAvailable: caps.qris,
      qrisStagingFallback: caps.qrisStagingFallback,
      midtransProductionReady: caps.midtransProductionReady,
      note: "Secret keys are never returned. Use credential refs (env:VAR_NAME) or store refs only.",
    };
  }
}
