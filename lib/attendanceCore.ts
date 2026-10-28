// R04 出勤／出差口徑（純函式，不 import 任何 lib 的值，node --test 可直接載入；抓取在 lib/attendance.ts）。
// 資料來自 Lark 假勤：user_tasks（打卡結果）與 user_approvals（出差／外出／請假審批）。
// 輸出只有白名單欄位：姓名、組別、每日狀態代碼、出差起訖／天數／截斷事由、摘要數字。
// employee_id、open_id、地點、GPS、照片、打卡時間一律不進輸出。預設口徑待業主確認。

// leave-half＝半天假且另半天到班（考勤組）或有日報（外業）：請假 0.5＋到班 0.5；
// leave-half-open＝半天假、另半天沒有證據（今天下午還沒結束、Lark 兩側都標 Leave／沒紀錄的平日）：只計請假 0.5、另半天不入應到；
// leave-half-late／-early／-late-early＝半天假且另半天遲到／早退；leave-half-lack＝半天假且另半天缺卡；
// leave-half-nofield＝外業半天假、當天沒有成本單（只計請假 0.5）；
// field＝外業有填日報（算出勤）；nofield＝外業沒填日報也沒審批（不入分母）。
export type DayCode = "ok" | "late" | "early" | "late-early" | "lack" | "leave" | "leave-half" | "leave-half-late" | "leave-half-early" | "leave-half-late-early" | "leave-half-lack" | "leave-half-nofield" | "leave-half-open" | "trip" | "out" | "off" | "none" | "future" | "field" | "nofield";
export type ApprovalKind = "leave" | "trip" | "out";

const TZ = 8 * 3600000;
const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, "0");

/** 台北時區的 YYYY-MM-DD */
export function taipeiDate(ms: number): string {
  const d = new Date(ms + TZ);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const dateMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const addDays = (date: string, n: number) => new Date(dateMs(date) + n * DAY).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((dateMs(b) - dateMs(a)) / DAY);
export const ymdInt = (date: string) => Number(date.replace(/-/g, ""));

/** 含 weekStart 的那一週（週一～週日，台北）的 7 個日期 */
export function weekDates(weekStart: number): string[] {
  const local = weekStart + TZ;
  const idx = (new Date(local).getUTCDay() + 6) % 7;
  const monday = new Date(Math.floor(local / DAY) * DAY - idx * DAY).toISOString().slice(0, 10);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 20261005 / "20261005" / "2026-10-05" / "2026-10-05 09:00:00" → "2026-10-05"；解不出來回 null */
export function parseYmd(v: unknown): string | null {
  const s = String(v ?? "");
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/) ?? s.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// ---------- Lark 原始形狀（只列用到的欄位）----------
export interface LarkTaskRecord {
  check_in_result?: string;
  check_out_result?: string;
  check_in_result_supplement?: string;
  check_out_result_supplement?: string;
  [k: string]: unknown;
}
export interface LarkUserTask {
  user_id?: string;
  day?: number | string;
  records?: LarkTaskRecord[];
  [k: string]: unknown;
}
interface LarkApprovalItem {
  approval_id?: string;
  uniq_id?: string;
  start_time?: string;
  end_time?: string;
  reason?: string;
  interval?: number | string; // 外出、請假：秒
  unit?: number | string; // 請假：單位
  [k: string]: unknown;
}
export interface LarkUserApprovals {
  user_id?: string;
  date?: number | string;
  trips?: LarkApprovalItem[];
  outs?: LarkApprovalItem[];
  leaves?: LarkApprovalItem[];
  [k: string]: unknown;
}

// ---------- 單日狀態 ----------
const KNOWN = new Set(["NoNeedCheck", "SystemCheck", "Normal", "Early", "Late", "Lack"]);
const RESCUE = new Set(["CardReplacement", "CardReplacementApplication", "ManagerModification"]);
const SUPP: Record<string, ApprovalKind> = { Leave: "leave", Travel: "trip", GoOut: "out" };

/** 請假涵蓋的半天：am＝上午、pm＝下午、unknown＝只知道是半天（只有日期沒有時刻）。 */
export type HalfSide = "am" | "pm" | "unknown";
const isPunch = (res?: string, supp?: string) => !!res && ((KNOWN.has(res) && res !== "Lack" && res !== "NoNeedCheck") || (res === "Lack" && !!supp && RESCUE.has(supp)));

/**
 * 一個人一天的狀態。順序：先看 supplement（請假／出差／外出常是 NoNeedCheck＋supplement），
 * 再看 NoNeedCheck（免打卡）；user_approvals 覆蓋只套在「應打卡日」，週末不會被誤算。
 * leaveHalf：半天假那天忽略請假那一半的打卡（am 忽略 check_in、pm 忽略 check_out；unknown 忽略標 Leave 的那邊），只看另一半。
 * open：當天還沒結束——已打上班卡、下班那邊 Lack 不算缺卡（上班沒打卡仍是缺卡）。
 * 今天＋上午假（am）或只有日期的半天假（unknown，上下午不明）：下班 Lack 一律不算缺卡（下午還沒結束）；上班側有有效打卡（不含標 Leave 的那邊）代表下午已到→ ok，
 * 沒有證據就回 off／none（呼叫端只計請假 0.5，不入應到）。
 */
export function classifyDay(records: LarkTaskRecord[] | undefined, ctx: { approval?: ApprovalKind | null; leaveHalf?: HalfSide; open?: boolean } = {}): DayCode {
  const recs = records ?? [];
  if (!recs.length) return "none";
  const half = ctx.leaveHalf;
  const lenient = half === "am" || half === "unknown"; // 今天（open）時下班 Lack 不算缺卡
  let suppKind: ApprovalKind | null = null;
  const sides: { result: string; supp: string }[] = [];
  for (const r of recs) {
    const inRes = r.check_in_result, outRes = r.check_out_result;
    const inSupp = r.check_in_result_supplement ?? "", outSupp = r.check_out_result_supplement ?? "";
    for (const s of [inSupp, outSupp]) if (SUPP[s] && !suppKind && !(half && s === "Leave")) suppKind = SUPP[s];
    const usable = (res: string | undefined, supp: string, skip: boolean): res is string => !!res && KNOWN.has(res) && res !== "NoNeedCheck" && !skip && !(half && supp === "Leave");
    // 上午假忽略上班側；今天＋上下午不明的半天假比照上午假（上班側可能就是請假那半邊，不能當缺卡）
    if (usable(inRes, inSupp, half === "am" || (half === "unknown" && !!ctx.open))) sides.push({ result: inRes, supp: inSupp });
    const stillWorking = !!ctx.open && outRes === "Lack" && !RESCUE.has(outSupp) && (lenient || isPunch(inRes, inSupp));
    if (usable(outRes, outSupp, half === "pm" || stillWorking)) sides.push({ result: outRes, supp: outSupp });
  }
  if (!sides.length && !suppKind) {
    if (lenient && ctx.open && recs.some((r) => isPunch(r.check_in_result, r.check_in_result_supplement) && r.check_in_result_supplement !== "Leave")) return ctx.approval ?? "ok";
    return recs.some((r) => r.check_in_result === "NoNeedCheck" || r.check_out_result === "NoNeedCheck") ? "off" : "none";
  }
  const approval = suppKind ?? ctx.approval ?? null;
  if (approval) return approval;
  let lack = false, late = false, early = false;
  for (const s of sides) {
    if (s.result === "Lack" && !RESCUE.has(s.supp)) lack = true;
    else if (s.result === "Late") late = true;
    else if (s.result === "Early") early = true;
  }
  if (lack) return "lack"; // 今天沒打卡也算缺卡（業主 2026-10-13）
  return late && early ? "late-early" : late ? "late" : early ? "early" : "ok";
}

/**
 * 半天假那天、另半天沒有證據（classifyDay 回 off／none）時，請假 0.5 還要不要計：
 * 沒有任何打卡紀錄＝只有平日（weekday）才計；有紀錄時，只要不是「兩側都純免打卡」就是應打卡日（兩側都標 Leave 屬於這種）。
 */
export function halfLeaveDueDay(recs: LarkTaskRecord[] | undefined, weekday: boolean): boolean {
  if (!recs?.length) return weekday;
  return recs.some((r) => r.check_in_result_supplement === "Leave" || r.check_out_result_supplement === "Leave" || !(r.check_in_result === "NoNeedCheck" && r.check_out_result === "NoNeedCheck"));
}

/** 打卡紀錄上的出差／外出標記（Travel／GoOut）；沒有就回 null。 */
function tripOutSupplement(recs: LarkTaskRecord[] | undefined): "trip" | "out" | null {
  for (const r of recs ?? []) for (const s of [r.check_in_result_supplement, r.check_out_result_supplement]) if (s === "Travel" || s === "GoOut") return SUPP[s] as "trip" | "out";
  return null;
}

// ---------- 名冊、考勤組成員 ----------
export interface RosterPerson {
  name: string;
  group: string;
  openId: string;
  recordId?: string; // 人員名單 record_id：只用來對外業成本單的組長／出工人，不輸出
  altRecordIds?: string[]; // 同一 Lark帳號的其他名冊列的 record_id（同人多列合併成一人，成本單接到哪一列都對得上）
}
type Cell = string | number | boolean | null | undefined | (string | number)[];
export interface RosterRow {
  id?: string;
  fields: Record<string, Cell>;
  people?: Record<string, { id: string; name: string }[]>;
}
export const NO_GROUP = "（未填組別）";

/** 在職但沒有 Lark帳號的人（外業用 record_id 對成本單；不輸出 recordId）。 */
export type FieldOnlyPerson = Omit<RosterPerson, "openId">;

/** 在職名冊（V3 人員名單）。欄名由呼叫端傳入；同 record_id 只留一列；merged＝名字不同卻共用同一 Lark帳號而被合併的列數；在職沒有 Lark帳號的只計人數，另回 noAccountPeople 供外業使用。 */
export function buildRoster(rows: RosterRow[], cols: { name: string; group: string; active: string; account: string }) {
  const people: RosterPerson[] = [];
  const noAccountPeople: FieldOnlyPerson[] = [];
  const seen = new Set<string>();
  const byOpenId = new Map<string, RosterPerson>();
  const inactiveIds = new Map<string, { id: string; name: string }[]>(); // 離職列（依 open_id）：同名的之後併進在職列當別名
  let inService = 0, noAccount = 0, merged = 0;
  const text = (v: Cell) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v)).trim();
  for (const r of rows) {
    if (r.id) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
    }
    const openId = r.people?.[cols.account]?.find((p) => p.id)?.id;
    const name = text(r.fields[cols.name]);
    // 別名先於在職過濾：離職舊列與在職列共用 open_id 時，舊列的 record_id 也要對得上同一個人
    if (r.fields[cols.active] !== true) {
      if (openId && r.id) {
        const live = byOpenId.get(openId);
        if (!live) inactiveIds.set(openId, [...(inactiveIds.get(openId) ?? []), { id: r.id, name }]);
        else if (!name || name === live.name) live.altRecordIds = [...(live.altRecordIds ?? []), r.id];
        else merged++; // 名字不同＝不同人共用帳號：不當別名（成本單照舊算對不到），計數供註腳提醒
      }
      continue;
    }
    const dup = openId ? byOpenId.get(openId) : undefined;
    if (dup) {
      // 同一 Lark帳號（open_id）的另一列＝同一個人：只留第一列，record_id 記成別名；名字不同＝不同人共用帳號，計數供註腳提醒
      if (r.id) dup.altRecordIds = [...(dup.altRecordIds ?? []), r.id];
      if (name && dup.name && name !== dup.name) merged++; // 姓名空白的殘留列不算不同人
      continue;
    }
    inService++;
    const group = text(r.fields[cols.group]) || NO_GROUP;
    if (!openId) {
      noAccount++;
      noAccountPeople.push({ name, group, ...(r.id ? { recordId: r.id } : {}) });
      continue;
    }
    const p: RosterPerson = { name, group, openId, ...(r.id ? { recordId: r.id } : {}) };
    byOpenId.set(openId, p);
    people.push(p);
  }
  for (const p of people) {
    for (const o of inactiveIds.get(p.openId) ?? []) {
      if (!o.name || o.name === p.name) p.altRecordIds = [...(p.altRecordIds ?? []), o.id];
      else merged++;
    }
  }
  return { people, noAccountPeople, inService, noAccount, merged };
}

export interface GroupDef {
  bindUsers: string[];
  bindDepts: string[];
  exceptUsers: string[];
  exceptDepts: string[];
}
/** 成員＝綁定人員＋綁定部門的人－排除人員－排除部門的人。deptUsers：部門（含子部門）→ employee_id。 */
export function resolveMembers(g: GroupDef, deptUsers: Map<string, string[]>): Set<string> {
  const out = new Set<string>(g.bindUsers);
  for (const d of g.bindDepts) for (const u of deptUsers.get(d) ?? []) out.add(u);
  for (const u of g.exceptUsers) out.delete(u);
  for (const d of g.exceptDepts) for (const u of deptUsers.get(d) ?? []) out.delete(u);
  return out;
}

// ---------- 文字 ----------
export function truncateText(s: unknown, max: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  const chars = Array.from(t);
  return chars.length > max ? chars.slice(0, max).join("") + "…" : t;
}

/** 99991672 的訊息或 permission_violations → 缺的 scope（有 readonly 版就只列 readonly）。 */
export function parseMissingScopes(e: { msg?: string; violations?: string[] }): string[] {
  let list = (e.violations ?? []).filter(Boolean);
  if (!list.length) {
    const m = (e.msg ?? "").match(/\[([^\]]+)\]/);
    list = m ? m[1].split(",").map((x) => x.trim()).filter((x) => /^[\w.]+(:[\w.]+)+$/.test(x)) : [];
  }
  const ro = list.filter((x) => x.endsWith(":readonly"));
  return [...new Set(ro.length ? ro : list)].slice(0, 6);
}

// ---------- 審批索引 ----------
interface Approval {
  kind: ApprovalKind;
  id: string; // approval_id（缺時 uniq_id）；只用來數張數，不輸出
  start: string | null;
  end: string | null;
  reason: string;
  startRaw: string;
  endRaw: string;
  startMin: number | null; // 開始時刻（當天第幾分鐘）；只有日期時為 null
  endMin: number | null; // 結束時刻；結束時間是跨日 00:00:00（結束日已退一天）時為 1440
  interval: number | null; // 秒（外出、請假）
  unit: number | null; // 請假單位（實測 2＝小時、3＝天；Lark 文件另有 1 天、4 半小時）
  covered: Set<string>; // 該審批覆蓋的日期（起訖區間；解不出才用 entry 日期）
}

const clockMin = (raw: string) => {
  const m = raw.match(/[ T](\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

function normalizeApprovals(items: LarkUserApprovals[]): Map<string, Approval[]> {
  const byUser = new Map<string, Map<string, Approval>>();
  for (const it of items) {
    const uid = it.user_id;
    if (!uid) continue;
    const entryDate = parseYmd(it.date);
    const m = byUser.get(uid) ?? new Map<string, Approval>();
    byUser.set(uid, m);
    for (const [kind, list] of [["trip", it.trips], ["out", it.outs], ["leave", it.leaves]] as const) {
      for (const a of list ?? []) {
        const start = parseYmd(a.start_time);
        let end = parseYmd(a.end_time);
        let endMin = clockMin(String(a.end_time ?? ""));
        // 結束時間剛好是跨日的午夜 00:00:00＝不含那一天，那天的結束時刻視為 24:00
        if (start && end && end > start && /\d{2}:\d{2}:\d{2}$/.test(String(a.end_time)) && String(a.end_time).endsWith("00:00:00")) {
          end = addDays(end, -1);
          endMin = 1440;
        }
        const key = `${kind}|${a.approval_id ?? a.uniq_id ?? `${a.start_time}|${a.end_time}|${a.reason}`}`;
        const cur = m.get(key) ?? { kind, id: String(a.approval_id ?? a.uniq_id ?? key), start, end, reason: String(a.reason ?? ""), startRaw: String(a.start_time ?? ""), endRaw: String(a.end_time ?? ""), startMin: clockMin(String(a.start_time ?? "")), endMin, interval: a.interval === undefined || a.interval === null || a.interval === "" || !Number.isFinite(Number(a.interval)) ? null : Number(a.interval), unit: a.unit === undefined || a.unit === null || a.unit === "" || !Number.isFinite(Number(a.unit)) ? null : Number(a.unit), covered: new Set<string>() };
        // 起訖區間為準（實測 entry 的 date 會多一天）；解不出起訖才退回 entry 日期。
        if (start && end) for (let d = start; d <= end && diffDays(start, d) < 400; d = addDays(d, 1)) cur.covered.add(d);
        else if (entryDate) cur.covered.add(entryDate);
        m.set(key, cur);
      }
    }
  }
  return new Map([...byUser].map(([k, v]) => [k, [...v.values()]]));
}

// ---------- 外出／出差時間文字 ----------
const hm = (v: string) => v.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
const md = (d: string) => d.slice(5).replace("-", "/");
const half = (h: number) => Math.round(h * 2) / 2;
function outTimeText(startRaw: string, endRaw: string, start: string, end: string): string {
  const s = hm(startRaw), e = hm(endRaw);
  if (!s || !e) return start === end ? md(start) : `${md(start)}–${md(end)}`;
  return s[1] === e[1] ? `${md(s[1])} ${s[2]}–${e[2]}` : `${md(s[1])} ${s[2]}–${md(e[1])} ${e[2]}`;
}
function outHours(a: { interval: number | null; startRaw: string; endRaw: string }): number {
  if (a.interval !== null && a.interval >= 0) return half(a.interval / 3600);
  const s = hm(a.startRaw), e = hm(a.endRaw);
  if (!s || !e) return 0;
  const diff = Date.parse(`${e[1]}T${e[2]}:00Z`) - Date.parse(`${s[1]}T${s[2]}:00Z`);
  return diff > 0 ? half(diff / 3600000) : 0;
}

// ---------- 請假涵蓋哪半天（半天假算 0.5）----------
export interface LeavePart {
  am: boolean;
  pm: boolean;
  unknown: boolean; // 只知道是半天、不知道上下午（只有日期、沒有時刻）
}
// 上午＝到 12:00 為止、下午＝13:00 起，12:00–13:00 午休；上班 08:00–18:00
const AM_START = 8 * 60, AM_END = 12 * 60, PM_START = 13 * 60, PM_END = 18 * 60;
const HALF_SEC = { hour: 4 * 3600, day: 12 * 3600 };

/**
 * 一張請假單在每個涵蓋日涵蓋哪半天。該日請假區段＝［開始日 ? 開始時刻 : 00:00，結束日 ? 結束時刻 : 24:00］；
 * 上午被涵蓋＝區段開始 < 12:00 且結束 > 08:00，下午被涵蓋＝區段結束 > 13:00 且開始 < 18:00；都沒涵蓋（例如只請午休）不列入。
 * 開始或結束沒有時刻（只有日期）才退回 interval：單日且 interval ≤ 半天（天制 12 小時、小時制 4 小時）→ 半天（上下午不明），否則整天。
 */
export function leaveCoverage(a: Pick<Approval, "start" | "end" | "covered" | "startMin" | "endMin" | "interval" | "unit">): Map<string, LeavePart> {
  const dates = [...a.covered].sort();
  const out = new Map<string, LeavePart>();
  if (a.start === null || a.end === null || a.startMin === null || a.endMin === null) {
    const hourUnit = a.unit === 2 || a.unit === 4;
    const half = dates.length === 1 && a.interval !== null && a.interval > 0 && a.interval <= (hourUnit ? HALF_SEC.hour : HALF_SEC.day);
    for (const d of dates) out.set(d, half ? { am: false, pm: false, unknown: true } : { am: true, pm: true, unknown: false });
    return out;
  }
  for (const d of dates) {
    const from = d === a.start ? a.startMin : 0, to = d === a.end ? a.endMin : 1440;
    const am = from < AM_END && to > AM_START, pm = to > PM_START && from < PM_END;
    if (am || pm) out.set(d, { am, pm, unknown: false });
  }
  return out;
}
const mergePart = (a: LeavePart | undefined, b: LeavePart): LeavePart => (a ? { am: a.am || b.am, pm: a.pm || b.pm, unknown: a.unknown || b.unknown } : b);
const leaveWeight = (p: LeavePart) => (p.am && p.pm ? 1 : p.am || p.pm || p.unknown ? 0.5 : 0);
const halfSide = (p: LeavePart): HalfSide => (p.am && !p.pm ? "am" : p.pm && !p.am ? "pm" : "unknown");

// ---------- 整週 view ----------
export interface TripRow {
  name: string;
  group: string;
  start: string;
  end: string;
  days: number;
  daysInWeek: number;
  reason: string;
}
/** 外出紀錄：start/end 為日期，timeText 為「10/07 09:00–18:00」，hours 四捨五入到 0.5 小時。 */
export interface OutRow {
  name: string;
  group: string;
  start: string;
  end: string;
  timeText: string;
  hours: number;
  reason: string;
}
/** 出差＋外出合併清單的一列（白名單欄位）。duration：出差＝天數、外出＝小時。 */
export interface TravelRecord {
  kind: "trip" | "out";
  name: string;
  group: string;
  start: string;
  end: string;
  startAt: string; // 排序用：YYYY-MM-DD HH:MM
  timeText: string;
  duration: number;
  unit: "天" | "小時";
  reason: string;
}
export interface AttendanceSummary {
  expected: number;
  present: number;
  late: number;
  early: number;
  lack: number;
  leave: number;
  trip: number;
  out: number;
  field: number; // 外業有填日報的出勤人日（已含在 present 與 expected）
}
export interface AttendanceNotes {
  rosterInService: number;
  noAccount: number;
  unmapped: number; // 有 Lark帳號但換不到 employee_id
  outsideRoster: number; // 考勤組成員不在名冊（不列姓名）
  groupCount: number;
  invalidIds: number;
  rosterShared?: number; // 人員名單有幾列因共用同一 Lark帳號（名字不同）而合併成一人（只放數字）
  fieldPeople: number; // 外業人員（不在考勤組、所選週有外業成本單）人數
  fieldUnmatched: number; // 成本單的組長／出工人對不到在職名冊的不重複人數
  fieldNoApproval: number; // 外業人員中沒有 employee_id、查不到請假／出差／外出審批的人數
  // 以下只有呼叫端提供外業成本單時才有（只放數字與固定文案）
  fieldSheets?: number; // 所選週（到今天）內的成本單筆數
  fieldEmptyLinks?: number; // 其中有日期但組長與實際出工人都沒讀到的筆數
  fieldNoDate?: number; // 日期空白的筆數（整張成本單，不限所選週）
  fieldAllEmpty?: number; // 其中日期、組長、實際出工人三者全空的筆數（整張成本單；Lark 回空白頁的形狀）
  fieldMatched?: number; // 所選週成本單裡對到名冊的不重複人數（含考勤組成員）
  fieldIncomplete?: true; // 成本單分頁沒讀完（complete=false 或筆數少於來源總數）
  fieldError?: string; // 固定文案＋錯誤碼，例「讀不到外業成本單（1254302）」
}
export interface AttendanceView {
  status: "ok";
  source: "lark" | "demo";
  weekStart: number;
  today: string;
  generatedAt: number;
  days: { date: string; kind: "past" | "today" | "future" }[];
  people: { name: string; group: string; days: DayCode[] }[];
  summary: AttendanceSummary;
  trips: TripRow[];
  outs: OutRow[];
  records: TravelRecord[];
  recordCounts: { trips: number; outs: number };
  notes: AttendanceNotes;
}
// R02 receives only leave dates, keyed by the same names used by its work rows.
export type LeaveDays = Record<string, { date: string; kind: "full" | "half" }[]>;

export function attendanceLeaveDays(view: Pick<AttendanceView, "people" | "days">): { status: "ok"; days: LeaveDays } {
  const days: LeaveDays = Object.create(null);
  for (const person of view.people) {
    person.days.forEach((code, index) => {
      const date = view.days[index]?.date;
      if (!date || (code !== "leave" && !code.startsWith("leave-half"))) return;
      (days[person.name] ??= []).push({ date, kind: code === "leave" ? "full" : "half" });
    });
  }
  return { status: "ok", days };
}

export function leaveDaysByPerson(days: LeaveDays): Record<string, Record<string, "full" | "half">> {
  return Object.fromEntries(Object.entries(days).map(([name, entries]) => [
    name, Object.fromEntries(entries.map(({ date, kind }) => [date, kind])),
  ]));
}

export type AttendanceResponse =
  | AttendanceView
  | { status: "needs-permission"; missing: string[]; hint: string }
  | { status: "error"; error: string }
  | { status: "not-connected" }
  | { status: "forbidden"; error?: string; openId?: string };

export interface AttendanceInput {
  weekStart: number;
  now: number;
  roster: RosterPerson[];
  noAccountPeople?: FieldOnlyPerson[]; // 在職但沒有 Lark帳號：只能當外業用成本單對人
  employeeIds: Map<string, string>; // open_id → employee_id
  members: Set<string>; // 考勤組成員 employee_id
  tasks: LarkUserTask[];
  approvals: LarkUserApprovals[];
  notes: Pick<AttendanceNotes, "rosterInService" | "noAccount" | "groupCount" | "invalidIds"> & { rosterShared?: number };
  source?: "lark" | "demo";
  fieldCost?: FieldCostInput;
}
/** 外業成本單（V3，日期＝工作日期）：每張一列，組長與實際出工人為人員名單 record_id（組長開單代表全組）。date 空字串＝日期空白。 */
export interface FieldCostRow {
  date: string;
  leaderIds: string[];
  crewIds: string[];
}
export interface FieldCostInput {
  rows: FieldCostRow[];
  error?: string; // 固定文案（讀不到／欄位缺失），不含 API 路徑或 token
  incomplete?: true; // 資料沒讀完整（TableData.complete=false，或筆數少於 total／sourceTotal）
}

// 外業成本單欄位：優先用 field id（欄名會被改），找不到 id 才用欄名（2026-10-13 讀 V3 欄位表確認）
const FC_FIDS = { date: "fldQh6cdMp", leader: "fldmg63eFl", crew: "flddpaUr6b" };
interface FieldCostData {
  fields: { id: string; name: string }[];
  records: { fields: Record<string, unknown>; links?: Record<string, string[]> }[];
  complete?: boolean; // lib/types.ts TableData：分頁中途停止＝false
  total?: number; // 實際送出的筆數
  sourceTotal?: number; // Lark 來源總數（含被納入規則排除的）
  excluded?: number;
}
/** 讀外業成本單：只留所選週的列（含日期空白的，供計數）。找不到必要欄位＝讀不到；找不到實際出工人＝只算組長並留警示。 */
export function parseFieldCost(data: FieldCostData, dates: string[]): FieldCostInput {
  const col = (id: string, names: string[]) => data.fields.find((f) => f.id === id)?.name ?? names.find((n) => data.fields.some((f) => f.name === n));
  const dateCol = col(FC_FIDS.date, ["工作日期"]), leaderCol = col(FC_FIDS.leader, ["組長"]), crewCol = col(FC_FIDS.crew, ["實際出工人", "組員"]);
  if (!dateCol || !leaderCol) return { rows: [], error: "外業成本單找不到「工作日期」或「組長」欄" };
  const rows: FieldCostRow[] = [];
  for (const r of data.records) {
    const v = r.fields[dateCol];
    const date = (typeof v === "number" ? taipeiDate(v) : parseYmd(v)) ?? "";
    if (date && !dates.includes(date)) continue;
    rows.push({ date, leaderIds: r.links?.[leaderCol] ?? [], crewIds: crewCol ? r.links?.[crewCol] ?? [] : [] });
  }
  const incomplete = data.complete === false || (typeof data.total === "number" && data.total > data.records.length) || (typeof data.sourceTotal === "number" && data.sourceTotal > data.records.length + (data.excluded ?? 0));
  return { rows, ...(crewCol ? {} : { error: "外業成本單找不到「實際出工人」欄，只算組長" }), ...(incomplete ? { incomplete: true as const } : {}) };
}
/** 讀外業成本單失敗的固定文案＋錯誤碼；不帶 API 路徑、base／table id、原始訊息。 */
export function fieldCostError(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return `讀不到外業成本單（${typeof code === "number" || (typeof code === "string" && /^\d+$/.test(code)) ? code : "未知"}）`;
}
/**
 * 全空列（日期、組長、實際出工人都空）的正常基線與警示門檻。
 * 2026-10-13 以 lark-cli 唯讀量測 V3 外業成本單全表 755 列（連跑 3 次結果相同）：全空列 6、日期空白 13、有日期但 link 都空 1。
 * 網站讀成本單 page_size 是 500（lib/lark.ts），Lark 回空白頁時整頁（最多 500 列）的值都是空的，所以門檻＝基線＋20；
 * 盲區：最後一頁只有 1～20 列時整頁空白，全空列增加不到 20 列，不會觸發。之後若基線自然成長，先量測再改這兩個常數。
 */
export const FIELD_ALL_EMPTY_BASELINE = 6;
export const FIELD_ALL_EMPTY_LIMIT = FIELD_ALL_EMPTY_BASELINE + 20;
/**
 * 「有日期但組長與實際出工人 link 都空」（所選週）：2026-10-13 全表量測基線 1 筆（人工漏填偶爾會有）。
 * 1～3 筆＝資料提醒（註腳顯示，不算沒讀完、不縮短快取）；超過 3 筆才當「可能沒讀完整」警示。
 */
export const FIELD_EMPTY_LINKS_BASELINE = 1;
export const FIELD_EMPTY_LINKS_LIMIT = 3;

/** 一般錯誤（非權限）只回固定文案＋錯誤碼；不帶 API 路徑、base／table id、Lark 原始訊息。 */
export function attendanceErrorText(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return `讀取出勤資料失敗（${typeof code === "number" || (typeof code === "string" && /^\d+$/.test(code)) ? code : "未知"}）`;
}

/** 資料提醒（不是警示）：所選週有 1～3 張成本單沒填組長與實際出工人；沒有或超過門檻（改走警示）回 null。 */
export function fieldCostReminder(v: Pick<AttendanceView, "notes">): string | null {
  const n = v.notes.fieldEmptyLinks ?? 0;
  return n >= 1 && n <= FIELD_EMPTY_LINKS_LIMIT ? `有 ${n} 張成本單沒填組長與實際出工人` : null;
}

/** 快取存活時間：成功且沒有警示＝本週 5 分鐘、過去週 6 小時；失敗、沒權限、有警示＝60 秒（下次開頁重讀）。 */
export function attendanceTtl(v: AttendanceResponse, isCurrent: boolean): number {
  return v.status === "ok" && !fieldCostWarning(v) ? (isCurrent ? 5 * 60000 : 6 * 3600000) : 60000;
}

/** 外業成本單可能沒讀完整時的警示文字（沒事回 null）：讀不到／欄位缺失、過去的週 0 筆、有日期但 link 都空超過 3 筆、沒讀完、全空列暴增、人全部對不到名冊。 */
export function fieldCostWarning(v: Pick<AttendanceView, "days" | "notes">): string | null {
  const n = v.notes;
  if (n.fieldSheets === undefined) return null;
  const parts: string[] = [];
  if (n.fieldError) parts.push(n.fieldError);
  if (n.fieldSheets === 0 && v.days.every((d) => d.kind === "past")) parts.push("這週成本單 0 筆");
  if (n.fieldIncomplete) parts.push("成本單資料沒有全部讀完");
  if ((n.fieldEmptyLinks ?? 0) > FIELD_EMPTY_LINKS_LIMIT) parts.push(`${n.fieldEmptyLinks} 筆成本單有日期但組長與實際出工人都沒讀到`);
  if ((n.fieldAllEmpty ?? 0) > FIELD_ALL_EMPTY_LIMIT) parts.push(`整張成本單有 ${n.fieldAllEmpty} 筆整列都是空的（日期、組長、實際出工人全空；平常約 ${FIELD_ALL_EMPTY_BASELINE} 筆）`);
  if (n.fieldSheets > 0 && n.fieldMatched === 0 && (n.fieldUnmatched ?? 0) > 0) parts.push(`這週 ${n.fieldSheets} 筆成本單裡的 ${n.fieldUnmatched} 位出工人全部對不到在職名冊`);
  return parts.length ? `外業成本單可能沒讀完整：${parts.join("；")}` : null;
}

// 算進應到／到班的日子（外業 field 也算）
const WORKED = new Set<DayCode>(["ok", "late", "early", "late-early", "lack", "field"]);

export function buildAttendanceView(inp: AttendanceInput): AttendanceView {
  const dates = weekDates(inp.weekStart);
  const today = taipeiDate(inp.now);
  const appr = normalizeApprovals(inp.approvals);
  const tasks = new Map<string, LarkTaskRecord[]>();
  for (const t of inp.tasks) {
    const day = parseYmd(t.day);
    if (!t.user_id || !day) continue;
    const k = `${t.user_id}|${day}`;
    tasks.set(k, [...(tasks.get(k) ?? []), ...(t.records ?? [])]);
  }
  const summary: AttendanceSummary = { expected: 0, present: 0, late: 0, early: 0, lack: 0, leave: 0, trip: 0, out: 0, field: 0 };
  // 一天的狀態碼 code 以權重 w（1 或 0.5）加進摘要；遲到、早退照計次
  const add = (code: DayCode, w: number) => {
    if (WORKED.has(code)) {
      summary.expected += w;
      if (code === "lack") summary.lack += w;
      else summary.present += w;
      if (code === "field") summary.field += w;
      if (code === "late" || code === "late-early") summary.late++;
      if (code === "early" || code === "late-early") summary.early++;
    } else if (code === "leave" || code === "trip" || code === "out") summary[code] += w;
  };
  // 外業成本單：人員名單 record_id → 有成本單的日期（所選週、到今天）
  const fieldDays = new Map<string, Set<string>>();
  const fieldOnly = inp.noAccountPeople ?? [];
  // record_id（含同人多列的別名）→ 名冊裡代表這個人的 record_id
  // 兩個 open_id 換出同一個 employee_id 時只留第一列，第二列的 record_id（含別名）也併到第一列
  const rosterRecIds = new Map<string, string>();
  const eidFirst = new Map<string, FieldOnlyPerson>();
  for (const r of [...inp.roster, ...fieldOnly]) {
    const eid = "openId" in r ? inp.employeeIds.get((r as RosterPerson).openId) : undefined;
    let canon: FieldOnlyPerson = r;
    if (eid) {
      canon = eidFirst.get(eid) ?? r;
      eidFirst.set(eid, canon);
    }
    if (canon.recordId) for (const id of [r.recordId, ...(r.altRecordIds ?? [])]) if (id && !rosterRecIds.has(id)) rosterRecIds.set(id, canon.recordId);
  }
  const unmatched = new Set<string>();
  const matched = new Set<string>();
  let sheets = 0, emptyLinks = 0, noDate = 0, allEmpty = 0;
  for (const r of inp.fieldCost?.rows ?? []) {
    if (!r.date) {
      noDate++;
      if (!r.leaderIds.length && !r.crewIds.length) allEmpty++;
      continue;
    }
    if (!dates.includes(r.date) || r.date > today) continue; // 未來日不算
    sheets++;
    if (!r.leaderIds.length && !r.crewIds.length) emptyLinks++;
    for (const id of new Set([...r.leaderIds, ...r.crewIds])) {
      const rid = rosterRecIds.get(id);
      if (!rid) {
        unmatched.add(id);
        continue;
      }
      matched.add(rid);
      fieldDays.set(rid, (fieldDays.get(rid) ?? new Set()).add(r.date));
    }
  }
  let fieldPeople = 0, fieldNoApproval = 0;
  const people: AttendanceView["people"] = [];
  const trips: TripRow[] = [];
  const outs: OutRow[] = [];
  const records: TravelRecord[] = [];
  const tripIds = new Set<string>(), outIds = new Set<string>(); // 張數以 approval_id 去重（多人同一張單只算一張）
  let unmapped = 0;
  const mappedIds = new Set<string>();

  // 沒 Lark帳號的外業人員沒有 employee_id，查不到審批
  const everyone = [...inp.roster.map((p) => ({ person: p as FieldOnlyPerson, eid: inp.employeeIds.get(p.openId), hasAccount: true })), ...fieldOnly.map((p) => ({ person: p, eid: undefined, hasAccount: false }))];
  for (const { person, eid, hasAccount } of everyone) {
    if (!eid && hasAccount) unmapped++;
    if (eid && mappedIds.has(eid)) continue; // 同一個 employee_id 只算一個人（兩個 open_id 換出同一人）
    if (eid) mappedIds.add(eid);
    const mine = eid ? appr.get(eid) ?? [] : [];
    for (const a of mine) {
      if (a.kind === "out") {
        const covered = [...a.covered].sort();
        const start = a.start ?? covered[0];
        const end = a.end ?? covered[covered.length - 1];
        if (!dates.some((d) => a.covered.has(d)) || !start || !end) continue;
        const hours = outHours(a);
        const timeText = outTimeText(a.startRaw, a.endRaw, start, end);
        outIds.add(a.id);
        outs.push({ name: person.name, group: person.group, start, end, timeText, hours, reason: truncateText(a.reason, 40) });
        records.push({ kind: "out", name: person.name, group: person.group, start, end, startAt: `${start} ${hm(a.startRaw)?.[2] ?? "00:00"}`, timeText, duration: hours, unit: "小時", reason: truncateText(a.reason, 40) });
        continue;
      }
      if (a.kind !== "trip") continue;
      const inWeek = dates.filter((d) => a.covered.has(d)).length;
      const covered = [...a.covered].sort();
      const start = a.start ?? covered[0];
      const end = a.end ?? covered[covered.length - 1];
      if (!inWeek || !start || !end) continue;
      const days = diffDays(start, end) + 1;
      tripIds.add(a.id);
      trips.push({ name: person.name, group: person.group, start, end, days, daysInWeek: inWeek, reason: truncateText(a.reason, 40) });
      records.push({ kind: "trip", name: person.name, group: person.group, start, end, startAt: `${start} ${hm(a.startRaw)?.[2] ?? "00:00"}`, timeText: start === end ? md(start) : `${md(start)}–${md(end)}`, duration: days, unit: "天", reason: truncateText(a.reason, 40) });
    }
    const isMember = !!eid && inp.members.has(eid);
    const myField = !isMember && person.recordId ? fieldDays.get(person.recordId) : undefined;
    if (!isMember && !myField) continue; // 不在考勤組、本週也沒外業成本單＝不列
    if (myField) {
      fieldPeople++;
      if (!eid) fieldNoApproval++;
    }
    // 請假各日涵蓋的半天（同日多張取聯集）
    const leaveParts = new Map<string, LeavePart>();
    for (const a of mine) if (a.kind === "leave") for (const [d, part] of leaveCoverage(a)) leaveParts.set(d, mergePart(leaveParts.get(d), part));
    const codes: DayCode[] = [];
    for (const [i, d] of dates.entries()) {
      if (d > today) {
        codes.push("future");
        continue;
      }
      const part = leaveParts.get(d);
      const lw = part ? leaveWeight(part) : 0;
      const other = (["trip", "out"] as const).find((k) => mine.some((a) => a.kind === k && a.covered.has(d))) ?? null;
      if (isMember) {
        const recs = tasks.get(`${eid}|${d}`);
        if (lw > 0 && lw < 1) {
          if (other && halfLeaveDueDay(recs, i < 5)) {
            // 半天假同日又有出差、外出：一律整天算出差／外出（不論打卡紀錄、不論是不是今天；請假不重複計），週末免打卡日除外。
            // 出差或外出以 Lark 打卡上的標記優先（與沒有請假時 classifyDay 的順序一致），沒有標記才用審批。
            const kind = tripOutSupplement(recs) ?? other;
            add(kind, 1);
            codes.push(kind);
            continue;
          }
          // 半天假：請假 0.5；另半天看打卡（忽略請假那半邊的打卡）
          const base = classifyDay(recs, { approval: other, leaveHalf: halfSide(part!), open: d === today });
          if (WORKED.has(base)) {
            add("leave", 0.5);
            add(base, 0.5);
            codes.push(base === "lack" ? "leave-half-lack" : base === "late" ? "leave-half-late" : base === "early" ? "leave-half-early" : base === "late-early" ? "leave-half-late-early" : "leave-half");
          } else if (base === "trip" || base === "out") {
            add(base, 1); // 同日出差、外出：整天照扣分母（請假不重複計）
            codes.push(base);
          } else if (halfLeaveDueDay(recs, i < 5)) {
            // 另半天沒有證據（Lark 兩側都標 Leave、沒紀錄的平日、今天下午還沒結束）：請假 0.5 照計，另半天不入應到
            add("leave", 0.5);
            codes.push("leave-half-open");
          } else {
            codes.push(base); // 純免打卡日（週末）不計
          }
          continue;
        }
        let code = classifyDay(recs, { approval: lw >= 1 ? "leave" : other, open: d === today });
        // 整天假、出差、外出落在應打卡日但沒有可用打卡紀錄（平日沒 task 紀錄、或兩側標 Leave）：與半天假、外業一致，照計 1、不入應到；純免打卡日（週末）不計
        if ((lw >= 1 || other) && (code === "none" || code === "off") && halfLeaveDueDay(recs, i < 5)) code = lw >= 1 ? "leave" : other!;
        add(code, 1);
        codes.push(code);
        continue;
      }
      // 外業人員：沒有應打卡日資料，審批只算平日；有成本單＝外業出勤；都沒有＝不列入應到
      const worked = myField!.has(d);
      if (i < 5 && lw > 0 && lw < 1 && !other) {
        add("leave", 0.5);
        if (worked) add("field", 0.5);
        codes.push(worked ? "leave-half" : "leave-half-nofield");
        continue;
      }
      const code: DayCode = i < 5 && lw >= 1 ? "leave" : i < 5 && other ? other : worked ? "field" : "nofield";
      add(code, 1);
      codes.push(code);
    }
    people.push({ name: person.name, group: person.group, days: codes });
  }
  const cmp = (a: string, b: string) => a.localeCompare(b, "zh-Hant");
  people.sort((a, b) => cmp(a.group, b.group) || cmp(a.name, b.name));
  trips.sort((a, b) => cmp(a.start, b.start) || cmp(a.name, b.name));
  outs.sort((a, b) => cmp(a.start, b.start) || cmp(a.name, b.name));
  records.sort((a, b) => cmp(a.startAt, b.startAt) || cmp(a.name, b.name));
  return {
    status: "ok",
    source: inp.source ?? "lark",
    weekStart: inp.weekStart,
    today,
    generatedAt: inp.now,
    days: dates.map((date) => ({ date, kind: date < today ? "past" : date === today ? "today" : "future" })),
    people,
    summary,
    trips,
    outs,
    records,
    recordCounts: { trips: tripIds.size, outs: outIds.size },
    notes: {
      ...inp.notes,
      unmapped,
      outsideRoster: [...inp.members].filter((m) => !mappedIds.has(m)).length,
      fieldPeople,
      fieldUnmatched: unmatched.size,
      fieldNoApproval,
      ...(inp.fieldCost ? { fieldSheets: sheets, fieldEmptyLinks: emptyLinks, fieldNoDate: noDate, fieldAllEmpty: allEmpty, fieldMatched: matched.size, ...(inp.fieldCost.incomplete ? { fieldIncomplete: true as const } : {}), ...(inp.fieldCost.error ? { fieldError: inp.fieldCost.error } : {}) } : {}),
    },
  };
}

/** 最多 limit 個同時進行 */
export async function mapPool<T>(items: T[], limit: number, job: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) await job(items[next++]); }));
}
