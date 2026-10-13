// R04 加班口徑（純函式）：資料來自薪水計算 Base 的「詠翔加班」（逐筆加班審批單）。
// 只讀白名單內的欄位；只計申請狀態＝已通过（已通過）的單；依「開始時間」所在月份彙總。

export const OT_NAME = "加班人";
export const OT_DEPT = "发起人部门";
export const OT_START = "开始时间";
export const OT_TYPE = "加班类型";
export const OT_STATUS = "申请状态";
export const OT_HOURS = "薪資計算加班時數"; // 公式＝原始加班時數＋人工補正時數（只有時數，沒有金額）
export const OT_HOURS_RAW = "加班时长（小时）";

export const APPROVED = /^已通[过過]$/;

type Cell = string | number | boolean | null | undefined | (string | number)[];
export interface OtRecord {
  id: string;
  fields: Record<string, Cell>;
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
  groups: { group: string; hours: number }[];
  total: number;
}
export interface OtSummary {
  months: string[]; // newest first
  byMonth: Map<string, OtMonth>;
  counted: number; // 已通过且有時數
  excludedStatus: number; // 未通过（審批中／已撤回／已拒絕…）
  noHours: number; // 已通过但時數空白
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

export function summarizeOvertime(records: OtRecord[]): OtSummary {
  const acc = new Map<string, Map<string, OtPerson>>();
  let counted = 0;
  let excludedStatus = 0;
  let noHours = 0;
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
    const group = text(r.fields[OT_DEPT]) || "—";
    const type = text(r.fields[OT_TYPE]);
    const people = acc.get(month) ?? new Map<string, OtPerson>();
    acc.set(month, people);
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
  for (const [month, people] of acc) {
    const list = [...people.values()].sort((a, b) => b.total - a.total);
    const g = new Map<string, number>();
    for (const p of list) g.set(p.group, (g.get(p.group) ?? 0) + p.total);
    byMonth.set(month, {
      people: list,
      groups: [...g].map(([group, hours]) => ({ group, hours })).sort((a, b) => b.hours - a.hours),
      total: list.reduce((s, p) => s + p.total, 0),
    });
  }
  return { months: [...byMonth.keys()].sort().reverse(), byMonth, counted, excludedStatus, noHours };
}
