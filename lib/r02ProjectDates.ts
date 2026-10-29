import type { TableData, CellValue } from "./types";

/** V4 工程確認單的契約迄日；一個工程可能有多張確認單。 */
export function projectDueDates(records: TableData["records"]) {
  const dates = new Map<string, string[]>();
  for (const record of records) {
    const raw = ["工程編號", "所屬案件", "工編淨", "工程確認單編號"].map(k => String(record.fields[k] ?? "")).join(" ");
    const code = raw.match(/([A-Z]\d{6}|\b1\d{5}\b)/i)?.[1]?.toUpperCase();
    const date = taipeiDate(record.fields["契約迄日"]);
    if (!code || code === "C000000" || !date) continue;
    dates.set(code, [...new Set([...(dates.get(code) ?? []), date])].sort());
  }
  return dates;
}
export function taipeiDate(value: CellValue | undefined): string {
  if (typeof value === "string" && /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(value)) return value.replaceAll("/", "-");
  if (value == null || value === "") return "";
  const timestamp = typeof value === "number" ? (value < 1e11 ? value * 1000 : value) : Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10) : "";
}
export function matchesDueRange(dates: string[], from: string, to: string) {
  return !from && !to || dates.some(date => (!from || date >= from) && (!to || date <= to));
}
export function isDueSoon(dates: string[], today: string, days: number | null) {
  if (days === null) return false;
  const start = Date.parse(`${today}T00:00:00Z`);
  return dates.some(date => { const delta = (Date.parse(`${date}T00:00:00Z`) - start) / 86400000; return delta >= 0 && delta <= days; });
}
