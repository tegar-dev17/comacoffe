export interface AuthContext {
  userId: string;
  tenantId: string;
  role: string;
  outletId: string | null;
  email: string;
}
