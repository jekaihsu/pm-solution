// R04 出勤／出差：從 Lark 假勤抓資料（唯讀、tenant_access_token）。純函式與型別在 attendanceCore.ts。
// 快取只在記憶體：對照與考勤組 24 小時、本週 5 分鐘、過去週 6 小時；權限沒開／失敗只短暫快取，避免每次開頁都打 Lark。
import "server-only";
import { LarkApiError, getSourceData, larkReadApi } from "./lark";
import { PEOPLE_ACCOUNT, PEOPLE_ACTIVE, PEOPLE_GROUP, PEOPLE_NAME } from "./people";
import { sourceByKey } from "./reports";
import {
  approvalDaysByUser,
  punchedDays,
  attendanceErrorText,
  attendanceTtl,
  buildAttendanceView,
  buildRoster,
  fieldCostError,
  fieldCostWarning,
  mapPool,
  parseFieldCost,
  parseMissingScopes,
  resolveMembers,
  taipeiDate,
  weekDates,
  ymdInt,
  type ApprovalKind,
  type AttendanceResponse,
  type FieldCostInput,
  type LarkUserApprovals,
  type LarkUserTask,
  type RosterPerson,
  type RosterRow,
} from "./attendanceCore";

const LIMIT = 3; // 同時請求數
const H = 3600000;
const SCOPE_RANGE = "通訊錄權限範圍（需設為全部成員）";
const SCOPES = {
  contact: ["contact:contact.base:readonly", "contact:user.employee_id:readonly"],
  rule: ["attendance:rule:readonly"],
  task: ["attendance:task:readonly"],
};

const shared = globalThis as typeof globalThis & {
  __pmAttendance?: { cache: Map<string, { value: unknown; expiresAt: number }>; inflight: Map<string, Promise<unknown>> };
};
const store = (shared.__pmAttendance ??= { cache: new Map(), inflight: new Map() });

async function memo<T>(key: string, ttl: (v: T) => number, fn: () => Promise<T>, force = false): Promise<T> {
  const hit = store.cache.get(key);
  if (!force && hit && hit.expiresAt > Date.now()) return hit.value as T;
  let p = store.inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fn()
      .then((v) => {
        store.cache.set(key, { value: v, expiresAt: Date.now() + ttl(v) });
        return v;
      })
      .finally(() => store.inflight.delete(key));
    store.inflight.set(key, p);
  }
  return p;
}

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function pages<T>(path: string, query: Record<string, string>, pick: (d: any) => T[]): Promise<T[]> {
  const out: T[] = [];
  let token: string | undefined;
  do {
    const d: any = await larkReadApi("GET", path, { query: { ...query, page_size: "50", ...(token ? { page_token: token } : {}) } });
    out.push(...pick(d));
    token = d?.has_more ? d.page_token : undefined;
  } while (token);
  return out;
}

// open_id → employee_id（Lark 回的 user_id）。只存對照、24 小時；缺的才補查。
async function employeeIdMap(openIds: string[], force: boolean): Promise<Map<string, string>> {
  const map = await memo("att:empmap", () => 24 * H, async () => new Map<string, string>(), force);
  const missing = openIds.filter((id) => !map.has(id));
  let returned = 0, withId = 0;
  await mapPool(chunk(missing, 50), LIMIT, async (batch) => {
    const d: any = await larkReadApi("GET", "/contact/v3/users/batch", { query: { user_ids: batch, user_id_type: "open_id" } });
    for (const u of d?.items ?? []) {
      returned++;
      if (u?.open_id && u?.user_id) {
        map.set(String(u.open_id), String(u.user_id));
        withId++;
      }
    }
  });
  if (missing.length && returned === 0) throw new LarkApiError("通訊錄查不到任何人", 41050, "no users returned", []);
  if (returned > 0 && withId === 0) throw new LarkApiError("通訊錄沒有回 employee_id", 99991672, "", ["contact:user.employee_id:readonly"]);
  return map;
}

// 部門（含全部子部門）底下的人 employee_id。
// 考勤組成員集合是以 employee_id 比對（group detail 用 employee_type=employee_id 回 bind_user_ids，
// buildAttendanceView 也以 employee_id 判 isMember），所以這裡必須取 user_id（＝Lark 的 employee_id），
// 不能用 open_id — 否則用部門綁定加入考勤組的人（非逐一綁定）會以 open_id 進集合、永遠對不上
// employee_id 的比對而被判為「不在考勤組」，整列從 R04 消失。
async function deptUsers(dept: string): Promise<string[]> {
  const ids = [dept];
  const kids = await pages<any>(`/contact/v3/departments/${encodeURIComponent(dept)}/children`, { department_id_type: "open_department_id", fetch_child: "true" }, (d) => d?.items ?? []);
  for (const k of kids) if (k?.open_department_id) ids.push(String(k.open_department_id));
  const out = new Set<string>();
  await mapPool(ids, LIMIT, async (id) => {
    const us = await pages<any>("/contact/v3/users/find_by_department", { department_id: id, department_id_type: "open_department_id", user_id_type: "user_id" }, (d) => d?.items ?? []);
    for (const u of us) if (u?.user_id) out.add(String(u.user_id));
  });
  return [...out];
}

// 全部考勤組的成員（不寫死 ID）。
async function groupMembers(force: boolean): Promise<{ members: Set<string>; groupCount: number }> {
  return memo(
    "att:members",
    () => 24 * H,
    async () => {
      const list = await pages<any>("/attendance/v1/groups", {}, (d) => d?.group_list ?? []);
      const defs = [];
      for (const g of list) {
        const d: any = await larkReadApi("GET", `/attendance/v1/groups/${encodeURIComponent(String(g.group_id))}`, { query: { employee_type: "employee_id", dept_type: "open_id" } });
        const x = d?.group ?? d ?? {};
        const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
        defs.push({ bindUsers: arr(x.bind_user_ids), bindDepts: arr(x.bind_dept_ids), exceptUsers: arr(x.except_user_ids), exceptDepts: arr(x.except_dept_ids) });
      }
      const depts = [...new Set(defs.flatMap((g) => [...g.bindDepts, ...g.exceptDepts]))];
      const byDept = new Map<string, string[]>();
      await mapPool(depts, LIMIT, async (d) => void byDept.set(d, await deptUsers(d)));
      const members = new Set<string>();
      for (const g of defs) for (const m of resolveMembers(g, byDept)) members.add(m);
      return { members, groupCount: list.length };
    },
    force,
  );
}

const range = (from: string, to: string) => ({ check_date_from: ymdInt(from), check_date_to: ymdInt(to) });

async function queryTasks(ids: string[], from: string, to: string) {
  const tasks: LarkUserTask[] = [];
  let invalid = 0;
  await mapPool(chunk(ids, 50), LIMIT, async (batch) => {
    const d: any = await larkReadApi("POST", "/attendance/v1/user_tasks/query", {
      query: { employee_type: "employee_id" },
      body: { user_ids: batch, ...range(from, to), ignore_invalid_users: true },
    });
    tasks.push(...(d?.user_task_results ?? []));
    invalid += (d?.invalid_user_ids?.length ?? 0) + (d?.unauthorized_user_ids?.length ?? 0);
  });
  return { tasks, invalid };
}

async function queryApprovals(ids: string[], from: string, to: string) {
  const out: LarkUserApprovals[] = [];
  await mapPool(chunk(ids, 50), LIMIT, async (batch) => {
    const d: any = await larkReadApi("POST", "/attendance/v1/user_approvals/query", { query: { employee_type: "employee_id" }, body: { user_ids: batch, ...range(from, to) } });
    out.push(...(d?.user_approvals ?? []));
  });
  return out;
}

type Perm = { missing: Set<string>; other?: Error };
function absorb(p: Perm, err: unknown, fallback: string[]) {
  if (err instanceof LarkApiError && err.code === 99991672) parseMissingScopes({ msg: err.larkMsg, violations: err.violations }).concat(!err.violations.length && !/\[/.test(err.larkMsg) ? fallback : []).forEach((s) => p.missing.add(s));
  else if (err instanceof LarkApiError && (err.code === 41050 || err.code === 40004)) p.missing.add(SCOPE_RANGE);
  else p.other ??= err as Error;
}

// 外業成本單（V3）：只取 工作日期、組長、實際出工人（欄位優先用 field id）。失敗只留固定文案＋錯誤碼，不外洩路徑或 token。
async function fieldCost(dates: string[], force: boolean): Promise<FieldCostInput> {
  const src = sourceByKey("v3-field-cost");
  if (!src) return { rows: [], error: "找不到外業成本單來源" };
  try {
    return parseFieldCost(await getSourceData(src, force), dates);
  } catch (e) {
    return { rows: [], error: fieldCostError(e) };
  }
}

async function compute(weekStart: number, now: number, force: boolean): Promise<AttendanceResponse> {
  const dates = weekDates(weekStart);
  const today = taipeiDate(now);
  const rosterSrc = sourceByKey("v3-people");
  if (!rosterSrc) return { status: "error", error: "找不到人員名單來源" };
  const rows = (await getSourceData(rosterSrc)).records as unknown as RosterRow[];
  const fieldCostP = fieldCost(dates, force);
  const { people: roster, noAccountPeople, inService, noAccount, merged } = buildRoster(rows, { name: PEOPLE_NAME, group: PEOPLE_GROUP, active: PEOPLE_ACTIVE, account: PEOPLE_ACCOUNT });

  const perm: Perm = { missing: new Set() };
  const [em, gm] = await Promise.allSettled([employeeIdMap(roster.map((r: RosterPerson) => r.openId), force), groupMembers(force)]);
  if (em.status === "rejected") absorb(perm, em.reason, SCOPES.contact);
  if (gm.status === "rejected") absorb(perm, gm.reason, [...SCOPES.rule, ...SCOPES.contact]);
  if (perm.missing.size) {
    // 把還沒確認的假勤查詢權限也一併探測，讓管理員一次開齊。
    try {
      await larkReadApi("POST", "/attendance/v1/user_tasks/query", { query: { employee_type: "employee_id" }, body: { user_ids: ["probe"], ...range(today, today), ignore_invalid_users: true } });
    } catch (e) {
      absorb(perm, e, SCOPES.task);
    }
    return { status: "needs-permission", missing: [...perm.missing], hint: "請管理員在 PM週報 開發者後台開通上列權限並發布新版本；通訊錄權限範圍需設為全部成員。" };
  }
  if (perm.other) return { status: "error", error: attendanceErrorText(perm.other) };
  const employeeIds = (em as PromiseFulfilledResult<Map<string, string>>).value;
  const { members, groupCount } = (gm as PromiseFulfilledResult<{ members: Set<string>; groupCount: number }>).value;

  const allIds = roster.map((r: RosterPerson) => employeeIds.get(r.openId)).filter((x): x is string => !!x);
  const memberIds = allIds.filter((x) => members.has(x));
  const last = dates[6] < today ? dates[6] : today; // 未過完的週只查到今天
  try {
    const [t, approvals] = await Promise.all([
      dates[0] > today || !memberIds.length ? Promise.resolve({ tasks: [], invalid: 0 }) : queryTasks(memberIds, dates[0], last),
      queryApprovals(allIds, dates[0], dates[6]),
    ]);
    const view = buildAttendanceView({ weekStart, now, roster, noAccountPeople, employeeIds, members, tasks: t.tasks, approvals, notes: { rosterInService: inService, noAccount, groupCount, invalidIds: t.invalid, ...(merged ? { rosterShared: merged } : {}) }, fieldCost: await fieldCostP });
    if (fieldCostWarning(view)) console.warn(`[attendance] 外業成本單可能沒讀完整 error=${view.notes.fieldError ?? "-"} sheets=${view.notes.fieldSheets} emptyLinks=${view.notes.fieldEmptyLinks} incomplete=${view.notes.fieldIncomplete ?? false} allEmpty=${view.notes.fieldAllEmpty} noDate=${view.notes.fieldNoDate} matched=${view.notes.fieldMatched} unmatched=${view.notes.fieldUnmatched}`);
    return view;
  } catch (e) {
    absorb(perm, e, SCOPES.task);
    if (perm.missing.size) return { status: "needs-permission", missing: [...perm.missing], hint: "請管理員在 PM週報 開發者後台開通上列權限並發布新版本。" };
    return { status: "error", error: attendanceErrorText(e) };
  }
}

// 「已請假＝正常」用：所選週內每位同事（人員名單 record_id，含同人多列的別名）請假／出差／外出的日子。
// 給 R09／R10 把「有排未填／有排未做」自動判為正常。只回 record_id 與日期（非個資），經 HR 守門。
export interface LeaveDaysResponse {
  status: "ok" | "needs-permission" | "error" | "not-connected";
  missing?: string[];
  hint?: string;
  error?: string;
  // 人員名單 record_id → 當週請假／出差／外出的日子（YYYY-MM-DD）
  days?: Record<string, { date: string; kind: ApprovalKind }[]>;
  // 自訂區間超過 now+60d 上限，結束被夾到上限、只抓到上限那一週（route 設定，UI 用來提示）。
  rangeClamped?: boolean;
}

async function computeLeaveDays(weekStart: number, force: boolean): Promise<LeaveDaysResponse> {
  const dates = weekDates(weekStart);
  const rosterSrc = sourceByKey("v3-people");
  if (!rosterSrc) return { status: "error", error: "找不到人員名單來源" };
  const rows = (await getSourceData(rosterSrc)).records as unknown as RosterRow[];
  const { people } = buildRoster(rows, { name: PEOPLE_NAME, group: PEOPLE_GROUP, active: PEOPLE_ACTIVE, account: PEOPLE_ACCOUNT });
  const perm: Perm = { missing: new Set() };
  let employeeIds: Map<string, string>;
  try {
    employeeIds = await employeeIdMap(people.map((r) => r.openId), force);
  } catch (e) {
    absorb(perm, e, SCOPES.contact);
    if (perm.missing.size) return { status: "needs-permission", missing: [...perm.missing], hint: "請管理員在 PM週報 開通假勤與通訊錄唯讀權限並發布新版本。" };
    return { status: "error", error: attendanceErrorText(e) };
  }
  const allIds = people.map((r) => employeeIds.get(r.openId)).filter((x): x is string => !!x);
  let byUser: Map<string, { date: string; kind: ApprovalKind }[]>;
  try {
    byUser = approvalDaysByUser(await queryApprovals(allIds, dates[0], dates[6]), dates);
  } catch (e) {
    absorb(perm, e, SCOPES.task);
    if (perm.missing.size) return { status: "needs-permission", missing: [...perm.missing], hint: "請管理員在 PM週報 開通假勤唯讀權限並發布新版本。" };
    return { status: "error", error: attendanceErrorText(e) };
  }
  const days: Record<string, { date: string; kind: ApprovalKind }[]> = {};
  for (const p of people) {
    const eid = employeeIds.get(p.openId);
    const d = eid ? byUser.get(eid) : undefined;
    if (!d) continue;
    for (const rid of [p.recordId, ...(p.altRecordIds ?? [])]) if (rid) days[rid] = d;
  }
  return { status: "ok", days };
}

// The Taipei Monday (epoch ms) of the Mon–Sun week containing `ms`.
const mondayOf = (ms: number) => Date.parse(`${weekDates(ms)[0]}T00:00:00+08:00`);

async function fetchLeaveWeek(monday: number, now: number, force: boolean): Promise<LeaveDaysResponse> {
  const isCurrent = weekDates(monday).includes(taipeiDate(now)) && taipeiDate(now) <= weekDates(monday)[6];
  const ttl = (v: LeaveDaysResponse) => (v.status === "ok" ? (isCurrent ? 5 * 60000 : 6 * 3600000) : 60000);
  return memo(`att:leave:${monday}`, ttl, () => computeLeaveDays(monday, force), force);
}

// 請假／出差／外出的日子。自訂日期區間（R09／R10）可跨多週：以 `end`（exclusive ms）決定
// 要抓哪幾個週一～週日的週，逐週抓（各自快取）後合併，否則只有起始週的請假會被讀到。
export async function getLeaveDays(weekStart: number, opts: { force?: boolean; now?: number; end?: number } = {}): Promise<LeaveDaysResponse> {
  const now = opts.now ?? Date.now();
  try {
    const first = mondayOf(weekStart);
    const last = opts.end && opts.end > weekStart ? mondayOf(opts.end - 1) : first;
    const mondays: number[] = [];
    for (let m = first; m <= last; m += 7 * 86400000) mondays.push(m);
    const results = await Promise.all(mondays.map((m) => fetchLeaveWeek(m, now, !!opts.force)));
    const bad = results.find((r) => r.status !== "ok");
    if (bad) return bad;
    const days: Record<string, { date: string; kind: ApprovalKind }[]> = {};
    for (const r of results) for (const [rid, list] of Object.entries(r.days ?? {})) (days[rid] ??= []).push(...list);
    return { status: "ok", days };
  } catch (e) {
    return { status: "error", error: attendanceErrorText(e) };
  }
}

// 每日檢查（item 3）：所選週內每位同事（人員名單 record_id）的請假／出差／外出、有效打卡日，與是否為考勤組成員。
// 只回 record_id 與日期（非個資），經 HR 守門。
export interface DailyStatusResponse {
  status: "ok" | "needs-permission" | "error" | "not-connected";
  missing?: string[];
  hint?: string;
  error?: string;
  leave?: Record<string, { date: string; kind: ApprovalKind }[]>; // record_id → 請假／出差／外出日
  punch?: Record<string, string[]>; // record_id → 有有效打卡的日子
  members?: string[]; // 屬於考勤組的 record_id（會打卡；其餘為外業／不打卡）
}

async function computeDailyStatus(weekStart: number, now: number, force: boolean): Promise<DailyStatusResponse> {
  const dates = weekDates(weekStart);
  const today = taipeiDate(now);
  const rosterSrc = sourceByKey("v3-people");
  if (!rosterSrc) return { status: "error", error: "找不到人員名單來源" };
  const rows = (await getSourceData(rosterSrc)).records as unknown as RosterRow[];
  const { people } = buildRoster(rows, { name: PEOPLE_NAME, group: PEOPLE_GROUP, active: PEOPLE_ACTIVE, account: PEOPLE_ACCOUNT });

  const perm: Perm = { missing: new Set() };
  const [em, gm] = await Promise.allSettled([employeeIdMap(people.map((r) => r.openId), force), groupMembers(force)]);
  if (em.status === "rejected") absorb(perm, em.reason, SCOPES.contact);
  if (gm.status === "rejected") absorb(perm, gm.reason, [...SCOPES.rule, ...SCOPES.contact]);
  if (perm.missing.size) return { status: "needs-permission", missing: [...perm.missing], hint: "請管理員在 PM週報 開通假勤與通訊錄唯讀權限並發布新版本。" };
  if (perm.other) return { status: "error", error: attendanceErrorText(perm.other) };
  const employeeIds = (em as PromiseFulfilledResult<Map<string, string>>).value;
  const { members } = (gm as PromiseFulfilledResult<{ members: Set<string>; groupCount: number }>).value;

  const allIds = people.map((r) => employeeIds.get(r.openId)).filter((x): x is string => !!x);
  const memberIds = allIds.filter((x) => members.has(x));
  const last = dates[6] < today ? dates[6] : today;
  let leaveByUser: Map<string, { date: string; kind: ApprovalKind }[]>;
  let punchByUser: Map<string, Set<string>>;
  try {
    const [t, approvals] = await Promise.all([
      dates[0] > today || !memberIds.length ? Promise.resolve({ tasks: [] as LarkUserTask[], invalid: 0 }) : queryTasks(memberIds, dates[0], last),
      queryApprovals(allIds, dates[0], dates[6]),
    ]);
    leaveByUser = approvalDaysByUser(approvals, dates);
    punchByUser = punchedDays(t.tasks, dates);
  } catch (e) {
    absorb(perm, e, SCOPES.task);
    if (perm.missing.size) return { status: "needs-permission", missing: [...perm.missing], hint: "請管理員在 PM週報 開通假勤唯讀權限並發布新版本。" };
    return { status: "error", error: attendanceErrorText(e) };
  }
  const leave: Record<string, { date: string; kind: ApprovalKind }[]> = {};
  const punch: Record<string, string[]> = {};
  const memberRids: string[] = [];
  for (const p of people) {
    const eid = employeeIds.get(p.openId);
    if (!eid) continue;
    const rids = [p.recordId, ...(p.altRecordIds ?? [])].filter((x): x is string => !!x);
    const lv = leaveByUser.get(eid);
    const pu = punchByUser.get(eid);
    for (const rid of rids) {
      if (lv) leave[rid] = lv;
      if (pu) punch[rid] = [...pu];
      if (members.has(eid)) memberRids.push(rid);
    }
  }
  return { status: "ok", leave, punch, members: memberRids };
}

export async function getDailyStatus(weekStart: number, opts: { force?: boolean; now?: number } = {}): Promise<DailyStatusResponse> {
  const now = opts.now ?? Date.now();
  const monday = Date.parse(`${weekDates(weekStart)[0]}T00:00:00+08:00`);
  const isCurrent = weekDates(monday).includes(taipeiDate(now)) && taipeiDate(now) <= weekDates(monday)[6];
  const ttl = (v: DailyStatusResponse) => (v.status === "ok" ? (isCurrent ? 5 * 60000 : 6 * 3600000) : 60000);
  try {
    return await memo(`att:daily:${monday}`, ttl, () => computeDailyStatus(monday, now, !!opts.force), opts.force);
  } catch (e) {
    return { status: "error", error: attendanceErrorText(e) };
  }
}

export async function getAttendance(weekStart: number, opts: { force?: boolean; now?: number } = {}): Promise<AttendanceResponse> {
  const now = opts.now ?? Date.now();
  const monday = Date.parse(`${weekDates(weekStart)[0]}T00:00:00+08:00`);
  const isCurrent = weekDates(monday).includes(taipeiDate(now)) && taipeiDate(now) <= weekDates(monday)[6];
  // 失敗、權限沒開、外業成本單可能沒讀完整：只快取 1 分鐘，下次開頁會重讀
  const ttl = (v: AttendanceResponse) => attendanceTtl(v, isCurrent);
  try {
    return await memo(`att:week:${monday}`, ttl, () => compute(monday, now, !!opts.force), opts.force);
  } catch (e) {
    return { status: "error", error: attendanceErrorText(e) };
  }
}
