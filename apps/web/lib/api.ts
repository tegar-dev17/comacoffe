const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export async function fetchPayments(params: {
  token: string;
  status?: string;
  provider?: string;
  paymentMethod?: string;
  page?: number;
}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.provider) qs.set("provider", params.provider);
  if (params.paymentMethod) qs.set("paymentMethod", params.paymentMethod);
  if (params.page) qs.set("page", String(params.page));

  const res = await fetch(`${API_BASE}/api/v1/payments?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${params.token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to load payments (${res.status})`);
  }
  return res.json() as Promise<{
    data: Array<{
      id: string;
      orderId: string;
      status: string;
      amountMinor: number;
      currency: string;
      provider: string;
      paymentMethod: string;
      createdAt: string;
    }>;
    pagination: { page: number; limit: number; total: number };
  }>;
}

export { formatIdr, formatDateTimeId } from "./format";
