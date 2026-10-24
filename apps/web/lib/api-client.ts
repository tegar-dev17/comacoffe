const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

async function parseJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    if (typeof body.error === "string") {
      message = body.error;
    } else if (body.error && typeof body.error === "object") {
      const flat = body.error as {
        formErrors?: string[];
        fieldErrors?: Record<string, string[]>;
      };
      const fieldMsg = flat.fieldErrors
        ? Object.values(flat.fieldErrors).flat().find(Boolean)
        : undefined;
      message = flat.formErrors?.[0] ?? fieldMsg ?? message;
    } else if (body.error?.message) {
      message = body.error.message;
    }
    throw new Error(message);
  }
  return body;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });
  return parseJson(res) as Promise<T>;
}

export async function login(email: string, password: string) {
  return apiFetch<{
    data: { token: string; user: StoredUserShape };
  }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

type StoredUserShape = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  outletId: string | null;
  tenantId: string;
};

export { API_BASE };
