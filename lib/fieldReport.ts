// R10 外業報告（外業經理用）— 預排 vs 實際（以案件為單位）、上週異常與人工確認案件、檢核待辦。
// 口徑（沿用 R01，業主已裁示）：
//  - 外業以「組」為單位；預排只取業別＝外業，ROV 組一律算外業；預排組名去尾「組」比對（水深A組＝水深A）。
//  - 工作單與預排的案件以「工程」為單位比對（業主 2026-10-13：工程編號＝案件編號前 7 碼；C115016、C115016A、C115016-2-1 同屬工程 C115016）。
//    案件先用 link record_id 查案件表取得案件編號，再套 engineeringCode：符合 ^[A-Z]\d{6}(?!\d)（trim、轉大寫，第 8 碼是數字不取）
//    且不是 C000000 → 工程鍵＝前 7 碼；否則（空白、C000000、格式不符）不合併，一案一列（鍵＝record_id）。
//    案件表查得到該記錄 → 只認案件表的編號（空白就不合併）；記錄不在案件表、或沒有案件表 → 才用標題／編號文字備援。
//    工程名稱與「等 n 案」只看本週預排或工作單實際連到的案件記錄。「編號重複」＝本週涉及的案件中，有任一筆的完整編號在案件表出現 ≥2 筆；
//    沒有案件表時改看畫面上是否有兩列以上顯示相同完整編號。
//  - 週＝週一至週日（Asia/Taipei）；排除行政／業務／內業／資訊組與未對應組別（同 R01 的 keepGroup）。
//  - 組日＝（組別, 日期）；吻合＝同組同日同案。預排日晚於今天的不算（尚未到期，不能說「沒做」）。
//  - 期限（N+1/N+2）與節點狀態沒有口徑，這裡完全不算。
// 這個檔案不 import 其他 lib 檔：Node 直跑 .ts 時模組間不能省副檔名、tsconfig 又不允許 .ts 副檔名，
// 所以 groupKey／ROV／keepGroup 在這裡各存一份，scripts/test-field-report.mjs 會對照 controlGroup.ts 與 GroupBoard.tsx 防止走樣。
import type { CellValue, FieldMeta, TableData } from "./types";

// 工程編號＝案件編號前 7 碼（R09 的 lib/internalReport.ts 另存一份同規則，測試比對兩者輸出一致）。
export function engineeringCode(no: string | null | undefined): string | null {
  const m = /^[A-Z]\d{6}(?!\d)/.exec(String(no ?? "").trim().toUpperCase());
  return m && m[0] !== "C000000" ? m[0] : null;
}

type Rec = TableData["records"][number];
const DAY = 86400000;
const TZ = 8 * 3600000; // Asia/Taipei
export const taipeiDay = (t: number) => Math.floor((t + TZ) / DAY);

// 工作預排表 tblN8c3WN44233aG 的欄位 id（fid↔語意永遠不變，欄名會被 UI 改）。
export const FIELD_SCHEDULE_FID = {
  start: "fldMXOggGP", // 真起日
  end: "fldjWv1xST", // 真訖日
  trade: "fldrENe4H6",
  group: "fldNDUy2XP",
  kind: "fld78OmLVn", // 條類型（出工／休假）
  job: "fldnzMsrzZ", // 案件（link → 案件）
  people: "fld7KNCsVe",
  points: "fld5lTSN1r",
} as const;

// ---- 與 R01 同口徑的小工具（有對照測試）----
export const groupKey = (g: string) => {
  const k = g.trim().replace(/組$/, "");
  return k.toUpperCase() === "ROV" ? "ROV" : k; // ROV／rov 同一組
};
export const isRovGroup = (g: string) => groupKey(g) === "ROV";
export const keepFieldSchedule = (trade: string, group: string) => isRovGroup(group) || trade.trim() === "外業";
export const KEEP_GROUP_EXCLUDE = /行政|業務|业务|內業|内业|資訊|资讯/;
export const keepFieldGroup = (g: string) => !KEEP_GROUP_EXCLUDE.test(g) && !/^(it|id|rec[A-Za-z0-9]{6,})$/i.test(g.trim()) && !/(^|[^a-z])it([^a-z]|$)/i.test(g);

const NO_GROUP = "（未填組別）";
const NO_CASE = "∅"; // 沒連案件
export const NO_CASE_LABEL = "（未連案件）";

const text = (v: CellValue | undefined): string => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v));
const pick = (fields: FieldMeta[], names: string[], kinds?: FieldMeta["kind"][]) => names.map((n) => fields.find((f) => f.name === n && (!kinds || kinds.includes(f.kind)))).find(Boolean);

export type CaseResult = "有排有做" | "有排未做" | "未排有做" | "預排讀不到";
export type ExceptionKind = "未排有做" | "有排未做" | "工作單異常";

export interface CaseRow {
  caseId: string; // 工程鍵 P:前7碼；不合併的案件為 record_id（讀不到時為 t:標題）
  no: string; // 工程編號（前 7 碼；不合併的案件為案件編號原文）
  dup?: boolean; // 工程內有完整案件編號相同的不同記錄（或 C000000 等占位碼重複）
  name: string; // 案件名稱（工程簡稱）
  planGroups: string[]; // 預排組別
  actualGroups: string[]; // 實際出工組別
  planGroupDays: number;
  actualGroupDays: number;
  matchedGroupDays: number; // 同組同日同案
  points: number; // 實際營業額點數
  orders: number;
  result: CaseResult;
}

export interface ExceptionRow {
  n: number; // 項次
  kind: ExceptionKind;
  group: string;
  gk: string;
  caseId: string;
  no: string;
  name: string;
  from: number; // Taipei 日序號
  to: number;
  days: number; // 實際出工天數（有排未做＝0）
  points: number; // 營業額點數合計
  orders: number;
  desc: string[]; // 說明（工作單「突發狀況」「備註」原文等）
}

export interface CheckRow {
  group: string;
  orders: number;
  managerUnchecked: number;
  controlUnchecked: number;
  returned: number;
}

export interface FieldReport {
  summary: {
    planGroupDays: number; // 預排組日
    hitGroupDays: number; // 預排的組日當天有出工
    missedGroupDays: number; // 預排的組日當天沒出工
    actualGroupDays: number; // 實際出工組日
    unplannedGroupDays: number; // 計畫外出工（該組該日完全沒預排）
    planCases: number;
    actualCases: number;
    caseOverlap: number; // 預排案件 ∩ 出工案件
    orders: number;
    points: number;
    blankPoints: number; // 沒填點數的工作單
  };
  unplannedByGroup: { group: string; days: number }[];
  cases: CaseRow[];
  exceptions: ExceptionRow[];
  checks: CheckRow[];
  checksTotal: Omit<CheckRow, "group">;
  hasFields: { manager: boolean; control: boolean; status: boolean };
  hiddenGroups: { group: string; orders: number }[];
  scheduleOn: boolean;
  notes: string[];
}

export interface FieldReportInput {
  work: TableData;
  sched?: TableData;
  cases?: TableData;
  start: number; // epoch ms, inclusive
  end: number; // epoch ms, exclusive
  today?: number; // epoch ms；預排日 ≥ 今天（台北）尚未到期，不納入比較。預設現在。
}

interface FOrder {
  rec: Rec;
  no: string;
  day: number;
  g: string; // groupKey
  caseKey: string;
  caseTitle: string;
  caseNo: string;
  points: number | null;
  incident: string;
  note: string;
  advice: string;
  returned: boolean;
  qty: number | null;
  qtyFixed: number | null;
  qtyDiff: boolean;
  mgrOk: boolean;
  ctrlOk: boolean;
}

const WD = "日一二三四五六";
export const fmtDay = (d: number) => {
  const x = new Date(d * DAY);
  return `${String(x.getUTCMonth() + 1).padStart(2, "0")}/${String(x.getUTCDate()).padStart(2, "0")}`;
};
export const fmtDayWd = (d: number) => `${fmtDay(d)}（${WD[new Date(d * DAY).getUTCDay()]}）`;
export const fmtRange = (from: number, to: number) => (from === to ? fmtDayWd(from) : `${fmtDay(from)}～${fmtDay(to)}`);

const num = (v: CellValue | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
// V3 的外業經理檢核、控制組檢核是核取方塊（沒勾＝false 或空）；選項型（V4、示範資料）只認「通過」類。
const checked = (v: CellValue | undefined) => v === true || (typeof v === "string" && /^(已?通過|已檢核|是|ok|✓|true)$/i.test(v.trim()));

// 把同組同案的日期合併：連續的日曆日併成一段（中斷就另起一段）。
function mergeDays(days: number[]): [number, number][] {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && d === last[1] + 1) last[1] = d;
    else out.push([d, d]);
  }
  return out;
}

export function buildFieldReport(p: FieldReportInput): FieldReport {
  const { work, sched, cases, start, end } = p;
  const notes: string[] = [];
  const winFirst = taipeiDay(start);
  const winLast = taipeiDay(end - 1);
  const todayDay = taipeiDay(p.today ?? Date.now());
  const lastDue = Math.min(winLast, todayDay - 1); // 預排日要「早於今天」才算到期

  // ---- 案件資料（record_id → 編號、名稱）----
  const caseMeta = new Map<string, { no: string; name: string }>();
  const caseByNo = new Map<string, { id: string; no: string; name: string } | null>(); // 完整編號（trim、大寫）→ 案件表唯一記錄（出現不只一筆＝null）；記錄不在表或只有編號文字時備援
  const codeCount = new Map<string, number>(); // 完整案件編號（trim、大寫）出現次數
  if (cases) {
    const prim = cases.fields.find((f) => f.primary) ?? cases.fields[0];
    const fNo = pick(cases.fields, ["案件編號"]) ?? prim;
    const fName = pick(cases.fields, ["案件名稱", "工程名稱", "名稱"]);
    for (const r of cases.records) {
      const m = { no: fNo ? text(r.fields[fNo.name]).trim() : "", name: fName ? text(r.fields[fName.name]).trim() : "" };
      caseMeta.set(r.id, m);
      const full = m.no.toUpperCase();
      if (full) caseByNo.set(full, caseByNo.has(full) ? null : { id: r.id, ...m });
      if (full) codeCount.set(full, (codeCount.get(full) ?? 0) + 1);
    }
  }
  const labels = new Map<string, string>(); // groupKey → 顯示名（工作單上的寫法優先）
  const labelOf = (g: string) => labels.get(g) ?? g;

  // ---- 外業工作單（本週、外業組）----
  const wf = {
    date: pick(work.fields, ["出工日期", "工作日期-薪資", "工作日期", "出工日"], ["date"]),
    group: pick(work.fields, ["組別"]),
    link: pick(work.fields, ["所屬案件", "案件"]),
    caseNo: pick(work.fields, ["案件編號", "工程編號"]),
    no: pick(work.fields, ["工作單號"]) ?? work.fields.find((f) => f.primary),
    pts: pick(work.fields, ["最終營業額點數", "營業額點數", "點數"], ["number"]),
    qty: pick(work.fields, ["完成數量", "計價數量", "數量"], ["number"]),
    qtyFixed: pick(work.fields, ["修改後數量"], ["number"]),
    incident: pick(work.fields, ["突發狀況"]),
    note: pick(work.fields, ["備註"]),
    advice: pick(work.fields, ["修改意見"]),
    status: pick(work.fields, ["檢核狀態"]),
    ctrl: pick(work.fields, ["控制組檢核"]),
    mgr: pick(work.fields, ["外業經理檢核"]),
  };
  const orders: FOrder[] = [];
  const hidden = new Map<string, number>();
  let noCaseOrders = 0;
  if (wf.date) {
    for (const r of work.records) {
      const t = r.fields[wf.date.name];
      if (typeof t !== "number") continue;
      const day = taipeiDay(t);
      if (day < winFirst || day > winLast) continue;
      const rawGroup = (wf.group ? text(r.fields[wf.group.name]).trim() : "") || NO_GROUP;
      if (!keepFieldGroup(rawGroup)) {
        hidden.set(rawGroup, (hidden.get(rawGroup) ?? 0) + 1);
        continue;
      }
      const g = groupKey(rawGroup);
      if (!labels.has(g)) labels.set(g, rawGroup === NO_GROUP ? NO_GROUP : isRovGroup(rawGroup) ? "ROV" : rawGroup);
      const ids = (wf.link && r.links?.[wf.link.name]) || [];
      const titles = wf.link ? (Array.isArray(r.fields[wf.link.name]) ? (r.fields[wf.link.name] as string[]) : text(r.fields[wf.link.name]) ? [text(r.fields[wf.link.name])] : []) : [];
      const caseNoText = wf.caseNo ? text(r.fields[wf.caseNo.name]).trim() : "";
      const title = (titles[0] ?? "").trim() || caseNoText;
      const caseKey = ids[0] ?? (title ? `t:${title}` : NO_CASE);
      if (caseKey === NO_CASE) noCaseOrders++;
      const qty = wf.qty ? num(r.fields[wf.qty.name]) : null;
      const qtyFixed = wf.qtyFixed ? num(r.fields[wf.qtyFixed.name]) : null;
      orders.push({
        rec: r,
        no: wf.no ? text(r.fields[wf.no.name]).trim() : r.id,
        day,
        g,
        caseKey,
        caseTitle: title,
        caseNo: caseNoText || title,
        points: wf.pts ? num(r.fields[wf.pts.name]) : null,
        incident: wf.incident ? text(r.fields[wf.incident.name]).trim() : "",
        note: wf.note ? text(r.fields[wf.note.name]).trim() : "",
        advice: wf.advice ? text(r.fields[wf.advice.name]).trim() : "",
        returned: wf.status ? text(r.fields[wf.status.name]).trim() === "已退回" : false, // 選項「已退回 」結尾有空白
        qty,
        qtyFixed,
        qtyDiff: qty !== null && qtyFixed !== null && Math.abs(qty - qtyFixed) > 1e-6,
        mgrOk: wf.mgr ? checked(r.fields[wf.mgr.name]) : false,
        ctrlOk: wf.ctrl ? checked(r.fields[wf.ctrl.name]) : false,
      });
    }
  } else notes.push("外業工作單找不到「出工日期」欄，無法依週篩選");
  if (noCaseOrders) notes.push(`${noCaseOrders} 張工作單沒有連結案件：只計入組日，不進案件比對`);

  // 案件顯示（編號＋名稱）：先用案件表的 record_id，其次案件表同編號唯一者，最後用工作單／預排上的標題。
  const metaCache = new Map<string, { no: string; name: string }>();
  const hints = new Map<string, string>(); // caseKey → 標題／編號文字
  for (const o of orders) if (o.caseKey !== NO_CASE && !hints.has(o.caseKey)) hints.set(o.caseKey, o.caseNo || o.caseTitle);
  const involved = new Map<string, Set<string>>(); // 工程鍵 → 本週預排或工作單實際連到的案件鍵（record_id 或 t:標題）
  const allKeys = new Set<string>(); // 本週涉及的全部案件鍵（含不合併的單列）
  const fullCode = (key: string) => {
    const meta = caseMeta.get(key);
    return (meta ? meta.no : hints.get(key) ?? "").trim().toUpperCase();
  };
  // 本週涉及的「不重複案件」與編號重複：同一案件以 record_id 與純文字各出現一次只算 1（文字能在案件表以完整編號找到唯一記錄就視同那筆；找不到就看有沒有同編號的 record_id；都沒有以完整編號去重）。
  let resolvedCache: { entOf: Map<string, string>; dupCodes: Set<string> } | null = null;
  const resolved = () => {
    if (resolvedCache) return resolvedCache;
    const entOf = new Map<string, string>();
    const idByCode = new Map<string, string>();
    for (const k of [...allKeys].sort()) if (!k.startsWith("t:")) {
      const c = fullCode(k);
      if (c && !idByCode.has(c)) idByCode.set(c, k);
    }
    for (const k of allKeys) {
      if (!k.startsWith("t:")) {
        entOf.set(k, k);
        continue;
      }
      const c = fullCode(k);
      entOf.set(k, !c ? k : caseByNo.get(c)?.id ?? idByCode.get(c) ?? `c:${c}`);
    }
    // 編號重複：(i) 涉及的某筆完整編號在案件表出現 ≥2 筆；(ii) 涉及的不同案件（不同 record_id）卻有相同完整編號（不在案件表的 record_id 也算）
    const entsByCode = new Map<string, Set<string>>();
    const dupCodes = new Set<string>();
    for (const k of allKeys) {
      const c = fullCode(k);
      if (!c) continue;
      if ((codeCount.get(c) ?? 0) > 1) dupCodes.add(c);
      if (!entsByCode.has(c)) entsByCode.set(c, new Set());
      entsByCode.get(c)!.add(entOf.get(k)!);
    }
    for (const [c, ents] of entsByCode) if (ents.size > 1) dupCodes.add(c);
    return (resolvedCache = { entOf, dupCodes });
  };
  const nameByCode = (code: string) => caseByNo.get(code)?.name ?? "";
  const metaOf = (key: string) => {
    if (key === NO_CASE) return { no: NO_CASE_LABEL, name: "" };
    const hit = metaCache.get(key);
    if (hit) return hit;
    const { entOf } = resolved();
    if (key.startsWith("P:")) {
      // 工程：編號＝前 7 碼；名稱只取本週實際涉及的案件（依案件編號排序第一個有名稱的），涉及不只一案時加「等 n 案」（同一案件只算 1）
      const ents = new Map<string, { code: string; name: string }>();
      for (const k of involved.get(key) ?? []) {
        const e = entOf.get(k)!;
        if (ents.has(e)) continue;
        const meta = caseMeta.get(e);
        const code = fullCode(k);
        ents.set(e, { code, name: meta ? meta.name : nameByCode(code) });
      }
      const members = [...ents].map(([e, v]) => ({ e, ...v })).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : a.e < b.e ? -1 : 1));
      const first = members.find((m) => m.name)?.name ?? "";
      const out = { no: key.slice(2), name: members.length > 1 && first ? `${first}等 ${members.length} 案` : first };
      metaCache.set(key, out);
      return out;
    }
    const byId = caseMeta.get(key);
    const hint = hints.get(key) ?? "";
    const byNo = !byId && hint ? caseByNo.get(hint.trim().toUpperCase()) : null;
    const m = byId ?? byNo ?? { no: hint || key, name: "" };
    const out = { no: m.no || hint || key, name: m.name };
    metaCache.set(key, out);
    return out;
  };
  const dupOfRow = (key: string) => {
    const { dupCodes } = resolved();
    return [...(key.startsWith("P:") ? involved.get(key) ?? [] : [key])].some((k) => dupCodes.has(fullCode(k)));
  };
  // 案件鍵 → 工程鍵：案件表查得到該記錄 → 只認案件表的編號（空白就不合併）；查不到或沒有案件表 → 才用標題／編號文字。
  const projOf = (key: string) => {
    if (key === NO_CASE) return key;
    allKeys.add(key);
    const pc = engineeringCode(fullCode(key));
    if (!pc) return key;
    const pk = `P:${pc}`;
    if (!involved.has(pk)) involved.set(pk, new Set());
    involved.get(pk)!.add(key);
    return pk;
  };

  // ---- 預排（外業＋ROV）→ 組日×案件 ----
  type Triple = { g: string; day: number; caseKey: string };
  const plan = new Map<string, Triple>(); // g|day|case
  let scheduleOn = false;
  let planNoGroup = 0;
  if (sched) {
    const byId = (id: string) => sched.fields.find((f) => f.id === id);
    const sf = {
      start: byId(FIELD_SCHEDULE_FID.start) ?? pick(sched.fields, ["開始日期", "日期", "預排開始日", "預排日期"], ["date"]),
      end: byId(FIELD_SCHEDULE_FID.end) ?? pick(sched.fields, ["結束日期", "預排結束日"], ["date"]),
      trade: byId(FIELD_SCHEDULE_FID.trade) ?? pick(sched.fields, ["業別"]),
      group: byId(FIELD_SCHEDULE_FID.group) ?? pick(sched.fields, ["組別"]),
      kind: byId(FIELD_SCHEDULE_FID.kind) ?? pick(sched.fields, ["條類型"]),
      job: byId(FIELD_SCHEDULE_FID.job) ?? pick(sched.fields, ["案件", "案件編號", "工程編號"]),
    };
    if (sf.start && sf.group) {
      scheduleOn = true;
      for (const r of sched.records) {
        const s = r.fields[sf.start.name];
        if (typeof s !== "number") continue;
        if (sf.kind && /休假|請假/.test(text(r.fields[sf.kind.name]))) continue; // 休假不是預排出工
        const e0 = sf.end ? r.fields[sf.end.name] : null;
        const e = typeof e0 === "number" && e0 >= s ? e0 : s;
        const from = Math.max(taipeiDay(s), winFirst);
        const to = Math.min(taipeiDay(e), lastDue);
        if (to < from) continue;
        const trade = sf.trade ? text(r.fields[sf.trade.name]) : "";
        const gv = r.fields[sf.group.name];
        const groups = (Array.isArray(gv) ? gv : [text(gv)]).map((x) => String(x).trim()).filter(Boolean);
        if (!groups.length) {
          if (/外業/.test(trade)) planNoGroup++;
          continue;
        }
        const ids = (sf.job && r.links?.[sf.job.name]) || [];
        const jv = sf.job ? r.fields[sf.job.name] : null;
        const titles = (Array.isArray(jv) ? jv : jv ? [String(jv)] : []).map((x) => String(x).trim());
        const keys = ids.length ? ids : titles.filter(Boolean).map((t) => `t:${t}`);
        if (ids.length) ids.forEach((id, i) => titles[i] && !hints.has(id) && hints.set(id, titles[i]));
        else titles.forEach((t) => t && !hints.has(`t:${t}`) && hints.set(`t:${t}`, t));
        for (const raw of groups) {
          if (!keepFieldSchedule(trade, raw) || !keepFieldGroup(raw)) continue;
          const g = groupKey(raw);
          if (!labels.has(g)) labels.set(g, g);
          for (let d = from; d <= to; d++) for (const c of keys.length ? keys : [NO_CASE]) plan.set(`${g}|${d}|${c}`, { g, day: d, caseKey: c });
        }
      }
    } else notes.push("預排表找不到組別或真起日欄位（以 field id 比對），無法比對預排");
  } else notes.push("預排表讀不到，無法比對預排（只列實際出工與檢核）");
  if (planNoGroup) notes.push(`${planNoGroup} 條外業預排沒填組別，不列入`);

  // ---- 案件 → 工程（工作單與預排都改用工程鍵；之後的比對、彙總、異常列全部以工程為單位）----
  for (const o of orders) o.caseKey = projOf(o.caseKey);
  for (const [k, t] of [...plan]) {
    plan.delete(k);
    t.caseKey = projOf(t.caseKey);
    plan.set(`${t.g}|${t.day}|${t.caseKey}`, t);
  }

  // ---- 組日 ----
  const act = new Map<string, FOrder[]>(); // g|day|case → 工作單
  const actGD = new Set<string>();
  for (const o of orders) {
    const k = `${o.g}|${o.day}|${o.caseKey}`;
    if (!act.has(k)) act.set(k, []);
    act.get(k)!.push(o);
    actGD.add(`${o.g}|${o.day}`);
  }
  const planGD = new Set([...plan.values()].map((t) => `${t.g}|${t.day}`));
  let hit = 0;
  for (const k of planGD) if (actGD.has(k)) hit++;
  const unplannedGD = [...actGD].filter((k) => !planGD.has(k));
  const unplannedBy = new Map<string, number>();
  for (const k of unplannedGD) {
    const g = k.slice(0, k.lastIndexOf("|"));
    unplannedBy.set(g, (unplannedBy.get(g) ?? 0) + 1);
  }

  // 一個「實際」是否有預排：同組同日同案；或預排只填組日沒填案件；或工作單沒連案件而該組日有任何預排。
  const planned = (g: string, d: number, c: string) => plan.has(`${g}|${d}|${c}`) || plan.has(`${g}|${d}|${NO_CASE}`) || (c === NO_CASE && planGD.has(`${g}|${d}`));
  // 一個「預排（有案件）」是否有做：同組同日同案；或該組該日有工作單但沒連案件（不能斷定沒做）。
  const done = (g: string, d: number, c: string) => act.has(`${g}|${d}|${c}`) || act.has(`${g}|${d}|${NO_CASE}`);

  // ---- 案件列 ----
  const planBy = new Map<string, Set<string>>(); // case → g|day
  const actBy = new Map<string, Set<string>>();
  const ptsBy = new Map<string, { points: number; orders: number }>();
  for (const t of plan.values()) {
    if (t.caseKey === NO_CASE) continue;
    if (!planBy.has(t.caseKey)) planBy.set(t.caseKey, new Set());
    planBy.get(t.caseKey)!.add(`${t.g}|${t.day}`);
  }
  for (const o of orders) {
    if (o.caseKey === NO_CASE) continue;
    if (!actBy.has(o.caseKey)) actBy.set(o.caseKey, new Set());
    actBy.get(o.caseKey)!.add(`${o.g}|${o.day}`);
    const cur = ptsBy.get(o.caseKey) ?? { points: 0, orders: 0 };
    cur.points += o.points ?? 0;
    cur.orders += 1;
    ptsBy.set(o.caseKey, cur);
  }
  const groupsOf = (s: Set<string> | undefined) => [...new Set([...(s ?? [])].map((k) => labelOf(k.slice(0, k.lastIndexOf("|")))))].sort((a, b) => a.localeCompare(b));
  const caseKeys = new Set([...planBy.keys(), ...actBy.keys()]);
  const order: Record<CaseResult, number> = { 有排有做: 0, 有排未做: 1, 未排有做: 2, 預排讀不到: 3 };
  const caseRows: CaseRow[] = [...caseKeys].map((key) => {
    const pl = planBy.get(key);
    const ac = actBy.get(key);
    const m = metaOf(key);
    const matched = pl && ac ? [...pl].filter((k) => ac.has(k)).length : 0;
    const result: CaseResult = !scheduleOn ? "預排讀不到" : pl?.size && ac?.size ? "有排有做" : pl?.size ? "有排未做" : "未排有做";
    return {
      caseId: key,
      no: m.no,
      name: m.name,
      planGroups: groupsOf(pl),
      actualGroups: groupsOf(ac),
      planGroupDays: pl?.size ?? 0,
      actualGroupDays: ac?.size ?? 0,
      matchedGroupDays: matched,
      points: ptsBy.get(key)?.points ?? 0,
      orders: ptsBy.get(key)?.orders ?? 0,
      result,
      dup: dupOfRow(key),
    };
  });
  caseRows.sort((a, b) => order[a.result] - order[b.result] || b.points - a.points || a.no.localeCompare(b.no));

  // ---- 異常與人工確認 ----
  const exceptions: Omit<ExceptionRow, "n">[] = [];
  const lineOf = (o: FOrder, parts: string[]) => [o.no, ...parts].filter(Boolean).join("｜");
  const annot = (o: FOrder) => [o.incident && `突發：${o.incident}`, o.note && `備註：${o.note}`].filter(Boolean) as string[];
  const caseLabel = (c: string) => metaOf(c).no;
  const isFlagged = (o: FOrder) => Boolean(o.incident || o.returned || o.qtyDiff);

  // 未排有做：實際（組,日,案）沒有對應預排
  if (scheduleOn) {
    const rows = new Map<string, { g: string; c: string; days: number[]; os: FOrder[] }>();
    for (const os of act.values()) {
      const { g, day: d, caseKey: c } = os[0];
      if (planned(g, d, c)) continue;
      const rk = `${g}|${c}`;
      if (!rows.has(rk)) rows.set(rk, { g, c, days: [], os: [] });
      rows.get(rk)!.days.push(d);
      rows.get(rk)!.os.push(...os);
    }
    for (const { g, c, days, os } of rows.values()) {
      for (const [from, to] of mergeDays(days)) {
        const inRow = os.filter((o) => o.day >= from && o.day <= to);
        const instead = new Set<string>();
        for (const t of plan.values()) if (t.g === g && t.day >= from && t.day <= to && t.caseKey !== NO_CASE) instead.add(caseLabel(t.caseKey));
        // 已列在「工作單異常」的單不在這裡重複列說明；這裡只補沒被標異常、但有備註的單。
        const desc = [instead.size ? `該組當天預排的是：${[...instead].join("、")}` : "該組當天沒有預排", ...inRow.filter((o) => !isFlagged(o) && annot(o).length).map((o) => lineOf(o, annot(o)))];
        exceptions.push({ kind: "未排有做", group: labelOf(g), gk: g, caseId: c, no: metaOf(c).no, name: metaOf(c).name, from, to, days: new Set(inRow.map((o) => o.day)).size, points: inRow.reduce((s, o) => s + (o.points ?? 0), 0), orders: inRow.length, desc });
      }
    }
    // 有排未做：預排（組,日,案）當天沒有對應工作單
    const miss = new Map<string, { g: string; c: string; days: number[] }>();
    for (const t of plan.values()) {
      if (t.caseKey === NO_CASE || done(t.g, t.day, t.caseKey)) continue;
      const rk = `${t.g}|${t.caseKey}`;
      if (!miss.has(rk)) miss.set(rk, { g: t.g, c: t.caseKey, days: [] });
      miss.get(rk)!.days.push(t.day);
    }
    for (const { g, c, days } of miss.values()) {
      for (const [from, to] of mergeDays(days)) {
        const inRange = days.filter((d) => d >= from && d <= to).length;
        const instead = new Set<string>();
        for (const o of orders) if (o.g === g && o.day >= from && o.day <= to) instead.add(o.caseKey === NO_CASE ? NO_CASE_LABEL : caseLabel(o.caseKey));
        const desc = [`預排 ${inRange} 天，當天沒有此案的工作單`, instead.size ? `該組當天實際做：${[...instead].join("、")}` : "該組當天沒有任何工作單"];
        exceptions.push({ kind: "有排未做", group: labelOf(g), gk: g, caseId: c, no: metaOf(c).no, name: metaOf(c).name, from, to, days: 0, points: 0, orders: 0, desc });
      }
    }
  }
  // 工作單異常：突發狀況有填、已退回、修改後數量≠完成數量
  const flagged = new Map<string, { g: string; c: string; days: number[]; os: FOrder[] }>();
  for (const o of orders) {
    if (!isFlagged(o)) continue;
    const rk = `${o.g}|${o.caseKey}`;
    if (!flagged.has(rk)) flagged.set(rk, { g: o.g, c: o.caseKey, days: [], os: [] });
    flagged.get(rk)!.days.push(o.day);
    flagged.get(rk)!.os.push(o);
  }
  for (const { g, c, days, os } of flagged.values()) {
    for (const [from, to] of mergeDays(days)) {
      const inRow = os.filter((o) => o.day >= from && o.day <= to).sort((a, b) => a.day - b.day || a.no.localeCompare(b.no));
      const desc = inRow.map((o) => lineOf(o, [o.returned ? "已退回" : "", ...annot(o), o.returned && o.advice ? `修改意見：${o.advice}` : "", o.qtyDiff ? `完成數量 ${o.qty} → 修改後 ${o.qtyFixed}` : ""].filter(Boolean)));
      exceptions.push({ kind: "工作單異常", group: labelOf(g), gk: g, caseId: c, no: metaOf(c).no, name: metaOf(c).name, from, to, days: new Set(inRow.map((o) => o.day)).size, points: inRow.reduce((s, o) => s + (o.points ?? 0), 0), orders: inRow.length, desc });
    }
  }
  const kindOrder: Record<ExceptionKind, number> = { 未排有做: 0, 有排未做: 1, 工作單異常: 2 };
  exceptions.sort((a, b) => a.group.localeCompare(b.group) || a.from - b.from || kindOrder[a.kind] - kindOrder[b.kind] || a.no.localeCompare(b.no));

  // ---- 檢核待辦 ----
  const byGroup = new Map<string, CheckRow>();
  for (const o of orders) {
    let c = byGroup.get(o.g);
    if (!c) byGroup.set(o.g, (c = { group: labelOf(o.g), orders: 0, managerUnchecked: 0, controlUnchecked: 0, returned: 0 }));
    c.orders++;
    if (!o.mgrOk) c.managerUnchecked++;
    if (!o.ctrlOk) c.controlUnchecked++;
    if (o.returned) c.returned++;
  }
  const checks = [...byGroup.values()].sort((a, b) => b.returned - a.returned || b.managerUnchecked - a.managerUnchecked || a.group.localeCompare(b.group));
  const checksTotal = checks.reduce((t, c) => ({ orders: t.orders + c.orders, managerUnchecked: t.managerUnchecked + c.managerUnchecked, controlUnchecked: t.controlUnchecked + c.controlUnchecked, returned: t.returned + c.returned }), { orders: 0, managerUnchecked: 0, controlUnchecked: 0, returned: 0 });

  const planCases = [...planBy.keys()];
  const actCases = [...actBy.keys()];
  return {
    summary: {
      planGroupDays: planGD.size,
      hitGroupDays: hit,
      missedGroupDays: planGD.size - hit,
      actualGroupDays: actGD.size,
      unplannedGroupDays: scheduleOn ? unplannedGD.length : 0,
      planCases: planCases.length,
      actualCases: actCases.length,
      caseOverlap: planCases.filter((c) => actBy.has(c)).length,
      orders: orders.length,
      points: orders.reduce((s, o) => s + (o.points ?? 0), 0),
      blankPoints: orders.filter((o) => o.points === null).length,
    },
    unplannedByGroup: scheduleOn ? [...unplannedBy].map(([g, days]) => ({ group: labelOf(g), days })).sort((a, b) => b.days - a.days || a.group.localeCompare(b.group)) : [],
    cases: caseRows,
    exceptions: exceptions.map((e, i) => ({ ...e, n: i + 1 })),
    checks,
    checksTotal,
    hasFields: { manager: Boolean(wf.mgr), control: Boolean(wf.ctrl), status: Boolean(wf.status) },
    hiddenGroups: [...hidden].map(([group, n]) => ({ group, orders: n })).sort((a, b) => b.orders - a.orders),
    scheduleOn,
    notes,
  };
}

// 伺服器要哪些欄位（"#fld…" 依 field id；預排日期永遠不看欄名）。
export const FIELD_WORK_FIELDS = ["工作單號", "出工日期", "工作日期-薪資", "組別", "所屬案件", "案件編號", "最終營業額點數", "營業額點數", "完成數量", "修改後數量", "突發狀況", "備註", "修改意見", "檢核狀態", "控制組檢核", "外業經理檢核"];
export const FIELD_SCHEDULE_FIELDS = [
  ...(["start", "end", "trade", "group", "kind", "job"] as const).map((k) => `#${FIELD_SCHEDULE_FID[k]}`),
  "業別", "組別", "開始日期", "結束日期", "條類型", "案件", // V4 預排表 id 不同，退回用欄名
];
export const FIELD_CASE_FIELDS = ["案件編號", "案件名稱"];
