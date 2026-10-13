// R07 儀器管理系統（Base YHqcbb8MHa4VdGsA0UnjajNDpgd）的口徑，純函式、不連 Lark。
// 與 V3／V4 的儀器費率、車輛分開，不相加、不去重。
import type { CellValue } from "./types";

type Rec = { id?: string; fields: Record<string, CellValue> };
const TZ = 8 * 3600000;
const DAY = 86400000;
export const ALERT_DAYS = 30;

const str = (v: CellValue | undefined) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v)).trim();
const numOf = (v: CellValue | undefined) => (typeof v === "number" ? v : null);
const bump = (m: Record<string, number>, k: string) => {
  m[k] = (m[k] ?? 0) + 1;
};
// 台北日曆日差：due 所在日 − now 所在日
const dayDiff = (due: number, now: number) => Math.floor((due + TZ) / DAY) - Math.floor((now + TZ) / DAY);

// 儀器清單（業主同事 2026-10-13 回覆）：正式清單＝「- 儀器總表」，編號＝總表的「ID」欄；
// 可借用／異常／保養中 看「儀器 日租儀器」「儀器 月租儀器」兩張的「狀態」，兩張以「ID」對總表 ID。
// 日租／月租表裡有大量空白占位列（沒有 ID、沒有狀態），不算。系統封存的總表列不列、不算。
export const STATUS_KEYS = ["可借用", "異常", "保養中"] as const;
export const CONFLICT = "（兩表不一致）";
export type InventoryRow = {
  id: string;
  name: string;
  category: string;
  rentType: string;
  ownerGroup: string;
  masterStatus: string;
  status: string | null; // 日租／月租表的狀態；兩表都沒有＝null
  source: "daily" | "monthly" | null;
};
export function inventoryStatus(master: Rec[], daily: Rec[], monthly: Rec[]) {
  const active = master.filter((r) => r.fields["系統封存"] !== true);
  const activeIds = new Set(active.map((r) => str(r.fields["ID"])).filter(Boolean));
  const allIds = new Set(master.map((r) => str(r.fields["ID"])).filter(Boolean));
  const pick = (rows: Rec[]) => {
    const m = new Map<string, string>();
    let blank = 0;
    let real = 0;
    for (const r of rows) {
      const id = str(r.fields["ID"]);
      if (!id) {
        if (!str(r.fields["狀態"])) blank++;
        continue;
      }
      real++;
      m.set(id, str(r.fields["狀態"]));
    }
    return { m, blank, real };
  };
  const d = pick(daily);
  const mo = pick(monthly);
  const counts: Record<string, number> = { 可借用: 0, 異常: 0, 保養中: 0 };
  const otherStatus: Record<string, number> = {};
  let overlap = 0;
  let noStatusRow = 0;
  let masterBorrowed = 0;
  const rows: InventoryRow[] = active.map((r) => {
    const id = str(r.fields["ID"]);
    const inD = d.m.has(id);
    const inM = mo.m.has(id);
    let status: string | null = null;
    let source: InventoryRow["source"] = null;
    if (id && inD && inM) {
      overlap++;
      const a = d.m.get(id)!;
      const b = mo.m.get(id)!;
      status = a === b ? a || null : CONFLICT;
      source = "daily";
    } else if (id && inD) {
      status = d.m.get(id)! || null;
      source = "daily";
    } else if (id && inM) {
      status = mo.m.get(id)! || null;
      source = "monthly";
    }
    if (status === null) noStatusRow++;
    else if (status !== CONFLICT) {
      if (status in counts) counts[status]++;
      else bump(otherStatus, status);
    }
    if (str(r.fields["狀態"]) === "已借出") masterBorrowed++;
    return {
      id,
      name: str(r.fields["設備"]) || id,
      category: str(r.fields["設備類別"]),
      rentType: str(r.fields["rent_type"]),
      ownerGroup: str(r.fields["owner_group"]),
      masterStatus: str(r.fields["狀態"]),
      status,
      source,
    };
  });
  // 日租／月租有 ID、但不在（未封存的）總表：分開計，不併入數字。已封存的不算對不上。
  const unmatchedOf = (m: Map<string, string>) => [...m.keys()].filter((id) => !activeIds.has(id) && !allIds.has(id)).length;
  return {
    masterTotal: master.length,
    archived: master.length - active.length,
    active: active.length,
    counts,
    otherStatus,
    rows,
    overlap,
    noStatusRow,
    masterBorrowed,
    dailyReal: d.real,
    monthlyReal: mo.real,
    dailyBlank: d.blank,
    monthlyBlank: mo.blank,
    unmatched: { daily: unmatchedOf(d.m), monthly: unmatchedOf(mo.m) },
  };
}

export type DueState = "overdue" | "soon" | "ok" | "none";
export interface Due {
  state: DueState;
  days: number | null; // 負數＝已過幾天
  at: number | null;
}
const due = (v: CellValue | undefined, now: number): Due => {
  const at = numOf(v);
  if (at === null) return { state: "none", days: null, at: null };
  const days = dayDiff(at, now);
  return { state: days < 0 ? "overdue" : days <= ALERT_DAYS ? "soon" : "ok", days, at };
};

// 車輛：保養到期 next_maintenance、保險到期 insurance_date。只標示逾期與 30 天內，沒填就是「無資料」。
export function vehicleReminders(records: Rec[], now: number) {
  const rows = records
    .filter((r) => r.fields["系統封存"] !== true)
    .map((r) => ({
      plate: str(r.fields["車牌"]) || "（未填車牌）",
      status: str(r.fields["狀態"]),
      mileage: numOf(r.fields["current_mileage"]),
      maintenance: due(r.fields["next_maintenance"], now),
      insurance: due(r.fields["insurance_date"], now),
    }));
  const hit = (d: Due) => d.state === "overdue" || d.state === "soon";
  return {
    rows,
    maintenanceAlerts: rows.filter((r) => hit(r.maintenance)).length,
    insuranceAlerts: rows.filter((r) => hit(r.insurance)).length,
  };
}

// 預約單（借出）與歸還單。只算「已通过」，「已撤回」另計；依借出日期／歸還日期落在所選週。
// 借出未歸還改看「儀器借單明細」vs 歸還單，見 outstandingLoans。
export function bookingStats(bookings: Rec[], returns: Rec[], start: number, end: number) {
  const approved = (r: Rec) => str(r.fields["申请状态"]) === "已通过";
  const withdrawn = (r: Rec) => str(r.fields["申请状态"]) === "已撤回";
  const inWeek = (v: CellValue | undefined) => {
    const t = numOf(v);
    return t !== null && t >= start && t < end;
  };
  const lentByCategory: Record<string, number> = {};
  let lent = 0;
  let lentNoDate = 0;
  for (const r of bookings.filter(approved)) {
    if (numOf(r.fields["借出日期"]) === null) lentNoDate++;
    else if (inWeek(r.fields["借出日期"])) {
      lent++;
      bump(lentByCategory, str(r.fields["設備類別"]) || "（未填）");
    }
  }
  const returned = returns.filter((r) => approved(r) && inWeek(r.fields["歸還日期"])).length;
  const returnedNoDate = returns.filter((r) => approved(r) && numOf(r.fields["歸還日期"]) === null).length;
  return {
    lent,
    returned,
    lentByCategory,
    lentNoDate,
    returnedNoDate,
    lentWithdrawn: bookings.filter(withdrawn).length,
    returnedWithdrawn: returns.filter(withdrawn).length,
    bookingTotal: bookings.length,
    returnTotal: returns.length,
  };
}

// 借出未歸還：「儀器借單明細」vs 已通過的「儀器管理歸還單」（業主同事 2026-10-13 指定的對照）。
// 實際格式（2026-10-13 唯讀實測）：
//  - 借單明細的識別欄分散在 借出儀器/車輛（30 筆只有 1～2 筆有值）、日租ID、月租ID、車牌；依序取第一個有值的。
//  - 歸還單「借出儀器/車輛」有兩種：「{姓名}{設備類別}{ID}」（姓名緊貼在前），或「{姓名} {日期} {類別} {ID}    {12 碼申請編號}」（空白分隔、結尾多一串申請編號）。
//  - 比對規則：先試原值、再試去掉結尾申請編號（8 碼以上的純數字，可帶括號）的值；去空白後完全相同，或以借單識別值「結尾」且結尾前一字不是英數字／連字號
//    （避免 T1 對到 XT1）。前一字若是英數字但原值在該處有空白（例「GPS S901」），視為邊界成立。
//  - 日期：借單有借出日期、歸還單有歸還日期時，歸還日期須在借出日期當天或之後（台北日曆日），舊的歸還單不能抵銷之後再借的借單；任一邊沒日期就只比對識別。
// 只算審批狀態「已通过」的歸還單（撤回、拒絕、審批中都不算）。不使用借單明細的「是否已歸還」勾選。
const compact = (s: string) => s.replace(/\s+/g, "");
const LOAN_KEY_FIELDS = ["借出儀器/車輛", "日租ID", "月租ID", "車牌"];
export function loanKey(r: Rec): string {
  for (const f of LOAN_KEY_FIELDS) {
    const v = compact(str(r.fields[f]));
    if (v) return v;
  }
  return "";
}
// 顯示用名稱：借出儀器/車輛 有時是「申請人 日期 儀器 申請編號」整串（含人名），顯示時去掉頭尾；其餘欄位優先。
export function loanItemLabel(r: Rec): string {
  for (const f of ["日租ID", "月租ID", "車牌"]) {
    const v = str(r.fields[f]);
    if (v) return v;
  }
  const v = str(r.fields["借出儀器/車輛"]);
  const m = v.match(/^\S+\s+\d{4}\/\d{1,2}\/\d{1,2}\s+(.*?)\s+\d{8,}$/);
  return (m ? m[1] : v).trim();
}
const APP_NO_TAIL = /[\s]*[(（]?\d{8,}[)）]?\s*$/;
function endsWithLoan(raw: string, loan: string) {
  const t = raw.trim();
  const c = compact(t);
  if (c === loan) return true;
  if (!c.endsWith(loan)) return false;
  const start = c.length - loan.length;
  if (start === 0) return true;
  if (!/[A-Za-z0-9\-]/.test(c[start - 1])) return true;
  // 前一字是英數字：看原值在這個位置有沒有空白（「GPS S901」→ 邊界成立；「XT1」→ 不成立）
  let seen = 0;
  for (let i = t.length - 1; i >= 0; i--) {
    if (/\s/.test(t[i])) continue;
    if (++seen === loan.length) return i > 0 && /\s/.test(t[i - 1]);
  }
  return false;
}
export function returnMatchesLoan(returnValue: string, loan: string) {
  if (!returnValue || !loan) return false;
  if (endsWithLoan(returnValue, loan)) return true;
  const stripped = returnValue.replace(APP_NO_TAIL, "");
  return stripped !== returnValue && endsWithLoan(stripped, loan);
}
const dayOf = (t: number) => Math.floor((t + TZ) / DAY);
export function outstandingLoans(loans: Rec[], returns: Rec[], now: number) {
  const okReturns = returns
    .filter((r) => str(r.fields["申请状态"]) === "已通过")
    .map((r) => ({ raw: str(r.fields["借出儀器/車輛"]), at: numOf(r.fields["歸還日期"]) }))
    .filter((r) => r.raw);
  let noKey = 0;
  let matched = 0;
  const rows: { item: string; lentAt: number | null; days: number | null; group: string; category: string }[] = [];
  for (const l of loans) {
    const key = loanKey(l);
    if (!key) {
      noKey++;
      continue;
    }
    const lentAt = numOf(l.fields["借出日期"]);
    if (okReturns.some((r) => returnMatchesLoan(r.raw, key) && (lentAt === null || r.at === null || dayOf(r.at) >= dayOf(lentAt)))) {
      matched++;
      continue;
    }
    rows.push({
      item: loanItemLabel(l) || key,
      lentAt,
      days: lentAt === null ? null : Math.max(0, -dayDiff(lentAt, now)),
      group: str(l.fields["所屬組別"]) || str(l.fields["借用組別"]),
      category: str(l.fields["設備類別"]),
    });
  }
  rows.sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
  return { loanTotal: loans.length, noKey, matched, rows };
}

// 維護履歷（儀器、車輛）與 TAF：只列紀錄，不算「有沒有檢查」的合格率（檢查頻率業主未定義）。
// target 是 link 欄（顯示成關聯名稱）；關聯表沒開放時 Lark 只回 record id，標成「（關聯名稱未解析）」。
const REC_ID = /^rec[A-Za-z0-9]{8,}$/;
export const UNRESOLVED = "（關聯名稱未解析）";
export function recordLog(records: Rec[], cols: { target: string; date: string; cost?: string; due?: string }, now: number) {
  type Row = { key: string; target: string; unresolved: boolean; count: number; lastAt: number | null; daysSince: number | null; cost: number | null; due: Due };
  const groups = new Map<string, { row: Row; lastDue: CellValue | undefined }>();
  let empty = 0;
  let dated = 0;
  let unresolved = 0;
  let latestAt: number | null = null;
  for (const r of records) {
    const raw = str(r.fields[cols.target]);
    const at = numOf(r.fields[cols.date]);
    const cost = cols.cost ? numOf(r.fields[cols.cost]) : null;
    if (!raw && at === null && cost === null) {
      empty++;
      continue;
    }
    const isId = REC_ID.test(raw);
    if (isId) unresolved++;
    const key = raw || "（未填對象）";
    const g = groups.get(key) ?? { row: { key, target: isId ? UNRESOLVED : key, unresolved: isId, count: 0, lastAt: null, daysSince: null, cost: null, due: due(undefined, now) }, lastDue: undefined };
    g.row.count++;
    if (cost !== null) g.row.cost = (g.row.cost ?? 0) + cost;
    if (at !== null) {
      dated++;
      if (latestAt === null || at > latestAt) latestAt = at;
      if (g.row.lastAt === null || at > g.row.lastAt) {
        g.row.lastAt = at;
        g.lastDue = cols.due ? r.fields[cols.due] : undefined;
      }
    }
    groups.set(key, g);
  }
  const rows = [...groups.values()].map(({ row, lastDue }) => ({
    ...row,
    daysSince: row.lastAt === null ? null : -dayDiff(row.lastAt, now),
    due: due(lastDue, now),
  }));
  rows.sort((a, b) => (b.lastAt ?? -Infinity) - (a.lastAt ?? -Infinity));
  return { total: records.length, empty, dated, unresolved, latestAt, rows };
}
