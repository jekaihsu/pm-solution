// R04 出勤／出差口徑（純函式，不 import 任何 lib 的值，node --test 可直接載入；抓取在 lib/attendance.ts）。
// 資料來自 Lark 假勤：user_tasks（打卡結果）與 user_approvals（出差／外出／請假審批）。
// 輸出只有白名單欄位：姓名、組別、每日狀態代碼、出差起訖／天數／截斷事由、摘要數字。
// employee_id、open_id、地點、GPS、照片、打卡時間一律不進輸出。預設口徑待業主確認。

export type DayCode = "ok" | "late" | "early" | "late-early" | "lack" | "leave" | "trip" | "out" | "off" | "none" | "future" | "pending";
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

/**
 * 一個人一天的狀態。順序：先看 supplement（請假／出差／外出常是 NoNeedCheck＋supplement），
 * 再看 NoNeedCheck（免打卡）；user_approvals 覆蓋只套在「應打卡日」，週末不會被誤算。
 */
export function classifyDay(records: LarkTaskRecord[] | undefined, ctx: { isToday?: boolean; approval?: ApprovalKind | null } = {}): DayCode {
  const recs = records ?? [];
  if (!recs.length) return "none";
  let suppKind: ApprovalKind | null = null;
  for (const r of recs)
    for (const s of [r.check_in_result_supplement, r.check_out_result_supplement]) if (s && SUPP[s] && !suppKind) suppKind = SUPP[s];
  const sides: { result: string; supp: string }[] = [];
  for (const r of recs) {
    for (const [res, sup] of [[r.check_in_result, r.check_in_result_supplement], [r.check_out_result, r.check_out_result_supplement]] as const)
      if (res && KNOWN.has(res) && res !== "NoNeedCheck") sides.push({ result: res, supp: sup ?? "" });
  }
  if (!sides.length && !suppKind) return recs.some((r) => r.check_in_result === "NoNeedCheck" || r.check_out_result === "NoNeedCheck") ? "off" : "none";
  const approval = suppKind ?? ctx.approval ?? null;
  if (approval) return approval;
  let lack = false, late = false, early = false;
  for (const s of sides) {
    if (s.result === "Lack" && !RESCUE.has(s.supp)) lack = true;
    else if (s.result === "Late") late = true;
    else if (s.result === "Early") early = true;
  }
  if (lack) return ctx.isToday ? "pending" : "lack";
  return late && early ? "late-early" : late ? "late" : early ? "early" : "ok";
}

// ---------- 名冊、考勤組成員 ----------
export interface RosterPerson {
  name: string;
  group: string;
  openId: string;
}
type Cell = string | number | boolean | null | undefined | (string | number)[];
export interface RosterRow {
  fields: Record<string, Cell>;
  people?: Record<string, { id: string; name: string }[]>;
}
export const NO_GROUP = "（未填組別）";

/** 在職名冊（V3 人員名單）。欄名由呼叫端傳入；在職但沒有 Lark帳號的只計人數、不列姓名。 */
export function buildRoster(rows: RosterRow[], cols: { name: string; group: string; active: string; account: string }) {
  const people: RosterPerson[] = [];
  let inService = 0, noAccount = 0;
  const text = (v: Cell) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v)).trim();
  for (const r of rows) {
    if (r.fields[cols.active] !== true) continue;
    inService++;
    const openId = r.people?.[cols.account]?.find((p) => p.id)?.id;
    if (!openId) {
      noAccount++;
      continue;
    }
    people.push({ name: text(r.fields[cols.name]), group: text(r.fields[cols.group]) || NO_GROUP, openId });
  }
  return { people, inService, noAccount };
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
  start: string | null;
  end: string | null;
  reason: string;
  covered: Set<string>; // 該審批覆蓋的日期（起訖區間；解不出才用 entry 日期）
}

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
        // 結束時間剛好是跨日的午夜 00:00:00＝不含那一天
        if (start && end && end > start && /\d{2}:\d{2}:\d{2}$/.test(String(a.end_time)) && String(a.end_time).endsWith("00:00:00")) end = addDays(end, -1);
        const key = `${kind}|${a.approval_id ?? a.uniq_id ?? `${a.start_time}|${a.end_time}|${a.reason}`}`;
        const cur = m.get(key) ?? { kind, start, end, reason: String(a.reason ?? ""), covered: new Set<string>() };
        // 起訖區間為準（實測 entry 的 date 會多一天）；解不出起訖才退回 entry 日期。
        if (start && end) for (let d = start; d <= end && diffDays(start, d) < 400; d = addDays(d, 1)) cur.covered.add(d);
        else if (entryDate) cur.covered.add(entryDate);
        m.set(key, cur);
      }
    }
  }
  return new Map([...byUser].map(([k, v]) => [k, [...v.values()]]));
}

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
export interface AttendanceSummary {
  expected: number;
  present: number;
  late: number;
  early: number;
  lack: number;
  leave: number;
  trip: number;
  out: number;
}
export interface AttendanceNotes {
  rosterInService: number;
  noAccount: number;
  unmapped: number; // 有 Lark帳號但換不到 employee_id
  outsideRoster: number; // 考勤組成員不在名冊（不列姓名）
  groupCount: number;
  invalidIds: number;
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
  notes: AttendanceNotes;
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
  employeeIds: Map<string, string>; // open_id → employee_id
  members: Set<string>; // 考勤組成員 employee_id
  tasks: LarkUserTask[];
  approvals: LarkUserApprovals[];
  notes: Pick<AttendanceNotes, "rosterInService" | "noAccount" | "groupCount" | "invalidIds">;
  source?: "lark" | "demo";
}

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
  const summary: AttendanceSummary = { expected: 0, present: 0, late: 0, early: 0, lack: 0, leave: 0, trip: 0, out: 0 };
  const people: AttendanceView["people"] = [];
  const trips: TripRow[] = [];
  let unmapped = 0;
  const mappedIds = new Set<string>();

  for (const p of inp.roster) {
    const eid = inp.employeeIds.get(p.openId);
    if (!eid) {
      unmapped++;
      continue;
    }
    mappedIds.add(eid);
    const mine = appr.get(eid) ?? [];
    for (const a of mine) {
      if (a.kind !== "trip") continue;
      const inWeek = dates.filter((d) => a.covered.has(d)).length;
      const covered = [...a.covered].sort();
      const start = a.start ?? covered[0];
      const end = a.end ?? covered[covered.length - 1];
      if (!inWeek || !start || !end) continue;
      trips.push({ name: p.name, group: p.group, start, end, days: diffDays(start, end) + 1, daysInWeek: inWeek, reason: truncateText(a.reason, 40) });
    }
    if (!inp.members.has(eid)) continue;
    const codes = dates.map((d): DayCode => {
      if (d > today) return "future";
      const recs = tasks.get(`${eid}|${d}`);
      const cover = (["leave", "trip", "out"] as const).find((k) => mine.some((a) => a.kind === k && a.covered.has(d))) ?? null;
      return classifyDay(recs, { isToday: d === today, approval: cover });
    });
    for (const c of codes) {
      if (c === "ok" || c === "late" || c === "early" || c === "late-early" || c === "lack") {
        summary.expected++;
        if (c !== "lack") summary.present++;
        if (c === "late" || c === "late-early") summary.late++;
        if (c === "early" || c === "late-early") summary.early++;
        if (c === "lack") summary.lack++;
      } else if (c === "leave" || c === "trip" || c === "out") summary[c]++;
    }
    people.push({ name: p.name, group: p.group, days: codes });
  }
  const cmp = (a: string, b: string) => a.localeCompare(b, "zh-Hant");
  people.sort((a, b) => cmp(a.group, b.group) || cmp(a.name, b.name));
  trips.sort((a, b) => cmp(a.start, b.start) || cmp(a.name, b.name));
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
    notes: { ...inp.notes, unmapped, outsideRoster: [...inp.members].filter((m) => !mappedIds.has(m)).length },
  };
}

/** 最多 limit 個同時進行 */
export async function mapPool<T>(items: T[], limit: number, job: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) await job(items[next++]); }));
}
