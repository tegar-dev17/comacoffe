import type { Env } from "./env.js";

export function resolveCorsOrigin(env: Env): boolean | string | string[] {
  if (env.CORS_ORIGINS?.trim()) {
    const list = env.CORS_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 1) return list[0]!;
    return list;
  }
  if (env.FRONTEND_URL) return env.FRONTEND_URL;
  if (env.NODE_ENV === "production") {
    return false;
  }
  return true;
}
