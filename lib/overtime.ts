// R04 加班口徑（純函式）：資料來自薪水計算 Base 的「詠翔加班」（逐筆加班審批單）。
// 只讀白名單內的欄位；只計申請狀態＝已通过（已通過）的單；依「開始時間」所在月份彙總。
// 組別不取審批單上的部門，而是依 V3 人員名單的「所屬組別」（公司組織架構，lib/people.ts）：
// 加班人 open_id → 人員名單 Lark帳號 → 所屬組別；對不到 open_id 時以姓名完全相同備援；仍對不到＝「未對應組別」。
import type { PeopleDirectory, PersonRef } from "./people";

export const OT_NAME = "加班人";
export const OT_START = "开始时间";
export const OT_TYPE = "加班类型";
export const OT_STATUS = "申请状态";
export const OT_HOURS = "薪資計算加班時數"; // 公式＝原始加班時數＋人工補正時數（只有時數，沒有金額）
export const OT_HOURS_RAW = "加班时长（小时）";

export const APPROVED = /^已通[过過]$/;
export const UNMAPPED_GROUP = "未對應組別"; // 加班人對不到人員名單（或名單沒填所屬組別、同名無法判斷）
export const NO_GROUP = "—"; // 人員名單讀不到時：不亂歸組

type Cell = string | number | boolean | null | undefined | (string | number)[];
export interface OtRecord {
  id: string;
  fields: Record<string, Cell>;
  people?: Record<string, PersonRef[]>; // 人員欄的 open_id（API 帶 people=1 才有）；與 fields 的名字陣列逐項對齊
}

export interface OtPerson {
  name: string;
  group: string;
  weekday: number;
  holiday: number;
  other: number; // 加班類型空白：時數照計入合計，平日／假日待定義
  total: number;
  count: number;
}
export interface OtMonth {
  people: OtPerson[];
  groups: { group: string; hours: number }[]; // 未對應組別固定排最後
  total: number;
  unmapped: number; // 當月歸「未對應組別」的張數
}
export interface OtSummary {
  months: string[]; // newest first
  byMonth: Map<string, OtMonth>;
  counted: number; // 已通过且有時數
  excludedStatus: number; // 未通过（審批中／已撤回／已拒絕…）
  noHours: number; // 已通过但時數空白
  unmapped: number; // 計入的單裡，歸「未對應組別」的張數
  multiPerson: number; // 計入的單裡，加班人填了多位的張數（整張算一列、時數不拆分）
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

export const isWeekdayType = (t: string) => t === "平日";

// 加班人欄（人員欄）→ 每位的 {open_id, 名字}。名字陣列是權威；open_id 取同位置的 people（缺＝只比姓名）。
function whoOf(r: OtRecord): { id?: string; name: string }[] {
  const v = r.fields[OT_NAME];
  const names = v === null || v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)];
  const refs = r.people?.[OT_NAME];
  return names.map((name, i) => ({ id: refs?.[i]?.id || undefined, name }));
}

// directory＝人員名單目錄；null＝沒讀到（組別一律「—」，不算未對應）。
export function summarizeOvertime(records: OtRecord[], directory: PeopleDirectory | null): OtSummary {
  const acc = new Map<string, { people: Map<string, OtPerson>; unmapped: number }>();
  let counted = 0;
  let excludedStatus = 0;
  let noHours = 0;
  let unmapped = 0;
  let multiPerson = 0;
  for (const r of records) {
    if (!APPROVED.test(text(r.fields[OT_STATUS]))) {
      excludedStatus++;
      continue;
    }
    const h = typeof r.fields[OT_HOURS] === "number" ? (r.fields[OT_HOURS] as number) : typeof r.fields[OT_HOURS_RAW] === "number" ? (r.fields[OT_HOURS_RAW] as number) : null;
    if (h === null) {
      noHours++;
      continue;
    }
    counted++;
    const month = monthOf(r.fields[OT_START]);
    const name = text(r.fields[OT_NAME]) || "—";
    const who = whoOf(r);
    if (who.length > 1) multiPerson++;
    const group = directory ? (directory.groupFor(who) ?? UNMAPPED_GROUP) : NO_GROUP;
    const type = text(r.fields[OT_TYPE]);
    const mo = acc.get(month) ?? { people: new Map<string, OtPerson>(), unmapped: 0 };
    acc.set(month, mo);
    const people = mo.people;
    if (group === UNMAPPED_GROUP) {
      unmapped++;
      mo.unmapped++;
    }
    const key = `${name}\u0000${group}`;
    const p = people.get(key) ?? { name, group, weekday: 0, holiday: 0, other: 0, total: 0, count: 0 };
    people.set(key, p);
    if (!type) p.other += h;
    else if (isWeekdayType(type)) p.weekday += h;
    else p.holiday += h;
    p.total += h;
    p.count++;
  }
  const byMonth = new Map<string, OtMonth>();
  for (const [month, { people, unmapped: monthUnmapped }] of acc) {
    const list = [...people.values()].sort((a, b) => b.total - a.total);
    const g = new Map<string, number>();
    for (const p of list) g.set(p.group, (g.get(p.group) ?? 0) + p.total);
    byMonth.set(month, {
      people: list,
      groups: [...g]
        .map(([group, hours]) => ({ group, hours }))
        .sort((a, b) => Number(a.group === UNMAPPED_GROUP) - Number(b.group === UNMAPPED_GROUP) || b.hours - a.hours),
      total: list.reduce((s, p) => s + p.total, 0),
      unmapped: monthUnmapped,
    });
  }
  return { months: [...byMonth.keys()].sort().reverse(), byMonth, counted, excludedStatus, noHours, unmapped, multiPerson, hasDirectory: directory !== null };
}
