// Shared helpers for week-based counts used by the dashboard and overview.
import type { Filters } from "./aggregate";
import { applyFilters } from "./aggregate";
import type { SourceDef } from "./reports";
import type { FieldMeta, TableData } from "./types";
import { weekRange } from "./week";

export function resolveDateField(src: SourceDef, fields: FieldMeta[], preferred?: string): string | undefined {
  const dates = fields.filter((f) => f.kind === "date");
  for (const name of [preferred, src.dateField]) if (name && dates.some((f) => f.name === name)) return name;
  return dates[0]?.name;
}

export function inRange(records: TableData["records"], field: string, start: number, end: number) {
  return records.filter((r) => {
    const v = r.fields[field];
    return typeof v === "number" && v >= start && v < end;
  });
}

// Record counts for the `n` weeks ending at week `offset` (oldest first).
export function weeklyCounts(data: TableData, field: string, offset: number, n: number, filters: Filters = {}) {
  const base = applyFilters(data, filters);
  return Array.from({ length: n }, (_, i) => {
    const w = weekRange(offset - (n - 1 - i));
    return { label: w.label, count: inRange(base, field, w.start, w.end).length };
  });
}

export function sum(records: TableData["records"], field: string): { total: number; n: number } {
  let total = 0;
  let n = 0;
  for (const r of records) {
    const v = r.fields[field];
    if (typeof v === "number") {
      total += v;
      n++;
    }
  }
  return { total, n };
}

export function pickExisting(names: string[] | undefined, fields: FieldMeta[], kinds?: FieldMeta["kind"][]): string[] {
  const byName = new Map(fields.map((f) => [f.name, f]));
  return (names ?? []).filter((n) => {
    const f = byName.get(n);
    return f && (!kinds || kinds.includes(f.kind));
  });
}
