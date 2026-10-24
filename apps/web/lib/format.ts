/**
 * Deterministic IDR formatting — identical output in Node (SSR) and browsers.
 */
export function formatIdr(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : "";
  const digits = Math.abs(Math.trunc(amountMinor)).toString();
  const withSeparators = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}Rp${withSeparators}`;
}

/** Fixed-locale datetime for tables (avoids SSR/client locale drift). */
export function formatDateTimeId(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}
