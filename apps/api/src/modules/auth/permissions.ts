export const PERMISSIONS = {
  PAYMENT_READ: "payment.read",
  PAYMENT_CREATE: "payment.create",
  PAYMENT_REFRESH: "payment.refresh",
  PAYMENT_CANCEL: "payment.cancel",
  PAYMENT_REFUND: "payment.refund",
  PAYMENT_RECONCILE: "payment.reconcile",
  PAYMENT_EXPORT: "payment.export",
  PAYMENT_PROVIDER_CONFIGURE: "payment.provider.configure",
  PAYMENT_AUDIT_READ: "payment.audit.read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: Object.values(PERMISSIONS),
  admin: Object.values(PERMISSIONS),
  supervisor: [
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.PAYMENT_CREATE,
    PERMISSIONS.PAYMENT_REFRESH,
    PERMISSIONS.PAYMENT_CANCEL,
    PERMISSIONS.PAYMENT_REFUND,
    PERMISSIONS.PAYMENT_RECONCILE,
    PERMISSIONS.PAYMENT_EXPORT,
    PERMISSIONS.PAYMENT_AUDIT_READ,
  ],
  cashier: [
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.PAYMENT_CREATE,
    PERMISSIONS.PAYMENT_REFRESH,
  ],
};

export function roleHasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes(permission);
}
