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
  ORDER_READ: "order.read",
  POS_CHECKOUT: "pos.checkout",
  PRODUCT_READ: "product.read",
  PRODUCT_MANAGE: "product.manage",
  INVENTORY_MANAGE: "inventory.manage",
  REPORT_READ: "report.read",
  SETTINGS_MANAGE: "settings.manage",
  STAFF_MANAGE: "staff.manage",
  SHIFT_MANAGE: "shift.manage",
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
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.POS_CHECKOUT,
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.PRODUCT_MANAGE,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.STAFF_MANAGE,
    PERMISSIONS.SHIFT_MANAGE,
  ],
  cashier: [
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.PAYMENT_CREATE,
    PERMISSIONS.PAYMENT_REFRESH,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.POS_CHECKOUT,
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.SHIFT_MANAGE,
  ],
};

export function roleHasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes(permission);
}
