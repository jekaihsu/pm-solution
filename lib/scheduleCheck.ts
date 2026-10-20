// R04 預排核對：純函式，所有日期皆為台北 YYYY-MM-DD。
import type { TableData } from "./types";
import { classifyPerson, normalizeName, GROUP_OVERRIDES, SOURCE_PENDING_NAMES, type PersonPolicy } from "./yupaiPolicy";
import { dateRange, normalizeWorkDate, weekday } from "./workDate";
export const NO_GROUP = "（未填組別）";
export const taipeiDay = (t: number) => Math.floor((t + 8 * 3600000) / 86400000);
const text = (v: unknown): string => v == null ? "" : (Array.isArray(v) ? v.join("、") : String(v)).trim();
export const tableKnown = (d?: TableData): d is TableData => !!d && d.complete === true && d.total === d.records.length && !d.stale && !d.error;
export interface RosterLite extends PersonPolicy { recordId: string; rawGroup: string; effectiveGroup: string; group: string; sourcePending: boolean }
export interface RosterIndex { allNames: Map<string, string>; active: RosterLite[]; byName: Map<string, RosterLite> }
export function buildRosterIndex(people: TableData): RosterIndex {
  if (!tableKnown(people)) throw new Error("人員名單讀取不完整或已過期");
  if (!["姓名", "在職"].every((n) => people.fields.some((f) => f.name === n))) throw new Error("人員名單缺少必要欄位");
  const allNames = new Map<string, string>(), byName = new Map<string, RosterLite>();
  const active: RosterLite[] = [];
  for (const r of people.records) {
    if (allNames.has(r.id)) throw new Error("人員名單重複 record_id");
    const rawName = text(r.fields.姓名), name = normalizeName(rawName);
    allNames.set(r.id, name);
    if (r.fields.在職 !== true) continue;
    if (!name) throw new Error("在職人員姓名空白");
    if (byName.has(name)) throw new Error("在職人員正規化姓名重複");
    const rawGroup = text(r.fields.所屬組別), effectiveGroup = GROUP_OVERRIDES[name] ?? rawGroup;
    const p: RosterLite = { ...classifyPerson(rawName, effectiveGroup), recordId: r.id, rawGroup, effectiveGroup, group: effectiveGroup || NO_GROUP, sourcePending: SOURCE_PENDING_NAMES.has(name) };
    if (p.sourcePending && p.requiresPlanning) p.dataAttentionReasons.push("資料來源待確認");
    active.push(p); byName.set(name, p);
  }
  return { allNames, active, byName };
}
export function rosterIssue(data: TableData): string | null { try { buildRosterIndex(data); return null; } catch (e) { return (e as Error).message; } }
export const parseRoster = (data: TableData) => buildRosterIndex(data).active;
export function exemptionRosterNote(data?: TableData): string {
  if (!data || rosterIssue(data)) return "林育寬：名冊未知，無法確認豁免是否適用";
  return [...buildRosterIndex(data).allNames.values()].includes("林育寬") ? "林育寬：存在於人員名單 V3；在職時適用豁免" : "林育寬：不存在於人員名單 V3，本筆豁免為 no-op（無適用人員）";
}
const key = (who: string, day: string) => `${who}\t${day}`;
const fid = (d: TableData, id: string, name: string) => d.fields.find((f) => f.id === id)?.name ?? d.fields.find((f) => f.name === name)?.name;
const ids = (r: TableData["records"][number], f?: string) => f ? r.links?.[f] ?? (Array.isArray(r.fields[f]) ? r.fields[f] as string[] : []) : [];
export const isFieldGroup = (group: string) => !!group && group !== "外業" && /水深|地形|點工|ROV|奇穎|外業/.test(group);
function scheduleFields(d: TableData) {
  return { start: fid(d, "fldMXOggGP", "開始日期"), end: fid(d, "fldjWv1xST", "結束日期"), person: fid(d, "fld7KNCsVe", "人員"), kind: fid(d, "fld78OmLVn", "條類型"), group: fid(d, "fldNDUy2XP", "組別"), trade: fid(d, "fldrENe4H6", "業別") };
}
export function planningKnown(d?: TableData): boolean { return tableKnown(d) && Object.values(scheduleFields(d)).every(Boolean); }
export interface ScheduleIndex { personalSchedule: Map<string, Set<string>>; groupSchedule: Set<string>; trades: Map<string, Map<string, number>> }
export function buildScheduleIndex(d: TableData, roster: RosterIndex, start: string, end: string): ScheduleIndex {
  if (!planningKnown(d)) throw new Error("預排來源讀取失敗或缺少必要欄位");
  const f = scheduleFields(d);
  const personalSchedule = new Map<string, Set<string>>(), groupSchedule = new Set<string>(), trades = new Map<string, Map<string, number>>();
  for (const r of d.records) {
    const s = normalizeWorkDate(r.fields[f.start!]); if (!s) continue;
    const e = normalizeWorkDate(r.fields[f.end!]) ?? s;
    if (e < start || s > end || e < s) continue;
    const names = ids(r, f.person).map((id) => roster.allNames.get(id)).filter((n): n is string => !!n);
    const groups = new Set([text(r.fields[f.group!]), ...names.map((n) => roster.byName.get(n)?.effectiveGroup ?? "")]);
    const days = dateRange(s < start ? start : s, e > end ? end : e).filter(weekday);
    const trade = text(r.fields[f.trade!]);
    for (const n of names) {
      // Counter is per schedule record, not per expanded day (Python pre_biz).
      if (trade) { const m = trades.get(n) ?? new Map<string, number>(); m.set(trade, (m.get(trade) ?? 0) + 1); trades.set(n, m); }
      for (const day of days) { const k = key(n, day), kinds = personalSchedule.get(k) ?? new Set<string>(); kinds.add(text(r.fields[f.kind!])); personalSchedule.set(k, kinds); }
    }
    for (const g of groups) if (isFieldGroup(g)) for (const day of days) groupSchedule.add(key(g, day));
  }
  return { personalSchedule, groupSchedule, trades };
}
export const hasPlanning = (s: ScheduleIndex, p: RosterLite, day: string) => s.personalSchedule.has(key(p.name, day)) || (isFieldGroup(p.effectiveGroup) && s.groupSchedule.has(key(p.effectiveGroup, day)));
export function scheduledPersonIds(s: ScheduleIndex, roster: RosterLite[], start: string, end: string): Set<string> {
  return new Set(roster.filter((p) => dateRange(start, end).some((d) => hasPlanning(s, p, d))).map((p) => p.recordId));
}
export const unfilledPlanning = (roster: RosterLite[], scheduled: Set<string>) => roster.filter((p) => p.requiresPlanning && !p.sourcePending && !scheduled.has(p.recordId));
export const LOG_FIELDS = {
  "field-work": ["工作日期-薪資", "此單出工人", false],
  "internal-work": ["工作日期-營業額明細", "姓名", false],
  "admin-work": ["工作日期-營業額明細", "營業額人員-明細", false],
  "pm-cost": ["工作日期", "填表人", true],
  "internal-cost": ["工作日期", "填報人", true],
} as const;
export type LogSource = keyof typeof LOG_FIELDS;
const LOG_LABELS: Record<LogSource, string> = { "field-work": "外業工作單", "internal-work": "內業工作單", "admin-work": "行政工作單", "pm-cost": "業務PM成本單", "internal-cost": "內業成本單" };
export const logSourceText = (sources: LogSource[]) => sources.map((s) => LOG_LABELS[s]).join("、");
export type LogTables = Record<LogSource, TableData>;
export interface LogIndex { logs: Map<string, Set<LogSource>>; adminLatest: string | null }
export function buildLogIndex(tables: LogTables, roster: RosterIndex, start: string, end: string): LogIndex {
  const logs = new Map<string, Set<LogSource>>(); let adminLatest: string | null = null;
  for (const source of Object.keys(LOG_FIELDS) as LogSource[]) {
    const data = tables[source], [dateF, whoF, link] = LOG_FIELDS[source];
    if (!tableKnown(data) || ![dateF, whoF].every((n) => data.fields.some((f) => f.name === n))) throw new Error("日誌來源讀取失敗或缺少必要欄位");
    for (const r of data.records) {
      const day = normalizeWorkDate(r.fields[dateF]); if (!day) continue;
      if (source === "admin-work" && (!adminLatest || day > adminLatest)) adminLatest = day;
      if (day < start || day > end) continue;
      const names = link ? ids(r, whoF).map((id) => {
        const n = roster.allNames.get(id); if (!n) throw new Error("區間內成本單人員 link 不在完整名冊"); return n;
      }) : (Array.isArray(r.fields[whoF]) ? r.fields[whoF] as string[] : text(r.fields[whoF]).split(source === "field-work" ? /[,，]/ : /[,，、]/)).map(normalizeName);
      for (const n of names.filter(Boolean)) { const k = key(n, day), sources = logs.get(k) ?? new Set<LogSource>(); sources.add(source); logs.set(k, sources); }
    }
  }
  return { logs, adminLatest };
}
export const WORKED_STATUS = new Set(["已出勤", "外業出勤", "休息日出工", "已出勤（打卡＋外業）", "有出勤／有請假"]);
export interface AttendanceDay { status?: string; approvedLeave?: string; leaveCount?: number | string | null; leave?: "leave" | "trip" | "out"; worked?: boolean }
export interface CheckAttendance {
  // Existing API lacks company-wide daily/rest ratios and pending-approval evidence. Absence is not zero.
  compatibility: "full" | "existing-api";
  days: Record<string, Record<string, AttendanceDay>>; // roster record_id → date → evidence
  restCounts?: Record<string, { rest: number; total: number }>;
  punch: Record<string, string[]>;
  members: string[];
}
export interface ExistingDailyResponse { status: string; leave?: Record<string, { date: string; kind: string }[]>; punch?: Record<string, string[]>; members?: string[] }
export function existingAttendance(d: ExistingDailyResponse): CheckAttendance {
  if (d.status !== "ok" || !d.leave || !d.punch || !Array.isArray(d.members)) throw new Error("假勤來源讀取失敗或不完整");
  const days: CheckAttendance["days"] = {};
  for (const [id, list] of Object.entries(d.leave)) for (const l of list) {
    if (["leave", "trip", "out"].includes(l.kind)) (days[id] ??= {})[l.date] = { leave: l.kind as "leave" | "trip" | "out" };
  }
  return { compatibility: "existing-api", days, punch: d.punch, members: d.members };
}
export type CheckCode = "排" | "未排" | "待排" | "填" | "未填" | "待" | "假" | "·" | "待確認";
export interface DayResult extends RosterLite {
  date: string; kind: "source_pending" | "leave" | "none" | "work" | "unknown";
  planning: CheckCode; log: CheckCode; logSources: LogSource[]; missing: boolean; punch: string; punchMissing: boolean; reason: string;
}
export function evaluatePunch(p: RosterLite, day: string, att: CheckAttendance, today: string, leave: boolean) {
  const member = att.members.includes(p.recordId), punched = att.punch[p.recordId]?.includes(day) ?? false;
  const missing = !p.departedReason && member && day <= today && !punched && !leave;
  const status = p.departedReason ? "不檢核" : !member ? "不打卡" : day > today ? "待" : punched ? "有" : leave ? "假" : "無";
  return { name: p.name, recordId: p.recordId, date: day, status, missing };
}
const scheduleDeadline = (day: string) => {
  const t = new Date(`${day}T00:00:00Z`), dow = t.getUTCDay();
  return new Date(t.getTime() - ((dow + 6) % 7 + 3) * 86400000).toISOString().slice(0, 10);
};
export function evaluateDay(p: RosterLite, day: string, s: ScheduleIndex, l: LogIndex, att: CheckAttendance, today: string, cutoff: string): DayResult {
  const kinds = s.personalSchedule.get(key(p.name, day)), evidence = att.days[p.recordId]?.[day];
  const hasPre = hasPlanning(s, p, day), sources = [...(l.logs.get(key(p.name, day)) ?? [])];
  const leaveCount = evidence?.leaveCount;
  const leave = !!evidence?.leave || !!evidence?.approvedLeave || evidence?.status === "核准請假"
    || (leaveCount != null && !["", "0", "0.0"].includes(String(leaveCount))) || (kinds?.size === 1 && kinds.has("休假"));
  const worked = evidence?.worked === true || WORKED_STATUS.has(evidence?.status ?? "");
  let kind: DayResult["kind"], planning: CheckCode, log: CheckCode;
  if (p.sourcePending) { kind = "source_pending"; planning = log = "待確認"; }
  else if (leave) { kind = "leave"; planning = log = "假"; }
  else if (!hasPre && !sources.length && !worked) {
    kind = att.compatibility === "full" ? "none" : "unknown"; planning = log = "·";
  } else { kind = "work"; planning = hasPre ? "排" : today < scheduleDeadline(day) ? "待排" : "未排"; log = sources.length ? "填" : day >= cutoff ? "待" : "未填"; }
  const missing = planning === "未排" || log === "未填";
  const punch = evaluatePunch(p, day, att, today, leave);
  return { ...p, date: day, kind, planning, log, logSources: sources, missing,
    punch: punch.status, punchMissing: punch.missing,
    reason: kind === "source_pending" ? "資料來源待確認" : kind === "leave" ? "本人假勤／純休假預排（沿用每日免缺漏口徑）" : kind === "unknown" ? "未觀測活動；目前假勤資料缺完整考勤證據，不能判定無活動" : kind === "none" ? "無活動訊號" : missing ? "預排／日誌有缺漏" : "未偵測預排／日誌缺失（仍可能有資料注意）" };
}
export const checkText = (r: DayResult, kind: "planning" | "log") => r[kind];
export const statusText = (r: DayResult) => r.reason;
export const checkCsvRow = (r: DayResult) => [r.name, r.rawGroup, r.effectiveGroup, r.classification, checkText(r, "planning"), checkText(r, "log"), logSourceText(r.logSources), r.punch, statusText(r), r.dataAttentionReasons.join("；")];
export function summarizeRange(roster: RosterLite[], rows: DayResult[]) {
  const scope = roster.filter((p) => p.requiresPlanning), names = (fn: (r: DayResult) => boolean) => new Set(rows.filter(fn).map((r) => r.name));
  const pending = new Set(scope.filter((p) => p.sourcePending).map((p) => p.name));
  const attention = names((r) => r.missing), missed = names((r) => r.log === "未填"), unscheduled = names((r) => r.planning === "未排");
  const work = names((r) => r.kind === "work"), unknown = names((r) => r.kind === "unknown");
  const unable = new Set(scope.filter((p) => !pending.has(p.name) && !work.has(p.name) && !unknown.has(p.name)).map((p) => p.name));
  const attendanceUnknown = new Set(scope.filter((p) => !pending.has(p.name) && unknown.has(p.name) && !attention.has(p.name)).map((p) => p.name));
  const clean = new Set(scope.filter((p) => !pending.has(p.name) && !unable.has(p.name) && !attention.has(p.name) && !attendanceUnknown.has(p.name)).map((p) => p.name));
  const dataAttention = new Set(scope.filter((p) => !p.effectiveGroup || p.sourcePending).map((p) => p.name));
  const total = new Set([...attention, ...unable, ...dataAttention, ...attendanceUnknown]);
  const divisions = ["外業", "內業", "業務"] as const;
  return { active: roster.length, checked: scope.length, assessed: scope.length - pending.size,
    attention: attention.size, missed: missed.size, unschedOnly: [...unscheduled].filter((n) => !missed.has(n)).length,
    unable: unable.size, clean: clean.size, sourcePending: pending.size, dataAttention: dataAttention.size, totalAttention: total.size,
    attendanceUnknown: attendanceUnknown.size, punchMissing: names((r) => r.punchMissing).size,
    attentionByDivision: Object.fromEntries(divisions.map((d) => [d, scope.filter((p) => p.classification === d && attention.has(p.name)).length])),
    byDivision: Object.fromEntries(divisions.map((d) => [d, { checked: scope.filter((p) => p.classification === d).length, assessed: scope.filter((p) => p.classification === d && !p.sourcePending).length, attention: scope.filter((p) => p.classification === d && attention.has(p.name)).length }])),
  };
}
export function evaluateRange(input: { people: TableData; schedule: TableData; logs: LogTables; attendance: CheckAttendance; start: string; end: string; today: string }) {
  const { people, schedule, logs, attendance, start, end, today } = input;
  const roster = buildRosterIndex(people), s = buildScheduleIndex(schedule, roster, start, end), l = buildLogIndex(logs, roster, start, end);
  const dates = dateRange(start, end).filter((day) => {
    if (!weekday(day)) return false;
    const count = attendance.restCounts?.[day];
    return !count || !count.total || count.rest / count.total <= 0.8;
  });
  const past = dates.filter((d) => d < today), cutoff = past.at(-1) ?? today;
  const displayRoster = roster.active.map((p) => {
    // Only the three roster divisions may be overridden by a schedule trade.
    if (!(p.effectiveGroup === "業務" || /水深|地形|點工|ROV|外業|奇穎|圖報|控制|內業/.test(p.effectiveGroup))) return p;
    const top = [...(s.trades.get(p.name) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];
    return ["外業", "內業", "業務"].includes(top) ? { ...p, classification: top as PersonPolicy["classification"] } : p;
  });
  const rows = displayRoster.filter((p) => p.requiresPlanning).flatMap((p) => dates.map((day) => evaluateDay(p, day, s, l, attendance, today, cutoff)));
  const punchRows = displayRoster.flatMap((p) => dates.map((day) => {
    const result = rows.find((r) => r.name === p.name && r.date === day);
    const leave = result?.kind === "leave" || !!attendance.days[p.recordId]?.[day]?.leave;
    return evaluatePunch(p, day, attendance, today, leave);
  }));
  const summary = summarizeRange(displayRoster, rows);
  summary.punchMissing = new Set(punchRows.filter((r) => r.missing).map((r) => r.name)).size;
  return { roster: displayRoster, rows, punchRows, dates, cutoff, adminLatest: l.adminLatest, compatibility: attendance.compatibility, summary };
}
