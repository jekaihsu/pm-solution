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

const text = (v: CellValue | undefined): string => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v));
const truthy = (v: CellValue) =>
  v === true || (typeof v === "number" && v !== 0) || (Array.isArray(v) && v.length > 0) || (typeof v === "string" && v.trim() !== "" && !/^(否|false|0|無)$/i.test(v.trim()));

// The schedule writes 組別 with a trailing「組」(水深A組) where the work orders
// don't (水深A); both sides drop it when matching.
export const groupKey = (g: string) => g.trim().replace(/組$/, "");

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
  sopViolation?: FieldMeta; // 日報「是否違反SOP」(filled in Lark)
  notes: FieldMeta[]; // 備註／留言 and reason fields people write on the order
  flags: FieldMeta[];
}

export function resolveWorkFields(fields: FieldMeta[], checkNames: string[] = ["控制組檢核"]): WorkFields {
  return {
    group: pickField(fields, ["組別"]),
    orderNo: pickField(fields, ["工作單號"]),
    jobNo: pickField(fields, ["案件編號", "工程編號", "所屬案件", "可能的確認單工編(若暫無確認單才需填寫)", "備註工編淨", "工作編號", "可能確認單工作編號"]),
    item: pickField(fields, ["合約工項", "內業工項", "工作項目", "工項"]),
    qty: pickField(fields, ["執行工作數量", "完成數量", "計價數量", "對外計價數量", "數量"], ["number"]),
    revenue: pickField(fields, ["最終營業額點數", "營業額點數", "點數"], ["number"]),
    check: pickField(fields, checkNames),
    status: pickField(fields, ["檢核狀態"]),
    trade: pickField(fields, ["業別", "工作類別"]),
    person: pickField(fields, ["出工人", "組長", "填報人"]),
    sopViolation: fields.find((f) => /(違|违)反\s*sop/i.test(f.name)) ?? fields.find((f) => /sop/i.test(f.name)),
    flags: fields.filter((f) => f.name.startsWith("⚠")),
    notes: fields.filter((f) => /備註|備注|留言|退回原因|覆寫原因|重工原因/.test(f.name) && f.kind !== "number"),
  };
}

export function classifyCheck(r: TableData["records"][number], wf: WorkFields): CheckResult {
  const status = wf.status ? text(r.fields[wf.status.name]) : "";
  if (/退回/.test(status)) return "fail";
  if (/已通過/.test(status)) return "pass";
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
    qtyOrig: pickField(fields, ["執行工作數量", "完成數量", "計價數量", "數量"]),
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

// 是否違反SOP: checkbox ticked, or a text/option saying 是／違反. 「否」「未違反」= no.
export function violatesSop(r: TableData["records"][number], wf: WorkFields): boolean | null {
  if (!wf.sopViolation) return null;
  const v = r.fields[wf.sopViolation.name];
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return null;
  if (typeof v === "boolean") return v;
  const t = text(v).trim();
  if (/^(否|無|没有|沒有|未違反|未违反|符合|no|false|0)$/i.test(t)) return false;
  if (/是|違反|违反|yes|true|1|有/i.test(t)) return true;
  return truthy(v);
}

// Every non-empty note on an order, labelled by field unless it is the plain 備註.
export function orderNotes(r: TableData["records"][number], wf: WorkFields): { label: string; text: string }[] {
  return wf.notes
    .map((f) => ({ label: /^(備註|備注|留言)$/.test(f.name) ? "" : f.name, text: text(r.fields[f.name]).trim() }))
    .filter((n) => n.text);
}

export function anomalies(r: TableData["records"][number], wf: WorkFields): string[] {
  return wf.flags.filter((f) => truthy(r.fields[f.name])).map((f) => f.name.replace(/^⚠/, ""));
}

// 業主裁示（2026-10-13）：ROV 組是外業。預排列的組別是 ROV（大小寫、結尾「組」不拘）
// 一律算外業，不管業別欄填什麼；其他組照舊用業別判斷。
export const isRovGroup = (g: string) => groupKey(g).toUpperCase() === "ROV";
export const keepFieldSchedule = (trade: string, group: string) => isRovGroup(group) || trade.trim() === "外業";
export const keepInternalSchedule = (trade: string, group: string) => !isRovGroup(group) && /內業/.test(trade);

export interface ScheduleFields {
  trade?: FieldMeta; // 業別
  group?: FieldMeta;
  start?: FieldMeta;
  end?: FieldMeta;
  points?: FieldMeta;
  job?: FieldMeta;
}

// 先認 field id（真起日／真訖日／點數，欄名會被 UI 改）；找不到 id（例如 V4 預排表 id 不同）才退回欄名。
// SCHEDULE_FIDS 在檔案下方定義，函式執行時已初始化。
export function resolveScheduleFields(fields: FieldMeta[]): ScheduleFields {
  const byId = (id: string) => fields.find((f) => f.id === id);
  return {
    trade: byId(SCHEDULE_FIDS.trade) ?? pickField(fields, ["業別"]),
    group: byId(SCHEDULE_FIDS.group) ?? pickField(fields, ["組別"]),
    start: byId(SCHEDULE_FIDS.start) ?? pickField(fields, ["開始日期", "日期", "預排開始日", "預排日期"], ["date"]),
    end: byId(SCHEDULE_FIDS.end) ?? pickField(fields, ["結束日期", "預排結束日"], ["date"]),
    points: byId(SCHEDULE_FIDS.points) ?? pickField(fields, ["預估營業額點數", "預排點數", "預排營業額點數", "營業額點數", "點數"], ["number"]),
    job: pickField(fields, ["案件", "工程確認單", "案件編號", "工程編號"]),
  };
}

// Planned points per group inside [start, end). A schedule row with points
// spreads them over its days; a group-day with no filled points anywhere counts
// as 1 point — once per group per day, however many jobs or people are booked.
export function plannedPoints(data: TableData | undefined, sf: ScheduleFields, start: number, end: number, keepTrade?: (trade: string, group: string) => boolean) {
  const out = new Map<string, { points: number; days: number; defaulted: number }>();
  if (!data || !sf.group || !sf.start) return out;
  const TZ = 8 * 3600000; // business days are Asia/Taipei dates
  const filledDays = new Set<string>();
  const allDays = new Set<string>();
  const unfilled: { g: string; day: number }[] = [];
  // One bucket per groupKey, named as the schedule first wrote it.
  const names = new Map<string, string>();
  const canon = (g: string) => {
    const k = groupKey(g).toUpperCase(); // ROV／rov 同一組
    if (!names.has(k)) names.set(k, g);
    return names.get(k)!;
  };
  const bucket = (g: string) => {
    let cur = out.get(g);
    if (!cur) out.set(g, (cur = { points: 0, days: 0, defaulted: 0 }));
    return cur;
  };

  for (const r of data.records) {
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
    const trade = sf.trade ? text(r.fields[sf.trade.name]) : "";
    const groups = (Array.isArray(r.fields[sf.group.name]) ? (r.fields[sf.group.name] as string[]) : [text(r.fields[sf.group.name])])
      .filter(Boolean)
      .filter((g) => !keepTrade || keepTrade(trade, g))
      .map(canon);
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
  crews?: GroupRow[]; // 拆組出工時各組長一列（只用於顯示，合計不含）
  // R02 以人為單位才有：group 是人名；personId＝人員名單的 record_id；team＝成本單的內業組別；key＝team|personId
  personId?: string;
  team?: string;
  key?: string;
}

export const blankRow = (g: string): GroupRow => ({ group: g, orders: [], revenue: 0, revenueBlank: 0, qty: 0, items: [], pass: 0, fail: 0, unchecked: 0, anomalyCount: 0, anomalyKinds: new Map() });

// `keyOf` (R02 以人為單位) replaces the 組別 lookup: records are bucketed by whatever key it returns.
export function groupRows(records: TableData["records"], wf: WorkFields, planned: Map<string, { points: number; days: number; defaulted: number }>, keyOf?: (r: TableData["records"][number]) => string): GroupRow[] {
  const rows = new Map<string, GroupRow>();
  const get = (g: string) => {
    let row = rows.get(g);
    if (!row) {
      row = blankRow(g);
      rows.set(g, row);
    }
    return row;
  };
  for (const r of records) {
    const g = keyOf ? keyOf(r) : (wf.group ? text(r.fields[wf.group.name]) : "") || "（未填組別）";
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
  const byKey = new Map([...rows.values()].map((row) => [groupKey(row.group), row]));
  for (const [g, p] of planned) (byKey.get(groupKey(g)) ?? get(g)).planned = p;
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue || a.group.localeCompare(b.group));
}

export const errorRate = (row: { pass: number; fail: number }) => (row.pass + row.fail ? row.fail / (row.pass + row.fail) : null);

// Internal work orders carry no group or work date of their own: both live on the
// linked 內業成本單 (所屬成本單). Adds 工作日期 and 組別 to each work order from its
// cost sheet, matched on the cost sheet's primary field (the link shows that text).
export const JOINED_DATE = "工作日期";
export const JOINED_GROUP = "組別";
export const JOINED_PERSON = "填報人"; // R02 以人為單位：成本單的填報人（名稱在 fields、record_id 在 links）

export function joinInternal(work: TableData, cost: TableData | undefined): { data: TableData; joined: number; costLink?: string } {
  const link = pickField(work.fields, ["所屬成本單"]);
  const hasDate = work.fields.some((f) => f.name === JOINED_DATE && f.kind === "date");
  const hasGroup = work.fields.some((f) => f.name === JOINED_GROUP);
  const hasPerson = work.fields.some((f) => f.name === JOINED_PERSON);
  if (!cost || !link || (hasDate && hasGroup && hasPerson)) return { data: work, joined: 0, costLink: link?.name };
  const primary = cost.fields.find((f) => f.primary) ?? cost.fields[0];
  const cDate = pickField(cost.fields, ["工作日期"], ["date"]);
  const cGroup = pickField(cost.fields, ["內業組別", "所屬組別", "組別"]);
  const cPerson = pickField(cost.fields, [JOINED_PERSON]);
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
    if (!hasPerson && cPerson) fields[JOINED_PERSON] = c.fields[cPerson.name] ?? null;
    // 填報人 record_id：只掛在 links，不影響其他報表讀 fields 的方式
    const ids = !hasPerson && cPerson ? c.links?.[cPerson.name] : undefined;
    return { ...r, fields, ...(ids ? { links: { ...r.links, [JOINED_PERSON]: ids } } : {}) };
  });
  const extra: FieldMeta[] = [];
  if (!hasDate && cDate) extra.push({ id: "__joined_date", name: JOINED_DATE, kind: "date", primary: false });
  if (!hasGroup && cGroup) extra.push({ id: "__joined_group", name: JOINED_GROUP, kind: "select", primary: false });
  if (!hasPerson && cPerson) extra.push({ id: "__joined_person", name: JOINED_PERSON, kind: "multiselect", primary: false });
  return { data: { ...work, fields: [...work.fields, ...extra], records }, joined, costLink: link.name };
}

// 拆組出工：同一組別、同一工作日期，工作單所屬成本單的「組長」有 ≥2 個不同的人，
// 該組視為拆組。拆組的組每位組長一列（組長空白歸「未填組長」）；沒拆組或讀不到
// 成本單就原樣回傳。子列只供顯示，合計仍是組別列，不重複計算。
export function splitCrews(rows: GroupRow[], wf: WorkFields, workFields: FieldMeta[], cost: TableData | undefined, dateField: string): GroupRow[] {
  const link = pickField(workFields, ["所屬成本單"]);
  if (!cost || !link) return rows;
  const primary = cost.fields.find((f) => f.primary) ?? cost.fields[0];
  const cLeader = pickField(cost.fields, ["組長"]);
  if (!primary || !cLeader) return rows;
  const cDate = pickField(cost.fields, ["工作日期"], ["date"]);
  // 成本單「單號」標題常重複（同組同日多張），所以優先用成本單的「工作單列」對到工作單號；
  // 標題只在唯一時才當備援。
  const cOrders = pickField(cost.fields, ["工作單列"]);
  const byOrderNo = new Map<string, TableData["records"][number]>();
  const byTitle = new Map<string, TableData["records"][number] | null>();
  for (const r of cost.records) {
    const key = text(r.fields[primary.name]);
    if (key) byTitle.set(key, byTitle.has(key) ? null : r);
    byTitle.set(r.id, r);
    const list = cOrders ? r.fields[cOrders.name] : null;
    if (Array.isArray(list)) for (const no of list) byOrderNo.set(String(no), r);
  }
  const TZ = 8 * 3600000;
  const NONE = "未填組長";
  const leaderOf = (o: TableData["records"][number]) => {
    const no = wf.orderNo ? text(o.fields[wf.orderNo.name]) : "";
    let c = no ? byOrderNo.get(no) : undefined;
    if (!c) {
      const ref = o.fields[link.name];
      const keys = Array.isArray(ref) ? ref : ref ? [String(ref)] : [];
      c = keys.map((k) => byTitle.get(String(k))).find(Boolean) ?? undefined;
    }
    return { c, name: c ? text(c.fields[cLeader.name]).trim() : "" };
  };
  return rows.map((row) => {
    const perDay = new Map<number | string, Set<string>>();
    const byOrder = new Map<TableData["records"][number], string>();
    for (const o of row.orders) {
      const { c, name } = leaderOf(o);
      byOrder.set(o, name || NONE);
      if (!name) continue;
      const t = (cDate && c && typeof c.fields[cDate.name] === "number" ? c.fields[cDate.name] : o.fields[dateField]) as CellValue;
      const day = typeof t === "number" ? Math.floor((t + TZ) / DAY) : "?";
      if (!perDay.has(day)) perDay.set(day, new Set());
      perDay.get(day)!.add(name);
    }
    if (![...perDay.values()].some((s) => s.size >= 2)) return row;
    const buckets = new Map<string, TableData["records"]>();
    for (const o of row.orders) {
      const k = byOrder.get(o)!;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(o);
    }
    const crews = [...buckets.entries()]
      .sort((a, b) => (a[0] === NONE ? 1 : b[0] === NONE ? -1 : 0) || a[0].localeCompare(b[0]))
      .map(([k, orders]) => ({ ...groupRows(orders, wf, new Map())[0], group: k === NONE ? `${row.group}・${NONE}` : `${row.group}・${k}組` }));
    return { ...row, crews };
  });
}

// 主表列出全部組／人（含沒預排的，預排顯示「未排」）。工作單、營業額等合計含全部列；
// 「與預排差異」只算有預排點數的列：Σ(營業額−預排) over planned rows，n＝有預排的列數。
export function planDiffTotals(rows: GroupRow[]) {
  const planned = rows.filter((r) => r.planned && r.planned.points > 0);
  const plannedRevenue = planned.reduce((s, r) => s + r.revenue, 0);
  const points = planned.reduce((s, r) => s + (r.planned?.points ?? 0), 0);
  return {
    rows,
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
    orders: rows.reduce((s, r) => s + r.orders.length, 0),
    points,
    diff: plannedRevenue - points,
    n: planned.length,
  };
}

// =====================================================================================
// R02 內業檢查「以人為單位」（業主裁示 2026-10-13）
// 外業以組別排、填；內業一人填一張，但仍分組別，以人為單位計算。
//  - 一列一個人＝內業成本單的「填報人」（人員名單 record_id）；組別＝該張成本單的「內業組別」。
//    同一人在一週內填過不同組別的成本單時，每個組別各一列（工作單依成本單歸屬，不重複計算）。
//  - 預排以「人員 record_id ＋ 日期」比對，組別不參與 join。預排「人員」欄可多人，逐人展開。
//    有填「預估營業額點數」就分攤到每天；沒填的每人每天 1 點（同人同日多條只算一次）。
//  - 預排日期一律用欄位 id（真起日 fldMXOggGP／真訖日 fldjWv1xST），不看欄名（UI 曾把欄名改反）。
// =====================================================================================

// V3 工作預排表 tblN8c3WN44233aG 的欄位 id（fid↔語意永遠不變，欄名會被 UI 改）。
export const SCHEDULE_FIDS = {
  start: "fldMXOggGP", // 真起日
  end: "fldjWv1xST", // 真訖日
  people: "fld7KNCsVe", // 人員（link → 人員名單，可多人）
  trade: "fldrENe4H6",
  group: "fldNDUy2XP",
  kind: "fld78OmLVn", // 條類型（出工／休假）
  points: "fld5lTSN1r", // 預估營業額點數
} as const;

export interface PersonScheduleFields extends ScheduleFields {
  people?: FieldMeta;
  kind?: FieldMeta;
}

// 先認 id；找不到 id（例如 V4 的預排表 id 不同）才退回欄名。V3 的日期欄一定走 id。
export function resolvePersonScheduleFields(fields: FieldMeta[]): PersonScheduleFields {
  const byId = (id: string) => fields.find((f) => f.id === id);
  return {
    start: byId(SCHEDULE_FIDS.start) ?? pickField(fields, ["開始日期", "日期", "預排開始日", "預排日期"], ["date"]),
    end: byId(SCHEDULE_FIDS.end) ?? pickField(fields, ["結束日期", "預排結束日"], ["date"]),
    people: byId(SCHEDULE_FIDS.people) ?? pickField(fields, ["人員"]),
    trade: byId(SCHEDULE_FIDS.trade) ?? pickField(fields, ["業別"]),
    group: byId(SCHEDULE_FIDS.group) ?? pickField(fields, ["組別"]),
    kind: byId(SCHEDULE_FIDS.kind) ?? pickField(fields, ["條類型"]),
    points: byId(SCHEDULE_FIDS.points) ?? pickField(fields, ["預估營業額點數", "預排點數", "預排營業額點數"], ["number"]),
    job: pickField(fields, ["案件", "工程確認單", "案件編號", "工程編號"]),
  };
}

export interface PersonPlan {
  name: string;
  teamHint: string; // 預排上的組別（只供整週沒有工作單時決定顯示在哪一組，不參與 join）
  days: Map<number, { points: number; defaulted: boolean }>; // Taipei 日序號 → 當天預排點數
}

// 預排點數：每人每天一格，落在 [start, end) 內。
export function plannedByPerson(data: TableData | undefined, sf: PersonScheduleFields, start: number, end: number, keep?: (trade: string, group: string) => boolean): Map<string, PersonPlan> {
  const out = new Map<string, PersonPlan>();
  if (!data || !sf.people || !sf.start) return out;
  const TZ = 8 * 3600000;
  const winFirst = Math.floor((start + TZ) / DAY);
  const winLast = Math.floor((end - 1 + TZ) / DAY);
  const filled = new Map<string, number>(); // person|day → 已填的預估點數（分攤後）
  const unfilled = new Set<string>();
  const people = new Map<string, PersonPlan>();
  for (const r of data.records) {
    const s = r.fields[sf.start.name];
    if (typeof s !== "number") continue;
    if (sf.kind && /休假|請假/.test(text(r.fields[sf.kind.name]))) continue; // 休假不是預排出工
    const e0 = sf.end ? r.fields[sf.end.name] : null;
    const e = typeof e0 === "number" && e0 >= s ? e0 : s;
    const first = Math.floor((s + TZ) / DAY);
    const last = Math.floor((e + TZ) / DAY);
    const from = Math.max(first, winFirst);
    const to = Math.min(last, winLast);
    if (to < from) continue;
    const trade = sf.trade ? text(r.fields[sf.trade.name]) : "";
    const groups = (sf.group ? (Array.isArray(r.fields[sf.group.name]) ? (r.fields[sf.group.name] as string[]) : [text(r.fields[sf.group.name])]) : []).filter(Boolean);
    if (keep && !(groups.length ? groups.some((g) => keep(trade, g)) : keep(trade, ""))) continue;
    // 人員：record_id 在 links，名稱在 fields（兩者一一對應）；沒有 links（示範資料）就用名稱當 id
    const names = (Array.isArray(r.fields[sf.people.name]) ? (r.fields[sf.people.name] as string[]) : [text(r.fields[sf.people.name])]).filter(Boolean);
    const ids = r.links?.[sf.people.name] ?? names;
    const seen = new Set<string>();
    const pts = sf.points ? r.fields[sf.points.name] : null;
    ids.forEach((id, i) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      let p = people.get(id);
      if (!p) people.set(id, (p = { name: names[i] ?? id, teamHint: groupKey(groups[0] ?? ""), days: new Map() }));
      for (let d = from; d <= to; d++) {
        const k = `${id}|${d}`;
        if (typeof pts === "number") filled.set(k, (filled.get(k) ?? 0) + pts / (last - first + 1));
        else unfilled.add(k);
      }
    });
  }
  const put = (k: string, points: number, defaulted: boolean) => {
    const cut = k.lastIndexOf("|");
    people.get(k.slice(0, cut))!.days.set(Number(k.slice(cut + 1)), { points, defaulted });
  };
  for (const [k, v] of filled) put(k, v, false);
  for (const k of unfilled) if (!filled.has(k)) put(k, 1, true); // 同人同日只補一次 1 點
  for (const [id, p] of people) if (p.days.size) out.set(id, p);
  return out;
}

const NO_TEAM = "（未填組別）";
const NO_PERSON = "（未填填報人）";

// 一人一列（同一人在不同內業組別各一列）。records 要先過 joinInternal（帶入組別、填報人）且已篩週。
export function personRows(records: TableData["records"], wf: WorkFields, dateField: string, plan: Map<string, PersonPlan>): GroupRow[] {
  const TZ = 8 * 3600000;
  const who = (r: TableData["records"][number]) => {
    const names = r.fields[JOINED_PERSON];
    const list = Array.isArray(names) ? names : names ? [String(names)] : [];
    const id = r.links?.[JOINED_PERSON]?.[0] ?? list[0] ?? "__none";
    return { id, name: list[0] ?? NO_PERSON, team: text(r.fields[JOINED_GROUP]).trim() || NO_TEAM };
  };
  const info = new Map<string, { id: string; name: string; team: string }>();
  const dayTeam = new Map<string, string>(); // person|day → team
  const teamCount = new Map<string, Map<string, number>>(); // person → team → 張數
  const keyOf = (r: TableData["records"][number]) => {
    const w = who(r);
    const key = `${w.team}|${w.id}`;
    info.set(key, w);
    const t = r.fields[dateField];
    if (typeof t === "number") dayTeam.set(`${w.id}|${Math.floor((t + TZ) / DAY)}`, w.team);
    const tc = teamCount.get(w.id) ?? new Map<string, number>();
    tc.set(w.team, (tc.get(w.team) ?? 0) + 1);
    teamCount.set(w.id, tc);
    return key;
  };
  const rows = groupRows(records, wf, new Map(), keyOf);
  const byKey = new Map<string, GroupRow>();
  for (const row of rows) {
    const w = info.get(row.group)!;
    Object.assign(row, { key: row.group, group: w.name, personId: w.id, team: w.team });
    byKey.set(row.key!, row);
  }
  // 預排：每人每天掛到「那天他填報的組」；那天沒填就掛到他張數最多的組；整週沒工作單才用預排上的組別。
  const teams = [...new Set(rows.map((r) => r.team!))];
  const primary = (id: string) => [...(teamCount.get(id) ?? [])].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  for (const [id, p] of plan) {
    for (const [day, d] of p.days) {
      const hint = teams.find((t) => groupKey(t) === p.teamHint) ?? (p.teamHint || NO_TEAM);
      const team = dayTeam.get(`${id}|${day}`) ?? primary(id) ?? hint;
      const key = `${team}|${id}`;
      let row = byKey.get(key);
      if (!row) {
        row = Object.assign(blankRow(p.name), { key, personId: id, team });
        byKey.set(key, row);
        rows.push(row);
      }
      const cur = (row.planned ??= { points: 0, days: 0, defaulted: 0 });
      cur.points += d.points;
      cur.days += 1;
      if (d.defaulted) cur.defaulted += 1;
    }
  }
  return rows.sort((a, b) => b.revenue - a.revenue || a.group.localeCompare(b.group));
}

// 把多列合成一列（組小計、整體合計用）。planned 只有至少一人有預排時才有。
export function sumRows(label: string, rows: GroupRow[]): GroupRow {
  const out = blankRow(label);
  for (const r of rows) {
    out.orders.push(...r.orders);
    out.revenue += r.revenue;
    out.revenueBlank += r.revenueBlank;
    out.qty += r.qty;
    out.pass += r.pass;
    out.fail += r.fail;
    out.unchecked += r.unchecked;
    out.anomalyCount += r.anomalyCount;
    for (const i of r.items) if (!out.items.includes(i)) out.items.push(i);
    for (const [k, n] of r.anomalyKinds) out.anomalyKinds.set(k, (out.anomalyKinds.get(k) ?? 0) + n);
    if (r.planned) {
      const p = (out.planned ??= { points: 0, days: 0, defaulted: 0 });
      p.points += r.planned.points;
      p.days += r.planned.days;
      p.defaulted += r.planned.defaulted;
    }
  }
  return out;
}

export interface TeamSection {
  team: string;
  total: GroupRow; // 組小計（group＝組別名）
  rows: GroupRow[]; // 該組的人
}

// 依內業組別分段：每組一個小計列，下面是該組的人。組依營業額由大到小。
export function teamSections(rows: GroupRow[]): TeamSection[] {
  const by = new Map<string, GroupRow[]>();
  for (const r of rows) {
    const t = r.team ?? NO_TEAM;
    if (!by.has(t)) by.set(t, []);
    by.get(t)!.push(r);
  }
  return [...by.entries()]
    .map(([team, list]) => ({ team, total: sumRows(team, list), rows: [...list].sort((a, b) => b.revenue - a.revenue || a.group.localeCompare(b.group)) }))
    .sort((a, b) => b.total.revenue - a.total.revenue || a.team.localeCompare(b.team));
}

// ---- R02 組別總結（業主要求 2026-10-13：控制、圖報…各組一列的小總結）----
// 圖報合計（報告）＝圖報A＋圖報B（2026-07-17 起「報告」改名圖報A／圖報B）。
export const REPORT_TEAMS = ["圖報A", "圖報B"];
export const REPORT_MERGED = "圖報合計"; // 篩選用的鍵（網址 ?team=）
export const REPORT_MERGED_LABEL = "圖報合計（報告）";
export const ALL_TEAMS_KEY = "全部合計";

export interface TeamSummaryLine {
  key: string; // 組別名／REPORT_MERGED／ALL_TEAMS_KEY
  label: string;
  kind: "team" | "merged" | "all";
  teams: string[]; // 涵蓋的內業組別
  people: number; // 去重人數（同一人跨組只算一次）
  total: GroupRow; // 張數、點數等直接加總（每張工作單只屬於一個組，不會重複）
  plan: { people: number; points: number; diff: number }; // 只算有預排的人；people 同樣去重
}

// 一組一列，再加「圖報合計」（圖報A、圖報B 至少一個存在才有）與最後的「全部合計」。
// rows 是 personRows 的結果（一人×組一列）。
export function teamSummary(rows: GroupRow[]): TeamSummaryLine[] {
  const who = (r: GroupRow) => r.personId ?? r.group;
  const line = (key: string, label: string, kind: TeamSummaryLine["kind"], teams: string[], list: GroupRow[]): TeamSummaryLine => {
    const pd = planDiffTotals(list);
    return {
      key,
      label,
      kind,
      teams,
      people: new Set(list.map(who)).size,
      total: sumRows(label, list),
      plan: { people: new Set(list.filter((r) => r.planned && r.planned.points > 0).map(who)).size, points: pd.points, diff: pd.diff },
    };
  };
  const secs = teamSections(rows);
  const out = secs.map((s) => line(s.team, s.team, "team", [s.team], s.rows));
  const rep = secs.filter((s) => REPORT_TEAMS.includes(s.team));
  if (rep.length) out.push(line(REPORT_MERGED, REPORT_MERGED_LABEL, "merged", rep.map((s) => s.team), rep.flatMap((s) => s.rows)));
  out.push(line(ALL_TEAMS_KEY, ALL_TEAMS_KEY, "all", secs.map((s) => s.team), rows));
  return out;
}

// 依組別篩人：null＝全部；REPORT_MERGED＝圖報A＋圖報B；其餘＝該內業組別。
export function filterByTeam(rows: GroupRow[], sel: string | null): GroupRow[] {
  if (!sel) return rows;
  const teams = sel === REPORT_MERGED ? REPORT_TEAMS : [sel];
  return rows.filter((r) => teams.includes(r.team ?? NO_TEAM));
}

// Field names the dashboards request from the server (see /api/sources projection).
export const WORK_FIELDS = [
  "組別", "工作單號", "案件編號", "工程編號", "工作編號", "可能確認單工作編號", "可能的確認單工編(若暫無確認單才需填寫)",
  "合約工項", "內業工項", "工作項目", "工項", "完成數量", "執行工作數量", "計價數量", "對外計價數量", "數量",
  "最終營業額點數", "營業額點數", "點數", "控制組檢核", "雅雯檢核", "品管檢核", "檢核狀態", "退回原因", "檢核時間", "所屬成本單", "業別", "工作類別", "修改後數量", "修改後營業額", "修改後營業額點數", "出工人", "組長", "填報人", "~SOP", "~備註", "~備注", "~留言", "~原因",
  "所屬案件", "原所屬案件", "對應合約明細", "~工編", "~計價數量", "填報時間", "案件", "工程名稱", "交期", "合約交期", "預定完成日", "完工期限", "到期日", "⚠*", "@dates",
];
export const COST_FIELDS = ["工作日期", "內業組別", "所屬組別", "組別", "填報人", "填報時間", "⚠補填", "@dates"];
export const FIELD_COST_FIELDS = ["工作日期", "組別", "組長", "工作單列", "@dates"];
export const SCHEDULE_FIELDS = [
  "業別", "組別", "開始日期", "日期", "預排開始日", "預排日期", "結束日期", "預排結束日",
  "預排點數", "預排營業額點數", "營業額點數", "點數", "案件", "案件編號", "工程編號", "@dates",
  // R02 以人為單位：人員（link，要 record_id）、條類型、預估營業額點數
  "人員", "條類型", "預估營業額點數", "備註", "工程確認單", "工作內容", "預排工作項目", "#fldnzMsrzZ", "#fldpFvkV6G",
  // 依 field id 取欄（日期／點數不看欄名）：真起日、真訖日、組別、業別、預估營業額點數
  `#${SCHEDULE_FIDS.start}`, `#${SCHEDULE_FIDS.end}`, `#${SCHEDULE_FIDS.group}`, `#${SCHEDULE_FIDS.trade}`, `#${SCHEDULE_FIDS.points}`,
];

// R02 daily points use the same work-date and revenue fields as the existing person rows.
export function buildDailyPersonRevenue(rows: GroupRow[], wf: WorkFields, dateField: string | null, weekStart: string) {
  const start = Date.parse(`${weekStart.replaceAll("/", "-")}T00:00:00+08:00`);
  const days = () => [0, 0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number, number];
  const people = rows.map((row) => {
    const daily = days(); let totalQty = 0;
    for (const order of row.orders) {
      const raw = dateField ? order.fields[dateField] : null;
      const t = typeof raw === "number" ? raw : typeof raw === "string" ? Date.parse(raw) : NaN;
      const day = dayIndex(t) - dayIndex(start);
      if (day < 0 || day > 6 || !Number.isFinite(day)) continue;
      daily[day] += wf.revenue ? num(order.fields[wf.revenue.name]) ?? 0 : 0;
      totalQty += wf.qty ? num(order.fields[wf.qty.name]) ?? 0 : 0;
    }
    return { row, days: daily, weekTotal: daily.reduce((a, b) => a + b, 0), totalQty };
  });
  const aggregate = (list: typeof people) => ({ days: list.reduce((a, p) => { p.days.forEach((v, i) => { a[i] += v; }); return a; }, days()), weekTotal: list.reduce((a, p) => a + p.weekTotal, 0), totalQty: list.reduce((a, p) => a + p.totalQty, 0) });
  const teams = teamSections(rows).map((section) => ({ team: section.team, people: people.filter((p) => section.rows.includes(p.row)), ...aggregate(people.filter((p) => section.rows.includes(p.row))) }));
  const reports = people.filter((p) => /^圖報/.test(p.row.team ?? ""));
  const grand = aggregate(people);
  return { people, teams, reportTotal: reports.length ? aggregate(reports) : null, grandDays: grand.days, grandTotal: grand.weekTotal, totalQty: grand.totalQty };
}

export interface R02InspectionRow {
  id: string; workOrderNo: string; date: string; people: string; group: string; caseCode: string; workItem: string;
  executedQty: number | null; pricingQty: number | null; modifiedQty: number | null; revenuePoints: number | null; modifiedRevenue: number | null;
  isReturned: boolean; returnReason: string; reviewStatus: "已通過" | "已退回" | "待檢核";
}

export function r02InspectionRows(records: TableData["records"], wf: WorkFields, dateField: string): R02InspectionRow[] {
  return records.map((r) => {
    const f = r.fields;
    const result = classifyCheck(r, wf);
    const date = f[dateField];
    return { id: r.id, workOrderNo: text(f["工作單號"]), date: typeof date === "number" ? new Date(date + 8 * 3600000).toISOString().slice(0, 10) : text(date),
      people: text(f["填報人"]), group: text(f["組別"]), caseCode: text(f["案件編號"] ?? f["所屬案件"]), workItem: text(f["內業工項"] ?? f["工作項目"]),
      executedQty: num(f["執行工作數量"]) ?? num(f["計價數量"]) ?? num(f["對外計價數量"]), pricingQty: num(f["計價數量"]), modifiedQty: num(f["修改後數量"]),
      revenuePoints: num(f["營業額點數"]) ?? num(f["最終營業額點數"]), modifiedRevenue: num(f["修改後營業額"]),
      isReturned: result === "fail", returnReason: text(f["退回原因"]).trim(), reviewStatus: result === "fail" ? "已退回" : result === "pass" ? "已通過" : "待檢核" };
  });
}

export const INTERNAL_TEAM_NAMES = ["控制", "圖報A", "圖報B", "經理"];
export const isInternalTeamName = (team: string) => /^(控制|圖報A|圖報B|圖資|報告|經理|內業)$/.test(groupKey(team));
export const EXEMPT_DAILY_REPORT_NAMES = new Set(["許茂坤", "許喆凱", "Vincent", "張爲斌", "張為斌"]);
export const V4_CASE_FIELDS = ["工程確認單編號", "工程編號", "工編淨", "所屬案件", "工程名稱", "狀態", "合約狀態", "控制總工天", "圖資總工天", "報告總工天", "合約總額", "B｜報價(營業額)", "累計點數", "剩餘額度", "契約剩餘天", "@dates"];
export const V4_CONTRACT_ITEM_FIELDS = ["工編號碼", "所屬案件", "所屬成案確認單（日報關聯）", "合約項次", "合約工作項目", "明細狀態", "合約數量", "數量", "合約單位", "外業數量", "控制數量", "圖資數量", "報告數量", "控制預估工天", "圖資預估工天", "報告預估工天", "預期營業額點數", "已施作營業額", "餘額", "合約金額(報出)", "分項金額(報出)", "合約金額(原始)", "@dates"];
export const V4_REPORT_ITEM_FIELDS = ["填報工項", "工編號碼", "所屬案件", "工項類別", "工項名稱", "合約工作項目", "基準數量", "標準點數", "對應合約明細", "對應營業額", "已填報外業營業額", "本工項剩餘營ˊ業額", "@dates"];
const TZ = 8 * 3600000;
const dayIndex = (n: number) => Math.floor((n + TZ) / DAY);
const timestamp = (v: CellValue): number | null => typeof v === "number" ? v : typeof v === "string" && v ? (Number.isFinite(Date.parse(v)) ? Date.parse(v) : null) : null;
const names = (v: CellValue): string[] => (Array.isArray(v) ? v : text(v).split(/[、,，]/)).map(x => x.trim()).filter(Boolean);
// Requirement 140: project-level schedule, attendance and V4 progress calculations.
import type { PeopleDirectory } from "./people";
const extractCaseCode = (raw: string) => {
  const s = raw.trim(); const match = s.match(/([A-Z]\d{6}|\b1\d{5}\b)/i);
  return match ? (match[1].toUpperCase() === "C000000" ? "" : match[1].toUpperCase()) : s;
};
const isoOffset = (day: string, n: number) => { const ms = Date.parse(`${day.replaceAll("/", "-")}T00:00:00Z`); return Number.isFinite(ms) ? new Date(ms + n * DAY).toISOString().slice(0,10) : ""; };
const dateIso = (v: CellValue | undefined) => {
  if (typeof v === "string" && /^\d{4}[-/]\d{2}[-/]\d{2}/.test(v)) return v.slice(0,10).replaceAll("/","-");
  const t = typeof v === "number" ? (v < 1e11 ? v * 1000 : v) : Date.parse(text(v));
  return Number.isFinite(t) ? new Date(t + TZ).toISOString().slice(0,10) : "";
};
const submittedTime = (v: CellValue | undefined) => {
  if (typeof v === "number") return v < 1e11 ? v * 1000 : v;
  const s = text(v).trim(); if (!s) return NaN;
  return Date.parse(/^\d{4}[-/]\d\d[-/]\d\d[ T]\d\d:\d\d(?::\d\d)?$/.test(s) ? s.replaceAll("/","-").replace(" ","T") + "+08:00" : s);
};
export function buildInternalScheduleExecution(scheduleRecords: TableData["records"], workRecords: TableData["records"], sf: ScheduleFields, wf: WorkFields, weekStart: number, weekEnd: number, peopleDir?: PeopleDirectory, caseNameByCode?: Map<string,string>) {
  void peopleDir;
  const map = new Map<string,{caseCode:string;caseName:string;people:string[];scheduleRows:number;plannedPoints:number;actualOrders:number;actualQty:number;actualRevenue:number}>();
  for (const r of scheduleRecords) {
    if (!keepInternalSchedule(text(sf.trade ? r.fields[sf.trade.name] : r.fields["業別"]),text(sf.group ? r.fields[sf.group.name] : r.fields["組別"])) || /休假|請假|特休|病假|事假|公假|補休/.test(text(r.fields["條類型"]))) continue;
    const s = timestamp(r.fields[sf.start?.name ?? "開始日期"]), e = timestamp(r.fields[sf.end?.name ?? "結束日期"]); if (s === null || dayIndex(s) > dayIndex(weekEnd-1) || dayIndex(e ?? s) < dayIndex(weekStart)) continue;
    const raw = text(r.fields["案件"] ?? r.fields["案件編號"] ?? r.fields["工程編號"] ?? r.fields["備註"]); const code = extractCaseCode(raw); if (!code) continue;
    const p = map.get(code) ?? {caseCode:code,caseName:caseNameByCode?.get(code) ?? raw.replace(new RegExp(`^.*?${code}(?:-\\d+)?`,"i"),"").replace(/^[\s:：\-]+/,""),people:[],scheduleRows:0,plannedPoints:0,actualOrders:0,actualQty:0,actualRevenue:0};
    p.people = [...new Set([...p.people,...names(r.fields["人員"])])]; p.scheduleRows++; p.plannedPoints += num(r.fields[sf.points?.name ?? "預估營業額點數"]) ?? 0; map.set(code,p);
  }
  const extraWorkOrders: {id:string;orderNo:string;date:string;person:string;team:string;caseCode:string;item:string;qty:number;revenue:number}[] = [];
  for (const r of workRecords) { const f=r.fields; const raw=text(f["所屬案件"] ?? f["案件編號"] ?? f["工程編號"] ?? f["可能的確認單工編(若暫無確認單才需填寫)"] ?? f["備註工編淨"] ?? f["原所屬案件"] ?? f["對應合約明細"]); const code=extractCaseCode(raw), p=map.get(code);
    if (p) {p.actualOrders++; p.actualQty += wf.qty ? num(f[wf.qty.name]) ?? 0 : 0; p.actualRevenue += wf.revenue ? num(f[wf.revenue.name]) ?? 0 : 0;}
    else extraWorkOrders.push({id:r.id,orderNo:text(f[wf.orderNo?.name ?? "工作單號"]),date:text(f[JOINED_DATE] ?? f["日期"]),person:text(f["填報人"] ?? f["姓名"]),team:text(f[JOINED_GROUP] ?? f["組別"]),caseCode:code || raw || "未填案件",item:text(f[wf.item?.name ?? "內業工項"]),qty:(wf.qty ? num(f[wf.qty.name]) : null) ?? num(f["計價數量"]) ?? 0,revenue:(wf.revenue ? num(f[wf.revenue.name]) : null) ?? num(f["最終營業額點數"]) ?? 0});
  }
  const plannedCases=[...map.values()].map(p=>({...p,executed:p.actualOrders>0})), executedPlannedCaseCount=plannedCases.filter(p=>p.executed).length;
  return {plannedCases,plannedCaseCount:plannedCases.length,executedPlannedCaseCount,executionRate:plannedCases.length ? executedPlannedCaseCount/plannedCases.length : null,extraWorkOrders,extraWorkOrderCount:extraWorkOrders.length,extraRevenue:extraWorkOrders.reduce((s,o)=>s+o.revenue,0),extraQty:extraWorkOrders.reduce((s,o)=>s+o.qty,0)};
}
export function buildPersonAttendanceAndBackfill(rows: GroupRow[], costRecordsInWeek: TableData["records"], wf: WorkFields, dateField: string | null, weekStartIsoRaw: string, todayIsoRaw: string, leaveByPerson: Record<string,Record<string,string>> = {}, rosterStaff: Array<{name:string;team:string}> = []) {
  void wf; const weekStartIso=weekStartIsoRaw.replaceAll("/","-"), todayIso=todayIsoRaw.replaceAll("/","-"); const workdays=[0,1,2,3,4].map(i=>isoOffset(weekStartIso,i)).filter(d=>d && d<=todayIso), end=isoOffset(weekStartIso,6);
  const combined=[...rows]; for(const p of rosterStaff) if (isInternalTeamName(p.team) && !combined.some(r=>r.group===p.name)) combined.push({...blankRow(p.name),team:p.team});
  const costById=new Map(costRecordsInWeek.map(r=>[r.id,r]));
  const people=combined.filter(row=>isInternalTeamName(row.team ?? "")).map(row=>{ const costs=costRecordsInWeek.filter(r=>names(r.fields["填報人"]).includes(row.group)); const dates=new Set<string>(); const add=(v:CellValue|undefined)=>{const d=dateIso(v); if(d>=weekStartIso && d<=end) dates.add(d);};
    row.orders.forEach(r=>add((dateField ? r.fields[dateField] : null) ?? r.fields[JOINED_DATE] ?? r.fields["日期"])); costs.forEach(r=>add(r.fields["工作日期"] ?? r.fields["日期"]));
    let before1030Count=0,after1030Count=0; const linked=new Set<string>();
    // V4 cost sheets bulk-cloned on 2026-08-11 give work before 2026-08-10 a clone timestamp, not a submission time (#105/#140).
    const count=(r:TableData["records"][number],cost?:TableData["records"][number])=>{const d=dateIso((dateField ? r.fields[dateField] : null) ?? r.fields[JOINED_DATE] ?? r.fields["日期"] ?? cost?.fields["工作日期"]); if(!d || d<weekStartIso || d>end) return; const dayStart=Date.parse(`${d}T00:00:00+08:00`); const valid=(t:number)=>Number.isFinite(t) && t>=dayStart; const workTime=submittedTime(r.fields["填報時間"]), costTime=submittedTime(cost?.fields["填報時間"]); const cloned=(t:number)=>d<"2026-08-10" && dateIso(t)==="2026-08-11"; const isCost=costById.has(r.id); const t=!isCost && valid(workTime) ? workTime : isCost && valid(workTime) && !cloned(workTime) ? workTime : valid(costTime) && !cloned(costTime) ? costTime : NaN; const e=Date.parse(`${d}T23:59:59.999+08:00`), cutoff=Date.parse(`${isoOffset(d,1)}T10:30:00.000+08:00`); if(t>cutoff) after1030Count++; else if(t>e || (!Number.isFinite(t) && text(r.fields["⚠補填"] ?? cost?.fields["⚠補填"]))) before1030Count++;};
    for(const r of row.orders){const id=r.links?.["所屬成本單"]?.[0]; if(id) linked.add(id); count(r,id ? costById.get(id) : undefined);} for(const c of costs) if(!linked.has(c.id) && !row.orders.some(r=>dateIso((dateField ? r.fields[dateField] : null) ?? r.fields[JOINED_DATE])===dateIso(c.fields["工作日期"]))) count(c);
    const actualWorkDays=dates.size, dailyAvgRevenue=actualWorkDays ? row.revenue/actualWorkDays : null, missingDates=EXEMPT_DAILY_REPORT_NAMES.has(row.group)?[]:workdays.filter(d=>!dates.has(d) && !leaveByPerson[row.group]?.[d]);
    return {person:row.group,team:row.team ?? "",actualWorkDays,workDates:[...dates].sort(),missingDates,missingReportDays:missingDates.length,before1030Count,after1030Count,revenue:row.revenue,qty:row.qty,dailyAvgRevenue,efficiencyRate:dailyAvgRevenue}; });
  const total=(f:(p:typeof people[number])=>number)=>people.reduce((s,p)=>s+f(p),0), actualWorkDays=total(p=>p.actualWorkDays), totalRevenue=total(p=>p.revenue), dailyAvgRevenue=actualWorkDays ? totalRevenue/actualWorkDays : null;
  return {people,totals:{actualWorkDays,missingReportDays:total(p=>p.missingReportDays),before1030Count:total(p=>p.before1030Count),after1030Count:total(p=>p.after1030Count),totalRevenue,totalQty:total(p=>p.qty),dailyAvgRevenue,efficiencyRate:dailyAvgRevenue}};
}
export function buildV4ProjectProgress(v4Cases:TableData["records"], v4ContractItems:TableData["records"], v4ReportItems:TableData["records"], v4InternalWork:TableData["records"], v3Cases:TableData["records"] = []) {
 type Item={name:string;contractQty:number|null;contractRevenue:number|null;completedQty:number;completedRevenue:number;orderCount:number};
 type Project={caseCode:string;caseName:string;status:string;contractQty:number|null;contractRevenue:number|null;completedQty:number;completedRevenue:number;orderCount:number;isV4Contract:boolean;hasWork:boolean;items:Item[];caseRevenue:number|null;itemQty:number|null;itemRevenue:number|null;reportQty:number|null;reportRevenue:number|null;caseAmount:number|null;itemAmount:number|null;remainingAmount:number|null};
 const projects=new Map<string,Project>(), ids=new Map<string,string>(), itemIds=new Map<string,{code:string;item:Item}>(), fallback=new Map<string,string>();
 const codeOf=(r:TableData["records"][number], fields:string[])=>{for(const k of fields){const raw=text(r.fields[k]); const m=raw.match(/([A-Z]\d{6}|\b1\d{5}\b)/i); if(m && m[1].toUpperCase()!=="C000000") return m[1].toUpperCase(); for(const id of r.links?.[k] ?? []) {const c=ids.get(id);if(c)return c;}} return "";};
 const get=(code:string)=>{let p=projects.get(code); if(!p){p={caseCode:code,caseName:fallback.get(code) ?? "",status:"",contractQty:null,contractRevenue:null,completedQty:0,completedRevenue:0,orderCount:0,isV4Contract:false,hasWork:false,items:[],caseRevenue:null,itemQty:null,itemRevenue:null,reportQty:null,reportRevenue:null,caseAmount:null,itemAmount:null,remainingAmount:null};projects.set(code,p);}return p;};
 const sumFields=(r:TableData["records"][number], keys:string[])=>{const values=keys.map(k=>num(r.fields[k])).filter((v):v is number=>v!==null);return values.length ? values.reduce((a,b)=>a+b,0) : null;};
 const add=(a:number|null,b:number|null)=>b===null?a:(a ?? 0)+b;
 const positive=(n:number|null)=>n !== null && n > 0 ? n : null;
 const reportByItem=new Map<Item,number>();
 for(const r of v3Cases){const c=codeOf(r,["案件編號"]);if(c)fallback.set(c,text(r.fields["案件名稱"]));}
 for(const r of v4Cases){const c=codeOf(r,["工程編號","所屬案件","工編淨","工程確認單編號"]);if(!c)continue;ids.set(r.id,c);const p=get(c);p.isV4Contract=true;p.caseName=text(r.fields["工程名稱"]) || p.caseName;p.status=text(r.fields["狀態"]);p.caseRevenue=add(p.caseRevenue,sumFields(r,["控制總工天","圖資總工天","報告總工天"]));p.caseAmount=add(p.caseAmount,num(r.fields["B｜報價(營業額)"]) ?? num(r.fields["合約總額"]));p.remainingAmount=add(p.remainingAmount,num(r.fields["剩餘額度"]));}
 for(const r of v4ContractItems){const c=codeOf(r,["工編號碼","工程編號","所屬案件","所屬成案確認單（日報關聯）"]);if(!c)continue;ids.set(r.id,c);const p=get(c);p.isV4Contract=true;const qty=sumFields(r,["控制數量","圖資數量","報告數量"]), rev=positive(num(r.fields["預期營業額點數"])) ?? sumFields(r,["控制預估工天","圖資預估工天","報告預估工天"]);p.itemAmount=add(p.itemAmount,num(r.fields["合約金額(報出)"]));p.itemQty=add(p.itemQty,qty);p.itemRevenue=add(p.itemRevenue,rev);const item={name:text(r.fields["合約工作項目"] ?? r.fields["工項名稱"] ?? r.fields["合約項次"]) || "未命名工項",contractQty:qty,contractRevenue:rev,completedQty:0,completedRevenue:0,orderCount:0};p.items.push(item);itemIds.set(r.id,{code:c,item});}
 for(const r of v4ReportItems){if(!/^(控制|圖資|報告)$/.test(text(r.fields["工項類別"])))continue;const c=codeOf(r,["工編號碼","工程編號","所屬案件","對應合約明細"]);if(!c)continue;ids.set(r.id,c);const p=get(c);p.reportQty=add(p.reportQty,num(r.fields["基準數量"]));const standard=positive(num(r.fields["標準點數"]));p.reportRevenue=add(p.reportRevenue,standard);for(const id of r.links?.["對應合約明細"] ?? []){const linked=itemIds.get(id);if(linked?.code===c && standard!==null) reportByItem.set(linked.item,(reportByItem.get(linked.item) ?? 0)+standard);}if(!p.items.length || p.itemQty===null){const item={name:text(r.fields["工項名稱"] ?? r.fields["填報工項"]) || "未命名工項",contractQty:num(r.fields["基準數量"]),contractRevenue:num(r.fields["標準點數"]),completedQty:0,completedRevenue:0,orderCount:0};p.items.push(item);itemIds.set(r.id,{code:c,item});}}
 for(const r of v4InternalWork){const c=codeOf(r,["所屬案件","案件編號","對應合約明細","備註工編淨","可能的確認單工編(若暫無確認單才需填寫)"]);if(!c)continue;const p=get(c);p.hasWork=true;const q=num(r.fields["執行工作數量"]) ?? num(r.fields["計價數量"]) ?? num(r.fields["對外計價數量"]) ?? 0, rev=num(r.fields["最終營業額點數"]) ?? num(r.fields["營業額點數"]) ?? 0;p.completedQty+=q;p.completedRevenue+=rev;p.orderCount++;const item=(r.links?.["對應合約明細"] ?? []).map(id=>itemIds.get(id)).find(x=>x?.code===c)?.item ?? p.items.find(i=>i.name===text(r.fields["內業工項"] ?? r.fields["合約工項"]));if(item){item.completedQty+=q;item.completedRevenue+=rev;item.orderCount++;}}
 for(const [item,standard] of reportByItem) item.contractRevenue=standard;
 const allProjects=[...projects.values()].map(p=>{const contractQty=p.itemQty ?? p.reportQty, contractRevenue=positive(p.reportRevenue) ?? positive(p.itemRevenue) ?? p.caseRevenue ?? p.itemRevenue; return {...p,contractAmount:p.caseAmount ?? p.itemAmount,contractQty,contractRevenue,remainingQty:contractQty===null?null:Math.max(0,contractQty-p.completedQty),remainingRevenue:contractRevenue===null?null:Math.max(0,contractRevenue-p.completedRevenue),completionRate:contractRevenue && contractRevenue>0?p.completedRevenue/contractRevenue:contractQty && contractQty>0?p.completedQty/contractQty:null,items:p.items.map(i=>({...i,remainingQty:i.contractQty===null?null:Math.max(0,i.contractQty-i.completedQty),remainingRevenue:i.contractRevenue===null?null:Math.max(0,i.contractRevenue-i.completedRevenue)}))};});
 return {allProjects,v4ContractProjects:allProjects.filter(p=>p.isV4Contract),activeWorkProjects:allProjects.filter(p=>p.hasWork)};
}
