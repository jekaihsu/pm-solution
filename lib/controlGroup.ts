// R01 控制組檢查後數據 — per-group weekly summary built from the field-work and
// schedule tables. Definitions agreed with the PM (2026-10-13):
//  - 失誤率 = 控制組檢核「不通過」÷ 已檢核（通過＋不通過）；未檢核不計入。
//  - 預排點數 = 預排表的點數欄；沒填則每組每天 1 點（同組同日同案件只算一次）。
//  - 營業額差異 = 實際營業額點數（原值）− 預排點數。
//  - 是否符合 SOP 由主管在網站上勾選（另存，不寫回 Lark）。
import type { CellValue, FieldMeta, TableData } from "./types";

const DAY = 86400000;

export const pickField = (fields: FieldMeta[], names: string[], kinds?: FieldMeta["kind"][]) =>
  names.map((n) => fields.find((f) => f.name === n && (!kinds || kinds.includes(f.kind)))).find(Boolean);

const text = (v: CellValue): string => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v));
const truthy = (v: CellValue) =>
  v === true || (typeof v === "number" && v !== 0) || (Array.isArray(v) && v.length > 0) || (typeof v === "string" && v.trim() !== "" && !/^(否|false|0|無)$/i.test(v.trim()));

export type CheckResult = "pass" | "fail" | "unchecked";

export interface WorkFields {
  group?: FieldMeta;
  orderNo?: FieldMeta;
  jobNo?: FieldMeta;
  item?: FieldMeta;
  qty?: FieldMeta;
  revenue?: FieldMeta;
  check?: FieldMeta;
  status?: FieldMeta;
  flags: FieldMeta[];
}

export function resolveWorkFields(fields: FieldMeta[]): WorkFields {
  return {
    group: pickField(fields, ["組別"]),
    orderNo: pickField(fields, ["工作單號"]),
    jobNo: pickField(fields, ["案件編號", "工程編號", "工作編號", "可能確認單工作編號"]),
    item: pickField(fields, ["合約工項", "工作項目", "工項"]),
    qty: pickField(fields, ["完成數量", "計價數量", "數量"], ["number"]),
    revenue: pickField(fields, ["最終營業額點數", "營業額點數", "點數"], ["number"]),
    check: pickField(fields, ["控制組檢核"]),
    status: pickField(fields, ["檢核狀態"]),
    flags: fields.filter((f) => f.name.startsWith("⚠")),
  };
}

export function classifyCheck(r: TableData["records"][number], wf: WorkFields): CheckResult {
  const status = wf.status ? text(r.fields[wf.status.name]) : "";
  if (/退回/.test(status)) return "fail";
  if (!wf.check) return "unchecked";
  const v = r.fields[wf.check.name];
  if (typeof v === "boolean") return v ? "pass" : "unchecked";
  const t = text(v);
  if (!t) return "unchecked";
  if (/不通過|未通過|不合格|退回|NG|錯誤|有誤/i.test(t)) return "fail";
  if (/通過|合格|OK|✓|已檢核|正確/i.test(t)) return "pass";
  return "unchecked";
}

export function anomalies(r: TableData["records"][number], wf: WorkFields): string[] {
  return wf.flags.filter((f) => truthy(r.fields[f.name])).map((f) => f.name.replace(/^⚠/, ""));
}

export interface ScheduleFields {
  group?: FieldMeta;
  start?: FieldMeta;
  end?: FieldMeta;
  points?: FieldMeta;
  job?: FieldMeta;
}

export function resolveScheduleFields(fields: FieldMeta[]): ScheduleFields {
  return {
    group: pickField(fields, ["組別"]),
    start: pickField(fields, ["開始日期", "日期", "預排開始日", "預排日期"], ["date"]),
    end: pickField(fields, ["結束日期", "預排結束日"], ["date"]),
    points: pickField(fields, ["預排點數", "預排營業額點數", "營業額點數", "點數"], ["number"]),
    job: pickField(fields, ["案件", "案件編號", "工程編號"]),
  };
}

// Planned points per group inside [start, end): explicit points when filled,
// otherwise 1 per group-day (same group, day and job counted once).
export function plannedPoints(data: TableData | undefined, sf: ScheduleFields, start: number, end: number) {
  const out = new Map<string, { points: number; days: number; defaulted: number }>();
  if (!data || !sf.group || !sf.start) return out;
  const seen = new Set<string>();
  for (const r of data.records) {
    const s = r.fields[sf.start.name];
    if (typeof s !== "number") continue;
    const e0 = sf.end ? r.fields[sf.end.name] : null;
    const e = typeof e0 === "number" && e0 >= s ? e0 : s;
    const from = Math.max(s, start);
    const to = Math.min(e + DAY, end);
    if (to <= from) continue;
    const days = Math.max(1, Math.round((to - from) / DAY));
    const totalDays = Math.max(1, Math.round((e + DAY - s) / DAY));
    const groups = (Array.isArray(r.fields[sf.group.name]) ? (r.fields[sf.group.name] as string[]) : [text(r.fields[sf.group.name])]).filter(Boolean);
    const job = sf.job ? text(r.fields[sf.job.name]) : r.id;
    const filled = sf.points ? r.fields[sf.points.name] : null;
    for (const g of groups) {
      const cur = out.get(g) ?? { points: 0, days: 0, defaulted: 0 };
      if (typeof filled === "number") {
        cur.points += (filled * days) / totalDays; // spread a multi-day entry across its days
        cur.days += days;
      } else {
        for (let d = 0; d < days; d++) {
          const key = `${g}|${Math.floor((from + d * DAY) / DAY)}|${job}`;
          if (seen.has(key)) continue;
          seen.add(key);
          cur.points += 1;
          cur.days += 1;
          cur.defaulted += 1;
        }
      }
      out.set(g, cur);
    }
  }
  return out;
}

export interface GroupRow {
  group: string;
  orders: TableData["records"];
  revenue: number;
  revenueBlank: number;
  qty: number;
  items: string[];
  pass: number;
  fail: number;
  unchecked: number;
  anomalyCount: number;
  anomalyKinds: Map<string, number>;
  planned?: { points: number; days: number; defaulted: number };
}

export function groupRows(records: TableData["records"], wf: WorkFields, planned: Map<string, { points: number; days: number; defaulted: number }>): GroupRow[] {
  const rows = new Map<string, GroupRow>();
  const get = (g: string) => {
    let row = rows.get(g);
    if (!row) {
      row = { group: g, orders: [], revenue: 0, revenueBlank: 0, qty: 0, items: [], pass: 0, fail: 0, unchecked: 0, anomalyCount: 0, anomalyKinds: new Map() };
      rows.set(g, row);
    }
    return row;
  };
  for (const r of records) {
    const g = (wf.group ? text(r.fields[wf.group.name]) : "") || "（未填組別）";
    const row = get(g);
    row.orders.push(r);
    const rev = wf.revenue ? r.fields[wf.revenue.name] : null;
    if (typeof rev === "number") row.revenue += rev;
    else row.revenueBlank++;
    const q = wf.qty ? r.fields[wf.qty.name] : null;
    if (typeof q === "number") row.qty += q;
    const item = wf.item ? text(r.fields[wf.item.name]) : "";
    if (item && !row.items.includes(item)) row.items.push(item);
    const check = classifyCheck(r, wf);
    if (check === "pass") row.pass++;
    else if (check === "fail") row.fail++;
    else row.unchecked++;
    const an = anomalies(r, wf);
    if (an.length) row.anomalyCount++;
    for (const a of an) row.anomalyKinds.set(a, (row.anomalyKinds.get(a) ?? 0) + 1);
  }
  // Groups that were scheduled but did no work still get a row.
  for (const [g, p] of planned) get(g).planned = p;
  for (const row of rows.values()) row.planned ??= planned.get(row.group);
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue || a.group.localeCompare(b.group));
}

export const errorRate = (row: { pass: number; fail: number }) => (row.pass + row.fail ? row.fail / (row.pass + row.fail) : null);
