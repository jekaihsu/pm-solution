// Business dates are normalized before generic Lark cell conversion can discard shape/timezone.
const DAY = 86400000;
const EPOCH = Date.UTC(1899, 11, 30);
const dateAt = (ms: number): string | null => {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + 8 * 3600000);
  return Number.isFinite(d.getTime()) && d.getUTCFullYear() >= 1 && d.getUTCFullYear() <= 9999 ? d.toISOString().slice(0, 10) : null;
};
// Python round(): ties go to the even integer.
const roundEven = (n: number) => {
  const i = Math.floor(n), f = n - i;
  return f === 0.5 ? (i % 2 === 0 ? i : i + 1) : Math.round(n);
};
export function normalizeWorkDate(raw: unknown): string | null {
  if (Array.isArray(raw)) return raw.length === 1 ? normalizeWorkDate(raw[0]) : null;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s)) {
    const n = Number(s);
    return dateAt(Math.abs(n) > 1e10 ? n : EPOCH + roundEven(n * 86400) * 1000);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/i.exec(s);
  if (!match) return null;
  const [, y, m, d, h, min, sec, zone] = match;
  const check = new Date(Date.UTC(+y, +m - 1, +d));
  if (check.getUTCFullYear() !== +y || check.getUTCMonth() !== +m - 1 || check.getUTCDate() !== +d
    || +(h ?? 0) > 23 || +(min ?? 0) > 59 || +(sec ?? 0) > 59) return null;
  const iso = h ? s.replace(" ", "T") + (zone ? "" : "+08:00") : `${s}T00:00:00+08:00`;
  return dateAt(Date.parse(iso));
}
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += DAY) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
export const weekday = (d: string) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
