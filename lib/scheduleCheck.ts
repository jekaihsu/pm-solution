// 預排與出勤檢查（R04 管理工具）的純函式：
//  - 下週預排未填：名冊 vs 所選週工作預排，列出沒有任何預排的人＋組別（item 2）。
//  - 每日檢查：某一天誰沒填日誌（成本單）、沒排（預排）、沒打卡，以及是否請假（item 3）。
// 不 import 其他 lib 的值（node --test 可直接載入）。預排日期一律用 field id（欄名會被 UI 改）。
import type { CellValue, TableData } from "./types";

const DAY = 86400000;
const TZ = 8 * 3600000; // Asia/Taipei
export const taipeiDay = (t: number) => Math.floor((t + TZ) / DAY);
export const NO_GROUP = "（未填組別）";

// 工作預排 tblN8c3WN44233aG 的欄位 id（與 R09／R10 共用的語意，fid 不變）。
const SF = { start: "fldMXOggGP", end: "fldjWv1xST", person: "fld7KNCsVe", kind: "fld78OmLVn", group: "fldNDUy2XP", trade: "fldrENe4H6" } as const;

const text = (v: CellValue | undefined): string => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v)).trim();

// 人員名單（v3-people）→ 在職名冊（record_id、姓名、所屬組別）。record_id 即預排「人員」link 指向的 id。
export interface RosterLite {
  recordId: string;
  name: string;
  group: string;
}
export function parseRoster(people: TableData): RosterLite[] {
  const nameF = people.fields.find((f) => f.name === "姓名");
  const groupF = people.fields.find((f) => f.name === "所屬組別");
  const activeF = people.fields.find((f) => f.name === "在職");
  const out: RosterLite[] = [];
  for (const r of people.records) {
    if (activeF && r.fields[activeF.name] !== true) continue;
    out.push({ recordId: r.id, name: nameF ? text(r.fields[nameF.name]) : r.id, group: (groupF ? text(r.fields[groupF.name]) : "") || NO_GROUP });
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
  if (!f.start || !f.person) return out;
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
    .filter((p) => !scheduled.has(p.recordId))
    .sort((a, b) => a.group.localeCompare(b.group, "zh-Hant") || a.name.localeCompare(b.name, "zh-Hant"));
}

// ---- 每日檢查（item 3）----
// 某一天（台北日序號）每個人的狀態：有沒有填日誌（成本單）、有沒有排、有沒有打卡、是否請假／出差／外出。
export interface DailyStatus {
  recordId: string;
  name: string;
  group: string;
  isMember: boolean; // 考勤組成員（會打卡）；否則為外業／不打卡，打卡欄不適用
  planned: boolean; // 當天有預排
  logged: boolean; // 當天有成本單（內業／外業／行政任一）
  punched: boolean; // 當天有有效打卡（考勤組）
  leave: "leave" | "trip" | "out" | null; // 當天請假／出差／外出
  missing: boolean; // 非請假／出差／外出，且預排／日誌／打卡（考勤組）有缺
}

// 把多張成本單（內業、外業、行政）那天有填的人員 record_id 收集起來。
// cost：{ data, dateFid?, dateNames, personField, personIsLink }，personField 可能是 link（內業填報人）或 record_id 清單。
export interface CostSource {
  data: TableData;
  dateNames: string[]; // 依名字找日期欄（成本單日期不受 field id 保護，用欄名）
  personNames: string[]; // 人員欄（link）
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
): DailyStatus[] {
  return roster
    .map((p) => {
      const isMember = members.has(p.recordId);
      const leave = leaveByRecord.get(p.recordId) ?? null;
      const planned0 = planned.has(p.recordId);
      const logged0 = logged.has(p.recordId);
      const punched0 = punched.has(p.recordId);
      return {
        recordId: p.recordId,
        name: p.name,
        group: p.group,
        isMember,
        planned: planned0,
        logged: logged0,
        punched: punched0,
        leave,
        missing: !leave && (!planned0 || !logged0 || (isMember && !punched0)),
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group, "zh-Hant") || a.name.localeCompare(b.name, "zh-Hant"));
}
