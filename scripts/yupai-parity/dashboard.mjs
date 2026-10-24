import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { apiRead, pagedRead, pullTable, readSource, dateMs, iso, hash, costKeys } from './data.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const loaded = new Map();
export async function loadPure(name) {
  if (!['scheduleCheck', 'attendanceCore', 'week'].includes(name)) throw new Error('module-not-allowlisted');
  if (!loaded.has(name)) {
    const source = await readFile(path.join(root, 'lib', `${name}.ts`), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    const ast = ts.createSourceFile('pure.mjs', output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let runtimeImport = false;
    function visit(node) {
      if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier) || (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === 'require'))) runtimeImport = true;
      ts.forEachChild(node, visit);
    }
    visit(ast);
    if (runtimeImport) throw new Error(`pure-module-runtime-import:${name}`);
    loaded.set(name, import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`));
  }
  return loaded.get(name);
}
export async function fromRaw(raw, roster) {
  const core = await loadPure('attendanceCore');
  if (raw.complete !== true || !['employeeIds', 'groups', 'deptUsers', 'tasks', 'approvals'].every(k => raw.completeness?.[k] === true) || !roster.fields.some(f => f.name === 'Lark帳號')) throw new Error('incomplete-raw-attendance');
  if (!Array.isArray(raw.groups) || !Array.isArray(raw.tasks) || !Array.isArray(raw.approvals) || !raw.employeeIds || !raw.deptUsers) throw new Error('invalid-raw-attendance');
  const { people } = core.buildRoster(roster.records, { name: '姓名', group: '所屬組別', active: '在職', account: 'Lark帳號' });
  const employeeIds = new Map(Object.entries(raw.employeeIds));
  if (people.some(p => !employeeIds.has(p.openId))) throw new Error('incomplete-employee-map');
  const members = new Set();
  for (const g of raw.groups) {
    if (!['bindUsers', 'bindDepts', 'exceptUsers', 'exceptDepts'].every(k => Array.isArray(g[k])) || [...g.bindDepts, ...g.exceptDepts].some(d => !Array.isArray(raw.deptUsers[d]))) throw new Error('incomplete-group-expansion');
    for (const id of core.resolveMembers(g, new Map(Object.entries(raw.deptUsers)))) members.add(id);
  }
  const dates = core.weekDates(dateMs(raw.weekStart));
  const leaveByUser = core.approvalDaysByUser(raw.approvals, dates), punchByUser = core.punchedDays(raw.tasks, dates);
  const result = { status: 'ok', leave: {}, punch: {}, members: [] };
  for (const p of people) {
    const eid = employeeIds.get(p.openId);
    for (const rid of [p.recordId, ...(p.altRecordIds ?? [])].filter(Boolean)) {
      if (leaveByUser.has(eid)) result.leave[rid] = leaveByUser.get(eid);
      if (punchByUser.has(eid)) result.punch[rid] = [...punchByUser.get(eid)];
      if (members.has(eid)) result.members.push(rid);
    }
  }
  return result;
}
export async function readDaily(dir, monday, rosterSource, today) {
  const health = { key: `daily-${monday}`, path: path.resolve(dir, `daily-${monday}.json`), complete: false, errors: [], capturedAt: null, sha256: null };
  try {
    let bytes, data;
    try { bytes = await readFile(health.path); data = JSON.parse(bytes); }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      health.path = path.resolve(dir, `attendance-raw-${monday}.json`);
      bytes = await readFile(health.path); data = JSON.parse(bytes);
      // Raw snapshots may carry their own validated, projected account roster.
      let roster = rosterSource.table;
      if (data.accountRoster === 'roster-account') {
        const account = await readSource(dir, 'roster-account', { table: 'tblmlpA6nG5Ou7NQ', required: ['姓名', '所屬組別', '在職', 'Lark帳號'] });
        if (!account.health.complete) throw new Error('invalid-account-roster');
        roster = account.table;
      }
      data = { ...data, ...await fromRaw(data, roster) };
    }
    health.sha256 = hash(bytes); health.capturedAt = data.asOf ?? null;
    if (data.weekStart !== monday || data.complete !== true || !data.source || data.demo === true || data.status !== 'ok' || !data.asOf || !Number.isFinite(dateMs(data.asOf)) || iso(dateMs(data.asOf)) < today) throw new Error('invalid-daily-envelope');
    const ids = new Set(rosterSource.table.records.map(r => r.id));
    if (data.rosterSha256 !== rosterSource.health.sha256 && (!Array.isArray(data.rosterRecordIds) || JSON.stringify([...data.rosterRecordIds].sort()) !== JSON.stringify([...ids].sort()))) throw new Error('daily-roster-mismatch');
    if (!Array.isArray(data.members) || !data.punch || !data.leave || typeof data.punch !== 'object' || typeof data.leave !== 'object') throw new Error('missing-daily-fields');
    const core = await loadPure('attendanceCore'), dates = core.weekDates(dateMs(monday));
    for (const id of [...data.members, ...Object.keys(data.punch), ...Object.keys(data.leave)]) if (!ids.has(id)) throw new Error('daily-unknown-record-id');
    for (const ds of Object.values(data.punch)) if (!Array.isArray(ds) || ds.some(d => !dates.includes(d))) throw new Error('invalid-punch-days');
    for (const list of Object.values(data.leave)) if (!Array.isArray(list) || list.some(x => !dates.includes(x.date) || !['leave', 'trip', 'out'].includes(x.kind))) throw new Error('invalid-leave-days');
    health.complete = true;
    return { health, data: { status: 'ok', members: data.members, punch: data.punch, leave: data.leave } };
  } catch (e) {
    health.errors.push(e.code === 'ENOENT' ? 'missing-daily-snapshot' : e instanceof SyntaxError ? 'invalid-daily-json' : /^(incomplete|invalid|daily|missing)/.test(e.message) ? e.message : 'unreadable-daily-snapshot');
    return { health, data: null };
  }
}
export async function calculateDashboard({ roster, schedule, costs, daily, dates }) {
  const core = await loadPure('scheduleCheck'), attendance = await loadPure('attendanceCore');
  const people = roster.table ? core.parseRoster(roster.table) : [];
  const rows = [], coverage = [];
  for (const date of dates) {
    const ms = dateMs(date), day = core.taipeiDay(ms), monday = attendance.weekDates(ms)[0], response = daily[monday];
    const attendanceKnown = response?.health.complete === true;
    const d = response?.data;
    const planned = schedule.table ? core.scheduledPersonIds(schedule.table, ms, ms + 86400000) : new Set();
    const sources = costKeys.filter(k => costs[k].table).map(k => ({ data: costs[k].table, dateNames: ['工作日期'], personNames: k === 'v3-internal-cost' ? ['填報人'] : k === 'v3-admin-cost' ? ['填表人'] : ['組長', '實際出工人', '組員'] }));
    const logged = core.loggedPersonIds(sources, day), members = new Set(d?.members ?? []);
    const punched = new Set(Object.entries(d?.punch ?? {}).filter(([, ds]) => ds.includes(date)).map(([rid]) => rid));
    const leave = new Map();
    for (const [rid, list] of Object.entries(d?.leave ?? {})) { const hit = list.find(l => l.date === date); if (hit) leave.set(rid, hit.kind); }
    const complete = roster.health.complete && schedule.health.complete && costKeys.every(k => costs[k].health.complete) && attendanceKnown;
    const native = core.dailyStatus(people, planned, logged, punched, members, leave, { sched: schedule.health.complete, cost: costKeys.every(k => costs[k].health.complete) });
    // Evidence is calculated with the same functions on individual source records.
    const planEvidence = new Map(), costEvidence = new Map();
    for (const record of schedule.table?.records ?? []) for (const rid of core.scheduledPersonIds({ ...schedule.table, records: [record] }, ms, ms + 86400000)) { const a = planEvidence.get(rid) ?? []; a.push(record.id); planEvidence.set(rid, a); }
    for (const source of sources) for (const record of source.data.records) for (const rid of core.loggedPersonIds([{ ...source, data: { ...source.data, records: [record] } }], day)) { const a = costEvidence.get(rid) ?? []; a.push({ source: source.data.table.name, recordId: record.id }); costEvidence.set(rid, a); }
    for (const r of native) {
      const missingKnown = attendanceKnown && (!!r.leave || r.missing || (r.plannedKnown && r.loggedKnown));
      rows.push({ date, recordId: r.recordId, name: r.name, group: r.group, planned: r.plannedKnown ? r.planned : null, plannedKnown: r.plannedKnown,
        logged: r.loggedKnown ? r.logged : null, loggedKnown: r.loggedKnown, punched: attendanceKnown ? r.punched : null,
        member: attendanceKnown ? r.isMember : null, leave: attendanceKnown ? r.leave : null, attendanceKnown,
        missing: missingKnown ? r.missing : null, missingKnown, complete,
        failureScenarioMissing: attendanceKnown ? null : r.missing,
        evidence: { planning: planEvidence.get(r.recordId) ?? [], costs: costEvidence.get(r.recordId) ?? [] } });
    }
    coverage.push({ date, roster: roster.health.complete, schedule: schedule.health.complete, costs: Object.fromEntries(costKeys.map(k => [k, costs[k].health.complete])), attendance: attendanceKnown, complete });
  }
  return { rows, coverage };
}

// Fetch exactly the endpoint list used by attendance.ts, with the existing user identity.
// Denials leave DailyStatus unknown; they never trigger login, bot setup or scope changes.
export async function pullAttendance(dir, dates, today, originalRoster) {
  const accountSpec = { table: 'tblmlpA6nG5Ou7NQ', required: ['姓名', '所屬組別', '在職', 'Lark帳號'] };
  await pullTable(dir, 'roster-account', accountSpec);
  const account = await readSource(dir, 'roster-account', accountSpec);
  if (!account.health.complete) throw new Error('invalid-account-roster');
  // A newer roster cannot silently replace the shared identity universe.
  const original = new Map(originalRoster.table.records.map(r => [r.id, r.fields]));
  if (account.table.records.length !== original.size || account.table.records.some(r => !original.has(r.id) || ['姓名', '所屬組別', '在職'].some(k => JSON.stringify(r.fields[k]) !== JSON.stringify(original.get(r.id)[k])))) throw new Error('daily-roster-mismatch');
  const core = await loadPure('attendanceCore');
  const { people } = core.buildRoster(account.table.records, { name: '姓名', group: '所屬組別', active: '在職', account: 'Lark帳號' });
  const employeeIds = {};
  for (let i = 0; i < people.length; i += 50) {
    const d = await apiRead('GET', '/contact/v3/users/batch', { user_ids: people.slice(i, i + 50).map(p => p.openId), user_id_type: 'open_id' });
    if (!Array.isArray(d.items)) throw new Error('incomplete-employee-map');
    for (const u of d.items) if (u.open_id && u.user_id) employeeIds[u.open_id] = String(u.user_id);
  }
  if (people.some(p => !employeeIds[p.openId])) throw new Error('incomplete-employee-map');
  const groups = [];
  for (const g of await pagedRead('/attendance/v1/groups', {}, d => d.group_list)) {
    const d = await apiRead('GET', `/attendance/v1/groups/${encodeURIComponent(g.group_id)}`, { employee_type: 'employee_id', dept_type: 'open_id' });
    const x = d.group ?? d;
    if (!x.group_id) throw new Error('invalid-group-detail');
    groups.push({ bindUsers: x.bind_user_ids ?? [], bindDepts: x.bind_dept_ids ?? [], exceptUsers: x.except_user_ids ?? [], exceptDepts: x.except_dept_ids ?? [] });
  }
  const deptUsers = {};
  for (const dept of new Set(groups.flatMap(g => [...g.bindDepts, ...g.exceptDepts]))) {
    const children = await pagedRead(`/contact/v3/departments/${encodeURIComponent(dept)}/children`, { department_id_type: 'open_department_id', fetch_child: true }, d => d.items);
    const members = new Set();
    for (const id of [dept, ...children.map(x => x.open_department_id)]) for (const u of await pagedRead('/contact/v3/users/find_by_department', { department_id: id, department_id_type: 'open_department_id', user_id_type: 'user_id' }, d => d.items)) { if (!u.user_id) throw new Error('incomplete-department-user'); members.add(String(u.user_id)); }
    deptUsers[dept] = [...members];
  }
  const all = people.map(p => employeeIds[p.openId]), members = new Set();
  for (const g of groups) for (const id of core.resolveMembers(g, new Map(Object.entries(deptUsers)))) members.add(id);
  for (const monday of new Set(dates.map(d => core.weekDates(dateMs(d))[0]))) {
    const week = core.weekDates(dateMs(monday)), last = week[6] < today ? week[6] : today;
    const tasks = [], approvals = [];
    const memberIds = all.filter(id => members.has(id));
    for (let i = 0; i < memberIds.length && monday <= last; i += 50) {
      const d = await apiRead('POST', '/attendance/v1/user_tasks/query', { employee_type: 'employee_id' }, { user_ids: memberIds.slice(i, i + 50), check_date_from: core.ymdInt(monday), check_date_to: core.ymdInt(last), ignore_invalid_users: true });
      if (!Array.isArray(d.user_task_results) || d.invalid_user_ids?.length || d.unauthorized_user_ids?.length || d.has_more === true) throw new Error('incomplete-attendance-tasks');
      tasks.push(...d.user_task_results);
    }
    for (let i = 0; i < all.length; i += 50) {
      const d = await apiRead('POST', '/attendance/v1/user_approvals/query', { employee_type: 'employee_id' }, { user_ids: all.slice(i, i + 50), check_date_from: core.ymdInt(monday), check_date_to: core.ymdInt(week[6]) });
      if (!Array.isArray(d.user_approvals) || d.has_more === true) throw new Error('incomplete-attendance-approvals');
      approvals.push(...d.user_approvals);
    }
    const raw = { complete: true, completeness: Object.fromEntries(['employeeIds', 'groups', 'deptUsers', 'tasks', 'approvals'].map(k => [k, true])), weekStart: monday, groups, deptUsers, employeeIds, tasks, approvals };
    const response = await fromRaw(raw, account.table);
    await writeFile(path.join(dir, `daily-${monday}.json`), JSON.stringify({ ...response, weekStart: monday, asOf: new Date().toISOString(), complete: true, source: 'existing lark-cli user identity; attendance.ts endpoint allowlist', rosterSha256: originalRoster.health.sha256 }), { mode: 0o600 });
  }
}
