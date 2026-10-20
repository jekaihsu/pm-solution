// 預排與出勤檢查（R04 管理工具）的純函式：
//  - 下週預排未填：名冊 vs 所選週工作預排，列出沒有任何預排的人＋組別（item 2）。
//  - 每日檢查：某一天誰沒填日誌（成本單）、沒排（預排）、沒打卡，以及是否請假（item 3）。
// 與 yupaiPolicy 共用唯一政策。預排日期一律用 field id（欄名會被 UI 改）。
import type { CellValue, TableData } from "./types";
import { classifyPerson, normalizeName, type PersonPolicy } from "./yupaiPolicy";

const DAY = 86400000;
const TZ = 8 * 3600000; // Asia/Taipei
export const taipeiDay = (t: number) => Math.floor((t + TZ) / DAY);
export const NO_GROUP = "（未填組別）";

// 工作預排 tblN8c3WN44233aG 的欄位 id（與 R09／R10 共用的語意，fid 不變）。
const SF = { start: "fldMXOggGP", end: "fldjWv1xST", person: "fld7KNCsVe", kind: "fld78OmLVn", group: "fldNDUy2XP", trade: "fldrENe4H6" } as const;

const text = (v: CellValue | undefined): string => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v)).trim();

// 人員名單（v3-people）→ 在職名冊（record_id、姓名、所屬組別）。record_id 即預排「人員」link 指向的 id。
export interface RosterLite extends PersonPolicy {
  recordId: string;
  group: string;
}
const tableKnown = (data?: TableData): data is TableData => !!data && data.complete !== false && data.total <= data.records.length && !data.stale && !data.error;

export function rosterIssue(people: TableData): string | null {
  if (!tableKnown(people)) return "人員名單讀取不完整或已過期，無法確認檢核範圍";
  const missing = ["姓名", "在職"].filter((name) => !people.fields.some((f) => f.name === name));
  return missing.length ? `人員名單缺少必要欄位：${missing.join("、")}` : null;
}

// 僅完整名冊可判定不存在；不把讀取失敗當作 no-op。
export function exemptionRosterNote(people?: TableData): string {
  if (!people || rosterIssue(people)) return "林育寬：名冊未知，無法確認豁免是否適用";
  const nameF = people.fields.find((f) => f.name === "姓名")!;
  const found = people.records.some((r) => normalizeName(text(r.fields[nameF.name])) === normalizeName("林育寬"));
  return found ? "林育寬：存在於人員名單 V3；在職時適用豁免" : "林育寬：不存在於人員名單 V3，本筆豁免為 no-op（無適用人員）";
}

export function parseRoster(people: TableData): RosterLite[] {
  const nameF = people.fields.find((f) => f.name === "姓名");
  const groupF = people.fields.find((f) => f.name === "所屬組別");
  const activeF = people.fields.find((f) => f.name === "在職");
  const out: RosterLite[] = [];
  if (!nameF || !activeF) return out;
  for (const r of people.records) {
    const rawName = r.fields[nameF.name] == null ? "" : String(r.fields[nameF.name]);
    const group = groupF ? text(r.fields[groupF.name]) : "";
    const policy = classifyPerson(rawName, group);
    if (r.fields[activeF.name] !== true && !policy.departedReason) continue;
    out.push({ recordId: r.id, group: group || NO_GROUP, ...policy });
  }
  const names = new Map<string, Set<string>>();
  for (const p of out) if (p.name) names.set(p.name, new Set([...(names.get(p.name) ?? []), p.recordId]));
  for (const p of out) {
    if ((names.get(p.name)?.size ?? 0) > 1) p.dataAttentionReasons.push("同名人員多筆，身分待確認");
    if (!p.name) p.name = p.recordId;
  }
  return out;
}

// 預排欄位（優先 field id，V4 退回欄名）。
function schedFields(sched: TableData) {
  const byId = (id: string) => sched.fields.find((f) => f.id === id);
  const byName = (names: string[]) => names.map((n) => sched.fields.find((f) => f.name === n)).find(Boolean);
  return {
    start: byId(SF.start) ?? byName(["開始日期", "日期", "預排開始日", "預排日期"]),
    end: byId(SF.end) ?? byName(["結束日期", "預排結束日"]),
    person: byId(SF.person) ?? byName(["人員"]),
    kind: byId(SF.kind) ?? byName(["條類型"]),
  };
}

export function planningKnown(sched?: TableData): boolean {
  if (!tableKnown(sched)) return false;
  const f = schedFields(sched);
  return !!f.start && !!f.person && !!f.kind;
}

const linkIds = (r: TableData["records"][number], field: string | undefined): string[] => {
  if (!field) return [];
  const ids = r.links?.[field];
  if (ids && ids.length) return ids;
  const v = r.fields[field];
  return Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
};

// 所選週 [start,end) 內有被排到的人員 record_id（排除條類型＝休假／請假）。
export function scheduledPersonIds(sched: TableData, start: number, end: number): Set<string> {
  const f = schedFields(sched);
  const winFirst = taipeiDay(start);
  const winLast = taipeiDay(end - 1);
  const out = new Set<string>();
  // 缺條類型就無法辨識休假；不可把無法判斷的條目當成工作預排。
  if (!f.start || !f.person || !f.kind) return out;
  for (const r of sched.records) {
    const s = r.fields[f.start.name];
    if (typeof s !== "number") continue;
    if (f.kind && /休假|請假/.test(text(r.fields[f.kind.name]))) continue;
    const e0 = f.end ? r.fields[f.end.name] : null;
    const e = typeof e0 === "number" && e0 >= s ? e0 : s;
    if (taipeiDay(e) < winFirst || taipeiDay(s) > winLast) continue;
    for (const id of linkIds(r, f.person.name)) out.add(id);
  }
  return out;
}

// 下週預排未填：名冊中沒有被排到的人（含組別），依組別排序。
export function unfilledPlanning(roster: RosterLite[], scheduled: Set<string>): RosterLite[] {
  return roster
    .filter((p) => p.requiresPlanning && !scheduled.has(p.recordId))
    .sort((a, b) => a.group.localeCompare(b.group, "zh-Hant") || a.name.localeCompare(b.name, "zh-Hant"));
}

// ---- 每日檢查（item 3）----
// 某一天（台北日序號）每個人的狀態：有沒有填日誌（成本單）、有沒有排、有沒有打卡、是否請假／出差／外出。
export interface DailyStatus extends RosterLite {
  isMember: boolean; // 考勤組成員（會打卡）；否則為外業／不打卡，打卡欄不適用
  planned: boolean; // 當天有預排
  logged: boolean; // 當天有成本單（內業／外業／行政任一）
  punched: boolean; // 當天有有效打卡（考勤組）
  punchedKnown: boolean;
  plannedKnown: boolean; // 預排來源讀得到（或已確定有排）才為 true；否則預排欄顯示「未知」、不算缺漏
  loggedKnown: boolean; // 成本單來源全讀得到（或已確定有填）才為 true；否則日誌欄顯示「未知」、不算缺漏
  leave: "leave" | "trip" | "out" | null; // 當天請假／出差／外出
  missing: boolean; // 非請假／出差／外出，且預排／日誌／打卡（考勤組）有確定的缺
  noSignal: boolean; // 當天沒有預排／日誌／打卡訊號；仍列出，不視為合規
  reason: string;
  compliant: boolean;
}

// 把多張成本單（內業、外業、行政）那天有填的人員 record_id 收集起來。
// cost：{ data, dateFid?, dateNames, personField, personIsLink }，personField 可能是 link（內業填報人）或 record_id 清單。
export interface CostSource {
  data: TableData;
  dateNames: string[]; // 依名字找日期欄（成本單日期不受 field id 保護，用欄名）
  personNames: string[]; // 人員欄（link）
  requiredPersonNames?: string[][]; // 每組至少一個欄位存在；例如外業需要組長，及實際出工人／組員之一
}
export function costSourceKnown(src: CostSource): boolean {
  return tableKnown(src.data)
    && src.dateNames.some((name) => src.data.fields.some((f) => f.name === name))
    && (src.requiredPersonNames ?? [src.personNames]).every((names) => names.some((name) => src.data.fields.some((f) => f.name === name)));
}
export function loggedPersonIds(sources: CostSource[], day: number): Set<string> {
  const out = new Set<string>();
  for (const src of sources) {
    const dateF = src.dateNames.map((n) => src.data.fields.find((f) => f.name === n)).find(Boolean);
    // 一張成本單可能有多個人員欄（外業的組長＋實際出工人），全部都算「有填日誌」。
    const whoFs = src.personNames.map((n) => src.data.fields.find((f) => f.name === n)).filter((f): f is NonNullable<typeof f> => Boolean(f));
    if (!dateF || !whoFs.length) continue;
    for (const r of src.data.records) {
      const t = r.fields[dateF.name];
      if (typeof t !== "number" || taipeiDay(t) !== day) continue;
      for (const whoF of whoFs) for (const id of linkIds(r, whoF.name)) out.add(id);
    }
  }
  return out;
}

// 組一天的每人狀態（傳入當天的三個集合 + 請假/出差/外出 map）。
export function dailyStatus(
  roster: RosterLite[],
  planned: Set<string>,
  logged: Set<string>,
  punched: Set<string>,
  members: Set<string>,
  leaveByRecord: Map<string, "leave" | "trip" | "out">,
  // 來源讀取狀態：sched＝預排來源 ok，cost＝全部成本單來源 ok。讀不到時不把「找不到」
  // 當成「沒排／沒填」（避免整欄空集合造成假缺漏），該欄改顯示「未知」、不算缺漏。
  known: { sched: boolean; cost: boolean; attendance?: boolean } = { sched: true, cost: true },
): DailyStatus[] {
  return roster
    .map((p) => {
      const isMember = members.has(p.recordId);
      const leave = leaveByRecord.get(p.recordId) ?? null;
      const planned0 = planned.has(p.recordId);
      const logged0 = logged.has(p.recordId);
      const punched0 = punched.has(p.recordId);
      // 確定有排／有填就是「已知」；否則要來源讀得到才敢說「沒有」。
      const plannedKnown = planned0 || known.sched;
      const loggedKnown = logged0 || known.cost;
      const attendanceKnown = known.attendance !== false;
      const punchedKnown = punched0 || attendanceKnown;
      const noSignal = !planned0 && !logged0 && !punched0;
      // 假勤未知時也無法確認是否為免缺漏的請假／出差／外出日；保留觀測欄，暫不判確定缺漏。
      const missing = attendanceKnown && !p.departedReason && !leave && ((p.requiresPlanning && plannedKnown && !planned0)
        || (p.requiresLog && loggedKnown && !logged0) || (isMember && punchedKnown && !punched0));
      const reasons = [p.departedReason, p.exemptionReason];
      if (!p.departedReason) {
        // 每日 API 只有假別，不區分半天／全天；保留原先每日免缺漏口徑，不宣稱全天假。
        if (leave) reasons.push(`${leave === "leave" ? "請假" : leave === "trip" ? "出差" : "外出"}（沿用每日免缺漏口徑；未計合規）`);
        else if (noSignal) reasons.push("無活動訊號，待確認");
        if (p.requiresPlanning && !plannedKnown) reasons.push("預排來源未知");
        if (p.requiresLog && !loggedKnown) reasons.push("日誌來源未知");
        if (!attendanceKnown && !punched0) reasons.push("假勤來源未知");
        if (missing) reasons.push("有確定缺漏");
        reasons.push(...p.dataAttentionReasons);
      }
      const compliant = !p.departedReason && !p.exemptionReason && !leave && !noSignal && !missing
        && !p.dataAttentionReasons.length && attendanceKnown
        && (!p.requiresPlanning || (plannedKnown && planned0)) && (!p.requiresLog || (loggedKnown && logged0))
        && (!isMember || punched0);
      return {
        ...p,
        isMember,
        planned: planned0,
        logged: logged0,
        punched: punched0,
        punchedKnown,
        plannedKnown,
        loggedKnown,
        leave,
        missing,
        noSignal,
        reason: reasons.filter(Boolean).join("；") || "預排、日誌與適用打卡均完成",
        compliant,
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group, "zh-Hant") || a.name.localeCompare(b.name, "zh-Hant"));
}
