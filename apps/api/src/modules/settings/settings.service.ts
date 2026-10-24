import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema/index.js";
import type { AuthContext } from "../auth/types.js";
import { PERMISSIONS, roleHasPermission } from "../auth/permissions.js";
import { writeAuditLog } from "../audit/audit.service.js";

type Db = NodePgDatabase<typeof schema>;

export class SettingsForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsForbiddenError";
  }
}

export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsValidationError";
  }
}

const DEFAULT_SETTINGS = {
  timezone: "Asia/Jakarta",
  currency: "IDR",
  taxRateBps: 0,
  serviceChargeBps: 0,
  requireOpenShift: false,
};

export class SettingsService {
  constructor(private readonly db: Db) {}

  private assertManage(auth: AuthContext) {
    if (!roleHasPermission(auth.role, PERMISSIONS.SETTINGS_MANAGE)) {
      throw new SettingsForbiddenError("Insufficient permission");
    }
  }

  async getSettings(auth: AuthContext) {
    const row = await this.db.query.tenantSettings.findFirst({
      where: eq(schema.tenantSettings.tenantId, auth.tenantId),
    });
    if (!row) {
      return { tenantId: auth.tenantId, ...DEFAULT_SETTINGS };
    }
    return {
      tenantId: row.tenantId,
      businessName: row.businessName,
      address: row.address,
      phone: row.phone,
      email: row.email,
      receiptFooter: row.receiptFooter,
      timezone: row.timezone,
      currency: row.currency,
      taxRateBps: row.taxRateBps,
      serviceChargeBps: row.serviceChargeBps,
      requireOpenShift: row.requireOpenShift,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getSettingsForTenant(tenantId: string) {
    const row = await this.db.query.tenantSettings.findFirst({
      where: eq(schema.tenantSettings.tenantId, tenantId),
    });
    return row ?? null;
  }

  async updateSettings(
    auth: AuthContext,
    input: {
      businessName?: string | null;
      address?: string | null;
      phone?: string | null;
      email?: string | null;
      receiptFooter?: string | null;
      timezone?: string;
      currency?: string;
      taxRateBps?: number;
      serviceChargeBps?: number;
      requireOpenShift?: boolean;
    },
  ) {
    this.assertManage(auth);
    if (input.taxRateBps !== undefined && (input.taxRateBps < 0 || input.taxRateBps > 10_000)) {
      throw new SettingsValidationError("taxRateBps must be 0–10000 (basis points)");
    }
    if (
      input.serviceChargeBps !== undefined &&
      (input.serviceChargeBps < 0 || input.serviceChargeBps > 10_000)
    ) {
      throw new SettingsValidationError("serviceChargeBps must be 0–10000");
    }

    const now = new Date();
    const existing = await this.db.query.tenantSettings.findFirst({
      where: eq(schema.tenantSettings.tenantId, auth.tenantId),
    });
    const values = {
      businessName: input.businessName ?? existing?.businessName ?? null,
      address: input.address ?? existing?.address ?? null,
      phone: input.phone ?? existing?.phone ?? null,
      email: input.email ?? existing?.email ?? null,
      receiptFooter: input.receiptFooter ?? existing?.receiptFooter ?? null,
      timezone: input.timezone ?? existing?.timezone ?? DEFAULT_SETTINGS.timezone,
      currency: input.currency ?? existing?.currency ?? DEFAULT_SETTINGS.currency,
      taxRateBps: input.taxRateBps ?? existing?.taxRateBps ?? DEFAULT_SETTINGS.taxRateBps,
      serviceChargeBps:
        input.serviceChargeBps ?? existing?.serviceChargeBps ?? DEFAULT_SETTINGS.serviceChargeBps,
      requireOpenShift:
        input.requireOpenShift ?? existing?.requireOpenShift ?? DEFAULT_SETTINGS.requireOpenShift,
      updatedAt: now,
    };

    if (existing) {
      await this.db
        .update(schema.tenantSettings)
        .set(values)
        .where(eq(schema.tenantSettings.tenantId, auth.tenantId));
    } else {
      await this.db.insert(schema.tenantSettings).values({
        tenantId: auth.tenantId,
        ...values,
      });
    }

    await writeAuditLog(this.db, {
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "settings.update",
      resourceType: "tenant_settings",
      resourceId: auth.tenantId,
    });

    return this.getSettings(auth);
  }

  async paymentProviderStatus(auth: AuthContext, env: { PAYMENT_PROVIDER: string }) {
    this.assertManage(auth);
    return {
      provider: env.PAYMENT_PROVIDER,
      configured: true,
      note: "Secret values are never returned. Configure via server environment or merchant config.",
    };
  }
}
