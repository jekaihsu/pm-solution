// R04 加班口徑（純函式）：資料來自薪水計算 Base 的「詠翔加班」（逐筆加班審批單）。
// 只讀白名單內的欄位；只計申請狀態＝已通过（已通過）的單；依「開始時間」所在月份彙總。
// 人＝「發起人」（人員欄，繁體「發」，真實資料 126/126 有填）；發起人空白才用「加班人」（真實資料全空，只當備援）。
// 這和 B4 舊文件（加班表單\README）與薪水公式一致：優先發起人，空白才用加班人。
// 組別不取審批單上的部門，而是依 V3 人員名單的「所屬組別」（公司組織架構，lib/people.ts）：
// 發起人 open_id → 人員名單 Lark帳號 → 所屬組別；對不到 open_id 時以姓名完全相同備援；仍對不到＝「未對應組別」。
import type { PeopleDirectory, PersonRef } from "./people";

export const OT_APPLICANT = "發起人"; // 繁體「發」；「发起人部门」「当前处理人」是簡體，不讀
export const OT_NAME = "加班人"; // 備援：發起人空白才用
export const OT_START = "开始时间";
export const OT_TYPE = "加班类型";
export const OT_STATUS = "申请状态";
export const OT_HOURS = "薪資計算加班時數"; // 公式＝原始加班時數＋人工補正時數（只有時數，沒有金額）
export const OT_HOURS_RAW = "加班时长（小时）";

export const APPROVED = /^已通[过過]$/;
export const UNMAPPED_GROUP = "未對應組別"; // 發起人對不到人員名單（或名單沒填所屬組別、同名無法判斷）
export const NO_GROUP = "—"; // 人員名單讀不到時：不亂歸組
export const ALL_LABEL = "全部合計";
export const BLANK_STATUS = "（空白）";

type Cell = string | number | boolean | null | undefined | (string | number)[];
export interface OtRecord {
  id: string;
  fields: Record<string, Cell>;
  people?: Record<string, PersonRef[]>; // 人員欄的 open_id（API 帶 people=1 才有）；與 fields 的名字陣列逐項對齊
}

export interface OtPerson {
  uid: string; // 去重用：單一人且有 open_id＝"id:…"，否則 "name:…"（同名不同 open_id 是不同人）
  name: string;
  group: string;
  weekday: number;
  holiday: number;
  other: number; // 加班類型空白：時數照計入合計，平日／假日待定義
  total: number;
  count: number; // 張數
}
// 組別總結的一列（group＝ALL_LABEL 的是最後的全部合計）。
export interface OtTeamLine {
  group: string;
  people: number; // 去重人數
  weekday: number;
  holiday: number;
  other: number;
  total: number;
  count: number;
}
export interface OtTeamSection {
  group: string;
  line: OtTeamLine; // 該組小計（同組別總結那一列）
  people: OtPerson[]; // 組內依時數大到小
}
export interface OtMonth {
  people: OtPerson[];
  teams: OtTeamLine[]; // 每組一列；未對應組別固定排最後
  all: OtTeamLine; // 全部合計
  total: number;
  unmapped: number; // 當月歸「未對應組別」的張數
}
export interface OtSummary {
  months: string[]; // newest first
  byMonth: Map<string, OtMonth>;
  weeks: string[]; // newest first；每個 key＝該週週一 YYYY-MM-DD（mondayOf）
  byWeek: Map<string, OtMonth>; // 與 byMonth 同結構，只是以週（週一）分桶
  counted: number; // 已通过且有時數
  excludedStatus: number; // 未通过（審批中／已撤回／已拒絕…）
  excludedBy: { status: string; count: number }[]; // 被排除的筆數，依申請狀態分列（多到少）
  noHours: number; // 已通过但時數空白
  unmapped: number; // 計入的單裡，歸「未對應組別」的張數
  multiPerson: number; // 計入的單裡，人填了多位的張數（整張算一列、時數不拆分）
  fallbackToOvertimer: number; // 計入的單裡，發起人空白、改用加班人的張數
  hasDirectory: boolean; // false＝人員名單沒讀到，組別一律「—」
}

const text = (v: Cell) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v)).trim();

export function monthOf(v: Cell): string {
  if (typeof v === "number") {
    const d = new Date(v + 8 * 3600000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return "（未填月份）";
}

const DAY_MS = 86400000;
const TZ_MS = 8 * 3600000;
// 該筆開始時間所在台北週的「週一」YYYY-MM-DD（與 lib/attendanceCore.weekDates 的週一算法一致）。
// 非時間值（讀不到開始時間）歸「（未填週）」，與 monthOf 的「（未填月份）」對應。
export function mondayOf(v: Cell): string {
  if (typeof v !== "number") return "（未填週）";
  const local = v + TZ_MS;
  const idx = (new Date(local).getUTCDay() + 6) % 7; // 週一＝0
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - idx * DAY_MS).toISOString().slice(0, 10);
}

export const isWeekdayType = (t: string) => t === "平日";

interface Who {
  id?: string;
  name: string;
}

// 一個人員欄 → 每位的 {open_id, 名字}。名字陣列是權威；open_id 取同位置的 people（缺＝只比姓名）。空白的不算。
function whoIn(r: OtRecord, field: string): Who[] {
  const v = r.fields[field];
  const names = v === null || v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)];
  const refs = r.people?.[field];
  return names.map((name, i) => ({ id: refs?.[i]?.id || undefined, name: name.trim() })).filter((w) => w.name || w.id);
}

// 這張單的人：發起人；發起人空白才用加班人。
function whoOf(r: OtRecord): { who: Who[]; fallback: boolean } {
  const applicant = whoIn(r, OT_APPLICANT);
  if (applicant.length) return { who: applicant, fallback: false };
  const overtimer = whoIn(r, OT_NAME);
  return { who: overtimer, fallback: overtimer.length > 0 };
}

const emptyLine = (group: string): OtTeamLine => ({ group, people: 0, weekday: 0, holiday: 0, other: 0, total: 0, count: 0 });
const addInto = (line: OtTeamLine, p: OtPerson) => {
  line.weekday += p.weekday;
  line.holiday += p.holiday;
  line.other += p.other;
  line.total += p.total;
  line.count += p.count;
};
const byGroupName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// 組別總結：每組一列＋全部合計。人數以 uid 去重（同一人只算一次；全部合計也去重）；
// 時數、張數直接加總。未對應組別固定排最後，其餘依合計時數大到小（同時數依組名，順序固定）。
export function teamSummary(people: OtPerson[]): { lines: OtTeamLine[]; all: OtTeamLine } {
  const acc = new Map<string, { line: OtTeamLine; uids: Set<string> }>();
  const all = emptyLine(ALL_LABEL);
  const allUids = new Set<string>();
  for (const p of people) {
    const g = acc.get(p.group) ?? { line: emptyLine(p.group), uids: new Set<string>() };
    acc.set(p.group, g);
    addInto(g.line, p);
    g.uids.add(p.uid);
    addInto(all, p);
    allUids.add(p.uid);
  }
  const lines = [...acc.values()]
    .map(({ line, uids }) => ({ ...line, people: uids.size }))
    .sort((a, b) => Number(a.group === UNMAPPED_GROUP) - Number(b.group === UNMAPPED_GROUP) || b.total - a.total || byGroupName(a.group, b.group));
  return { lines, all: { ...all, people: allUids.size } };
}

// 依組分段：順序同組別總結，每段＝該組小計＋組內每人（時數大到小，同時數依姓名）。
export function teamSections(people: OtPerson[]): OtTeamSection[] {
  const byGroup = new Map<string, OtPerson[]>();
  for (const p of people) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p]);
  return teamSummary(people).lines.map((line) => ({
    group: line.group,
    line,
    people: [...(byGroup.get(line.group) ?? [])].sort((a, b) => b.total - a.total || byGroupName(a.name, b.name)),
  }));
}

// 計入的一筆（已通过且有時數）攤平後的資料：同時帶月份鍵與週鍵，之後各自分桶。
interface OtEntry {
  monthKey: string;
  weekKey: string;
  uid: string;
  name: string;
  group: string;
  type: string;
  h: number;
  unmapped: boolean;
}

// 把攤平後的計入筆數依 keyOf 分桶，桶內口徑與原本「依月」完全相同：
// 人員以 uid＋group 去重並累加平日／假日／待定義時數，組別總結與全部合計照 teamSummary。
function bucketize(entries: OtEntry[], keyOf: (e: OtEntry) => string): Map<string, OtMonth> {
  const acc = new Map<string, { people: Map<string, OtPerson>; unmapped: number }>();
  for (const e of entries) {
    const bk = keyOf(e);
    const b = acc.get(bk) ?? { people: new Map<string, OtPerson>(), unmapped: 0 };
    acc.set(bk, b);
    if (e.unmapped) b.unmapped++;
    const key = `${e.uid}\u0000${e.group}`;
    const p = b.people.get(key) ?? { uid: e.uid, name: e.name, group: e.group, weekday: 0, holiday: 0, other: 0, total: 0, count: 0 };
    b.people.set(key, p);
    if (!e.type) p.other += e.h;
    else if (isWeekdayType(e.type)) p.weekday += e.h;
    else p.holiday += e.h;
    p.total += e.h;
    p.count++;
  }
  const out = new Map<string, OtMonth>();
  for (const [bk, { people, unmapped }] of acc) {
    const list = [...people.values()].sort((a, b) => b.total - a.total || byGroupName(a.name, b.name));
    const { lines, all } = teamSummary(list);
    out.set(bk, { people: list, teams: lines, all, total: all.total, unmapped });
  }
  return out;
}

// directory＝人員名單目錄；null＝沒讀到（組別一律「—」，不算未對應）。
export function summarizeOvertime(records: OtRecord[], directory: PeopleDirectory | null): OtSummary {
  const entries: OtEntry[] = [];
  const excluded = new Map<string, number>();
  let counted = 0;
  let excludedStatus = 0;
  let noHours = 0;
  let unmapped = 0;
  let multiPerson = 0;
  let fallbackToOvertimer = 0;
  for (const r of records) {
    const status = text(r.fields[OT_STATUS]);
    if (!APPROVED.test(status)) {
      excludedStatus++;
      const key = status || BLANK_STATUS;
      excluded.set(key, (excluded.get(key) ?? 0) + 1);
      continue;
    }
    const h = typeof r.fields[OT_HOURS] === "number" ? (r.fields[OT_HOURS] as number) : typeof r.fields[OT_HOURS_RAW] === "number" ? (r.fields[OT_HOURS_RAW] as number) : null;
    if (h === null) {
      noHours++;
      continue;
    }
    counted++;
    const { who, fallback } = whoOf(r);
    if (fallback) fallbackToOvertimer++;
    if (who.length > 1) multiPerson++;
    const name = who.map((w) => w.name).filter(Boolean).join("、") || "—";
    const uid = who.length === 1 && who[0].id ? `id:${who[0].id}` : `name:${name}`;
    const group = directory ? (directory.groupFor(who) ?? UNMAPPED_GROUP) : NO_GROUP;
    const isUnmapped = group === UNMAPPED_GROUP;
    if (isUnmapped) unmapped++;
    entries.push({
      monthKey: monthOf(r.fields[OT_START]),
      weekKey: mondayOf(r.fields[OT_START]),
      uid,
      name,
      group,
      type: text(r.fields[OT_TYPE]),
      h,
      unmapped: isUnmapped,
    });
  }
  const byMonth = bucketize(entries, (e) => e.monthKey);
  const byWeek = bucketize(entries, (e) => e.weekKey);
  return {
    months: [...byMonth.keys()].sort().reverse(),
    byMonth,
    weeks: [...byWeek.keys()].sort().reverse(),
    byWeek,
    counted,
    excludedStatus,
    excludedBy: [...excluded].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    noHours,
    unmapped,
    multiPerson,
    fallbackToOvertimer,
    hasDirectory: directory !== null,
  };
}
