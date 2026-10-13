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

export const BAD_STATUS = /送修|損壞|故障|出險|停用|報廢/;
export const isBadStatus = (s: string) => BAD_STATUS.test(s);

// 「- 儀器總表」：借用台帳。狀態是借用狀態（可借用／已借出），系統封存＝已下架。
export function summarizeInventory(records: Rec[]) {
  const byStatus: Record<string, number> = {};
  let archived = 0;
  let monthly = 0;
  let daily = 0;
  let repair = 0;
  for (const r of records) {
    if (r.fields["系統封存"] === true) {
      archived++;
      continue;
    }
    bump(byStatus, str(r.fields["狀態"]) || "（未填）");
    const rent = str(r.fields["rent_type"]);
    if (/月租/.test(rent)) monthly++;
    else if (/日租/.test(rent)) daily++;
    if (isBadStatus(str(r.fields["狀態"]))) repair++;
  }
  return { total: records.length, archived, active: records.length - archived, byStatus, monthly, daily, repair };
}

// 「資料表」：儀器費率清單（日租金、使用此儀器的成本單）。狀態＝正常／送修-損壞／出險。
export function summarizeRates(records: Rec[]) {
  const byStatus: Record<string, number> = {};
  let enabled = 0;
  let usable = 0;
  let repair = 0;
  let withRate = 0;
  for (const r of records) {
    const status = str(r.fields["狀態"]);
    bump(byStatus, status || "（未填）");
    if (numOf(r.fields["日租金"]) !== null) withRate++;
    if (r.fields["啟用"] !== true) continue;
    enabled++;
    if (isBadStatus(status)) repair++;
    else usable++;
  }
  return { total: records.length, enabled, usable, repair, withRate, byStatus };
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
// 借出未歸還：兩張單沒有明確對應鍵（歸還單的「借出儀器/車輛」是顯示文字、預約單的 ID／車牌 是另一種格式，
// 歸還單的 ID／車牌 全空），所以不猜，outstanding 固定為 null＝待定義。
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
    outstanding: null as number | null,
  };
}
