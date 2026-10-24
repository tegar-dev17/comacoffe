import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema/index.js";
import type { AuthContext } from "../auth/types.js";
import { hashPassword } from "../auth/password.js";
import { PERMISSIONS, roleHasPermission } from "../auth/permissions.js";
import { writeAuditLog } from "../audit/audit.service.js";

type Db = NodePgDatabase<typeof schema>;

const ASSIGNABLE_ROLES = ["cashier", "supervisor", "admin"] as const;

export class StaffForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffForbiddenError";
  }
}

export class StaffValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffValidationError";
  }
}

export class StaffService {
  constructor(private readonly db: Db) {}

  private assertManage(auth: AuthContext) {
    if (!roleHasPermission(auth.role, PERMISSIONS.STAFF_MANAGE)) {
      throw new StaffForbiddenError("Insufficient permission");
    }
  }

  async listStaff(auth: AuthContext) {
    this.assertManage(auth);
    const rows = await this.db.query.users.findMany({
      where: eq(schema.users.tenantId, auth.tenantId),
      orderBy: asc(schema.users.email),
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      outletId: u.outletId,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async createStaff(
    auth: AuthContext,
    input: {
      email: string;
      password: string;
      displayName: string;
      role: string;
      outletId?: string | null;
    },
  ) {
    this.assertManage(auth);
    if (input.role === "owner" && auth.role !== "owner") {
      throw new StaffForbiddenError("Cannot assign owner role");
    }
    const allowedRoles = [...ASSIGNABLE_ROLES, "admin"] as const;
    if (!allowedRoles.includes(input.role as (typeof allowedRoles)[number])) {
      throw new StaffValidationError(`Invalid role. Use: ${allowedRoles.join(", ")}`);
    }
    if (input.password.length < 8) {
      throw new StaffValidationError("Password must be at least 8 characters");
    }

    if (input.outletId) {
      const outlet = await this.db.query.outlets.findFirst({
        where: and(
          eq(schema.outlets.id, input.outletId),
          eq(schema.outlets.tenantId, auth.tenantId),
        ),
      });
      if (!outlet) throw new StaffValidationError("Outlet not found");
    }

    const email = input.email.toLowerCase();
    const [created] = await this.db
      .insert(schema.users)
      .values({
        tenantId: auth.tenantId,
        email,
        displayName: input.displayName,
        role: input.role,
        outletId: input.outletId ?? null,
        passwordHash: hashPassword(input.password),
        isActive: true,
      })
      .returning();

    await writeAuditLog(this.db, {
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "staff.create",
      resourceType: "user",
      resourceId: created!.id,
    });

    return {
      id: created!.id,
      email: created!.email,
      displayName: created!.displayName,
      role: created!.role,
      outletId: created!.outletId,
      isActive: created!.isActive,
    };
  }

  async updateStaff(
    auth: AuthContext,
    userId: string,
    input: {
      displayName?: string;
      role?: string;
      outletId?: string | null;
      isActive?: boolean;
    },
  ) {
    this.assertManage(auth);
    const existing = await this.db.query.users.findFirst({
      where: and(eq(schema.users.id, userId), eq(schema.users.tenantId, auth.tenantId)),
    });
    if (!existing) throw new StaffValidationError("User not found");
    if (existing.role === "owner" && auth.role !== "owner") {
      throw new StaffForbiddenError("Cannot modify owner account");
    }

    const [updated] = await this.db
      .update(schema.users)
      .set({
        displayName: input.displayName ?? existing.displayName,
        role: input.role ?? existing.role,
        outletId: input.outletId !== undefined ? input.outletId : existing.outletId,
        isActive: input.isActive ?? existing.isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.users.id, userId), eq(schema.users.tenantId, auth.tenantId)))
      .returning();

    await writeAuditLog(this.db, {
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "staff.update",
      resourceType: "user",
      resourceId: userId,
    });

    return {
      id: updated!.id,
      email: updated!.email,
      displayName: updated!.displayName,
      role: updated!.role,
      outletId: updated!.outletId,
      isActive: updated!.isActive,
    };
  }

  async resetPassword(auth: AuthContext, userId: string, newPassword: string) {
    this.assertManage(auth);
    if (newPassword.length < 8) {
      throw new StaffValidationError("Password must be at least 8 characters");
    }
    const existing = await this.db.query.users.findFirst({
      where: and(eq(schema.users.id, userId), eq(schema.users.tenantId, auth.tenantId)),
    });
    if (!existing) throw new StaffValidationError("User not found");

    await this.db
      .update(schema.users)
      .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date() })
      .where(and(eq(schema.users.id, userId), eq(schema.users.tenantId, auth.tenantId)));

    await writeAuditLog(this.db, {
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "staff.reset_password",
      resourceType: "user",
      resourceId: userId,
    });

    return { ok: true };
  }
}
