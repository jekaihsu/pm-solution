// R01 控制組檢查後數據 — per-group weekly summary built from the field-work and
// schedule tables. Definitions agreed with the PM (2026-10-13):
//  - 失誤率 = 控制組檢核「不通過」÷ 已檢核（通過＋不通過）；未檢核不計入。
//  - 預排點數 = 預排表的點數欄；沒填則每組每天 1 點（同組同日不論幾個案件只算一次）。
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
  trade?: FieldMeta;
  person?: FieldMeta;
  flags: FieldMeta[];
}

export function resolveWorkFields(fields: FieldMeta[], checkNames: string[] = ["控制組檢核"]): WorkFields {
  return {
    group: pickField(fields, ["組別"]),
    orderNo: pickField(fields, ["工作單號"]),
    jobNo: pickField(fields, ["案件編號", "工程編號", "工作編號", "可能確認單工作編號", "可能的確認單工編(若暫無確認單才需填寫)"]),
    item: pickField(fields, ["合約工項", "內業工項", "工作項目", "工項"]),
    qty: pickField(fields, ["完成數量", "計價數量", "對外計價數量", "數量"], ["number"]),
    revenue: pickField(fields, ["最終營業額點數", "營業額點數", "點數"], ["number"]),
    check: pickField(fields, checkNames),
    status: pickField(fields, ["檢核狀態"]),
    trade: pickField(fields, ["業別", "工作類別"]),
    person: pickField(fields, ["出工人", "組長", "填報人"]),
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

// 出錯 = the 控制組／檢核 changed a work order: the modified quantity or points
// differ from what the group filled in. Only compared when both values exist.
export interface FixFields {
  qtyOrig?: FieldMeta;
  qtyFixed?: FieldMeta;
  revOrig?: FieldMeta;
  revFixed?: FieldMeta;
}

export interface FixDiff {
  kind: "數量" | "營業額";
  from: number;
  to: number;
}

export function resolveFixFields(fields: FieldMeta[]): FixFields {
  return {
    qtyOrig: pickField(fields, ["完成數量", "計價數量", "數量"]),
    qtyFixed: pickField(fields, ["修改後數量"]),
    revOrig: pickField(fields, ["營業額點數", "點數"]),
    revFixed: pickField(fields, ["修改後營業額", "修改後營業額點數", "最終營業額點數"]),
  };
}

const num = (v: CellValue): number | null => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  if (Array.isArray(v) && v.length === 1) return num(v[0]);
  return null;
};

export function fixDiffs(r: TableData["records"][number], ff: FixFields): FixDiff[] {
  const out: FixDiff[] = [];
  const cmp = (kind: FixDiff["kind"], a?: FieldMeta, b?: FieldMeta) => {
    if (!a || !b || a === b) return;
    const from = num(r.fields[a.name]);
    const to = num(r.fields[b.name]);
    if (from !== null && to !== null && Math.abs(from - to) > 1e-6) out.push({ kind, from, to });
  };
  cmp("數量", ff.qtyOrig, ff.qtyFixed);
  cmp("營業額", ff.revOrig, ff.revFixed);
  return out;
}

// Taipei weekday 0–6 (Mon–Sun) of a timestamp inside the week starting at weekStart.
export const dayOfWeek = (t: number, weekStart: number) => Math.floor((t - weekStart) / DAY);

export function anomalies(r: TableData["records"][number], wf: WorkFields): string[] {
  return wf.flags.filter((f) => truthy(r.fields[f.name])).map((f) => f.name.replace(/^⚠/, ""));
}

export interface ScheduleFields {
  trade?: FieldMeta; // 業別
  group?: FieldMeta;
  start?: FieldMeta;
  end?: FieldMeta;
  points?: FieldMeta;
  job?: FieldMeta;
}

export function resolveScheduleFields(fields: FieldMeta[]): ScheduleFields {
  return {
    trade: pickField(fields, ["業別"]),
    group: pickField(fields, ["組別"]),
    start: pickField(fields, ["開始日期", "日期", "預排開始日", "預排日期"], ["date"]),
    end: pickField(fields, ["結束日期", "預排結束日"], ["date"]),
    points: pickField(fields, ["預排點數", "預排營業額點數", "營業額點數", "點數"], ["number"]),
    job: pickField(fields, ["案件", "案件編號", "工程編號"]),
  };
}

// Planned points per group inside [start, end). A schedule row with points
// spreads them over its days; a group-day with no filled points anywhere counts
// as 1 point — once per group per day, however many jobs or people are booked.
export function plannedPoints(data: TableData | undefined, sf: ScheduleFields, start: number, end: number, keepTrade?: (trade: string) => boolean) {
  const out = new Map<string, { points: number; days: number; defaulted: number }>();
  if (!data || !sf.group || !sf.start) return out;
  const TZ = 8 * 3600000; // business days are Asia/Taipei dates
  const filledDays = new Set<string>();
  const allDays = new Set<string>();
  const unfilled: { g: string; day: number }[] = [];
  const bucket = (g: string) => {
    let cur = out.get(g);
    if (!cur) out.set(g, (cur = { points: 0, days: 0, defaulted: 0 }));
    return cur;
  };

  for (const r of data.records) {
    if (keepTrade && !keepTrade(sf.trade ? text(r.fields[sf.trade.name]) : "")) continue;
    const s = r.fields[sf.start.name];
    if (typeof s !== "number") continue;
    const e0 = sf.end ? r.fields[sf.end.name] : null;
    const e = typeof e0 === "number" && e0 >= s ? e0 : s;
    const first = Math.floor((s + TZ) / DAY);
    const last = Math.floor((e + TZ) / DAY);
    const winFirst = Math.floor((start + TZ) / DAY);
    const winLast = Math.floor((end - 1 + TZ) / DAY);
    const from = Math.max(first, winFirst);
    const to = Math.min(last, winLast);
    if (to < from) continue;
    const groups = (Array.isArray(r.fields[sf.group.name]) ? (r.fields[sf.group.name] as string[]) : [text(r.fields[sf.group.name])]).filter(Boolean);
    const filled = sf.points ? r.fields[sf.points.name] : null;
    for (const g of groups) {
      for (let d = from; d <= to; d++) {
        if (typeof filled === "number") {
          bucket(g).points += filled / (last - first + 1);
          filledDays.add(`${g}|${d}`);
        } else unfilled.push({ g, day: d });
        allDays.add(`${g}|${d}`);
      }
    }
  }
  for (const { g, day } of unfilled) {
    const key = `${g}|${day}`;
    if (filledDays.has(key)) continue; // a filled entry already covers this group-day
    filledDays.add(key);
    const cur = bucket(g);
    cur.points += 1;
    cur.defaulted += 1;
  }
  for (const key of allDays) bucket(key.slice(0, key.lastIndexOf("|"))).days += 1;
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

// Internal work orders carry no group or work date of their own: both live on the
// linked 內業成本單 (所屬成本單). Adds 工作日期 and 組別 to each work order from its
// cost sheet, matched on the cost sheet's primary field (the link shows that text).
export const JOINED_DATE = "工作日期";
export const JOINED_GROUP = "組別";

export function joinInternal(work: TableData, cost: TableData | undefined): { data: TableData; joined: number; costLink?: string } {
  const link = pickField(work.fields, ["所屬成本單"]);
  const hasDate = work.fields.some((f) => f.name === JOINED_DATE && f.kind === "date");
  const hasGroup = work.fields.some((f) => f.name === JOINED_GROUP);
  if (!cost || !link || (hasDate && hasGroup)) return { data: work, joined: 0, costLink: link?.name };
  const primary = cost.fields.find((f) => f.primary) ?? cost.fields[0];
  const cDate = pickField(cost.fields, ["工作日期"], ["date"]);
  const cGroup = pickField(cost.fields, ["內業組別", "所屬組別", "組別"]);
  const index = new Map<string, TableData["records"][number]>();
  for (const r of cost.records) {
    const key = text(r.fields[primary.name]);
    if (key) index.set(key, r);
    index.set(r.id, r); // in case the link could not be resolved to titles
  }
  let joined = 0;
  const records = work.records.map((r) => {
    const ref = r.fields[link.name];
    const keys = Array.isArray(ref) ? ref : ref ? [String(ref)] : [];
    const c = keys.map((k) => index.get(k)).find(Boolean);
    if (!c) return r;
    joined++;
    const fields = { ...r.fields };
    if (!hasDate && cDate) fields[JOINED_DATE] = c.fields[cDate.name] ?? null;
    if (!hasGroup && cGroup) fields[JOINED_GROUP] = c.fields[cGroup.name] ?? null;
    return { ...r, fields };
  });
  const extra: FieldMeta[] = [];
  if (!hasDate && cDate) extra.push({ id: "__joined_date", name: JOINED_DATE, kind: "date", primary: false });
  if (!hasGroup && cGroup) extra.push({ id: "__joined_group", name: JOINED_GROUP, kind: "select", primary: false });
  return { data: { ...work, fields: [...work.fields, ...extra], records }, joined, costLink: link.name };
}

// Field names the dashboards request from the server (see /api/sources projection).
export const WORK_FIELDS = [
  "組別", "工作單號", "案件編號", "工程編號", "工作編號", "可能確認單工作編號", "可能的確認單工編(若暫無確認單才需填寫)",
  "合約工項", "內業工項", "工作項目", "工項", "完成數量", "計價數量", "對外計價數量", "數量",
  "最終營業額點數", "營業額點數", "點數", "控制組檢核", "雅雯檢核", "檢核狀態", "所屬成本單", "業別", "工作類別", "修改後數量", "修改後營業額", "修改後營業額點數", "出工人", "組長", "填報人",
  "所屬案件", "案件", "工程名稱", "交期", "合約交期", "預定完成日", "完工期限", "到期日", "⚠*", "@dates",
];
export const COST_FIELDS = ["工作日期", "內業組別", "所屬組別", "組別", "@dates"];
export const SCHEDULE_FIELDS = [
  "業別", "組別", "開始日期", "日期", "預排開始日", "預排日期", "結束日期", "預排結束日",
  "預排點數", "預排營業額點數", "營業額點數", "點數", "案件", "案件編號", "工程編號", "@dates",
];
export const OVERTIME_FIELDS = ["是否加班", "加班時數", "加班類型", "內業組別", "所屬組別", "組別", "填報人", "組長", "姓名", "@dates"];
