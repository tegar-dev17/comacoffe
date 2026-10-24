import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, 32, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored?.startsWith("scrypt$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const salt = Buffer.from(parts[1]!, "hex");
  const expected = Buffer.from(parts[2]!, "hex");
  const derived = scryptSync(plain, salt, expected.length, SCRYPT_PARAMS);
  return timingSafeEqual(derived, expected);
}
