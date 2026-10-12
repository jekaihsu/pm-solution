import type { CellValue, FieldMeta, TableData } from "./types";

export type Agg = "count" | "sum" | "avg" | "min" | "max";
export type DateBucket = "day" | "week" | "month" | "quarter" | "year";
export type ChartType = "bar" | "hbar" | "line" | "area" | "pie" | "stacked";

export interface Widget {
  id: string;
  title: string;
  type: ChartType;
  groupBy: string; // field name
  dateBucket?: DateBucket;
  stackBy?: string; // field name, for stacked bars
  agg: Agg;
  metric?: string; // number field name (ignored for count)
  limit?: number;
  width: 1 | 2; // grid columns
}

export type Filters = Record<string, string[]>; // field name → allowed values

export const EMPTY = "（空白）";

const pad = (n: number) => String(n).padStart(2, "0");

export function bucketDate(ms: number, bucket: DateBucket = "month"): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  switch (bucket) {
    case "day":
      return `${y}-${pad(m)}-${pad(d.getDate())}`;
    case "week": {
      // ISO week
      const t = new Date(Date.UTC(y, d.getMonth(), d.getDate()));
      const dayNum = t.getUTCDay() || 7;
      t.setUTCDate(t.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      return `${t.getUTCFullYear()}-W${pad(week)}`;
    }
    case "quarter":
      return `${y}-Q${Math.ceil(m / 3)}`;
    case "year":
      return String(y);
    default:
      return `${y}-${pad(m)}`;
  }
}

// A cell may contribute to several groups (multi-select, multiple people).
export function groupKeys(value: CellValue, field: FieldMeta | undefined, bucket?: DateBucket): string[] {
  if (value === null || value === undefined || value === "") return [EMPTY];
  if (Array.isArray(value)) return value.length ? value : [EMPTY];
  if (field?.kind === "date" && typeof value === "number") return [bucketDate(value, bucket)];
  if (typeof value === "boolean") return [value ? "是" : "否"];
  return [String(value)];
}

export function applyFilters(data: TableData, filters: Filters) {
  const active = Object.entries(filters).filter(([, v]) => v.length > 0);
  if (!active.length) return data.records;
  const byName = new Map(data.fields.map((f) => [f.name, f]));
  return data.records.filter((r) =>
    active.every(([name, allowed]) => groupKeys(r.fields[name], byName.get(name)).some((k) => allowed.includes(k))),
  );
}

function reduce(values: number[], agg: Agg): number {
  if (agg === "count") return values.length;
  if (!values.length) return 0;
  switch (agg) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
  }
}

export interface Series {
  rows: Record<string, string | number>[]; // { name, value } or { name, [stackKey]: value }
  stackKeys: string[];
}

export function aggregate(records: TableData["records"], fields: FieldMeta[], w: Widget): Series {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const gField = byName.get(w.groupBy);
  const sField = w.type === "stacked" && w.stackBy ? byName.get(w.stackBy) : undefined;

  const buckets = new Map<string, Map<string, number[]>>();
  for (const r of records) {
    const metricVal = w.agg === "count" ? 1 : r.fields[w.metric ?? ""];
    if (w.agg !== "count" && typeof metricVal !== "number") continue;
    for (const g of groupKeys(r.fields[w.groupBy], gField, w.dateBucket)) {
      const stacks = sField ? groupKeys(r.fields[sField.name], sField) : ["value"];
      for (const s of stacks) {
        if (!buckets.has(g)) buckets.set(g, new Map());
        const m = buckets.get(g)!;
        if (!m.has(s)) m.set(s, []);
        m.get(s)!.push(metricVal as number);
      }
    }
  }

  const stackKeys = new Set<string>();
  let rows = [...buckets.entries()].map(([name, m]) => {
    const row: Record<string, string | number> = { name };
    let total = 0;
    for (const [s, vals] of m) {
      const v = Math.round(reduce(vals, w.agg) * 100) / 100;
      row[s] = v;
      total += v;
      stackKeys.add(s);
    }
    row.__total = total;
    return row;
  });

  // Dates sort chronologically; everything else by value, descending.
  if (gField?.kind === "date") rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  else rows.sort((a, b) => (b.__total as number) - (a.__total as number));
  if (w.limit && gField?.kind !== "date") rows = rows.slice(0, w.limit);

  return { rows, stackKeys: [...stackKeys] };
}

export function formatNumber(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Picks a sensible starting dashboard from whatever fields the table has.
export function defaultWidgets(fields: FieldMeta[]): Widget[] {
  const cats = fields.filter((f) => f.kind === "select" || f.kind === "person" || f.kind === "multiselect");
  const nums = fields.filter((f) => f.kind === "number");
  const dates = fields.filter((f) => f.kind === "date");
  const out: Widget[] = [];
  const id = () => Math.random().toString(36).slice(2, 9);

  if (cats[0]) out.push({ id: id(), title: `依「${cats[0].name}」分佈`, type: "pie", groupBy: cats[0].name, agg: "count", width: 1 });
  if (cats[1]) out.push({ id: id(), title: `依「${cats[1].name}」筆數`, type: "bar", groupBy: cats[1].name, agg: "count", width: 1, limit: 12 });
  if (dates[0]) {
    out.push({
      id: id(),
      title: `${dates[0].name} 趨勢`,
      type: cats[0] ? "stacked" : "line",
      groupBy: dates[0].name,
      dateBucket: "month",
      stackBy: cats[0]?.name,
      agg: "count",
      width: 2,
    });
  }
  if (nums[0] && cats[0]) {
    const g = cats.find((c) => c.kind === "person") ?? cats[0];
    out.push({ id: id(), title: `各${g.name}「${nums[0].name}」總和`, type: "hbar", groupBy: g.name, agg: "sum", metric: nums[0].name, width: 2, limit: 15 });
  }
  if (!out.length) {
    const any = fields.find((f) => !f.primary) ?? fields[0];
    if (any) out.push({ id: id(), title: `依「${any.name}」筆數`, type: "bar", groupBy: any.name, agg: "count", width: 2, limit: 20 });
  }
  return out;
}
