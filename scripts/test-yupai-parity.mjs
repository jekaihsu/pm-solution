import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { specs, readSource, dateMs, cliRead, runFile, pullTable, prepareSnapshot } from './yupai-parity/data.mjs';
import { loadPure, calculateDashboard, readDaily, fromRaw } from './yupai-parity/dashboard.mjs';
import { compare, renderText } from './yupai-parity/diff.mjs';
import { parseArgs } from './yupai-parity/cli.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(root, 'scripts/yupai-parity/cli.mjs');
const referenceAdapter = path.join(root, 'scripts/yupai-parity/reference.py');
const tmp = () => mkdtemp(path.join(os.tmpdir(), 'yupai-parity-test-'));
const sf = { '開始日期': { field_id: 'fldMXOggGP', field_type: 'datetime' }, '結束日期': { field_id: 'fldjWv1xST', field_type: 'datetime' }, '人員': { field_id: 'fld7KNCsVe', field_type: 'link' }, '條類型': { field_id: 'fld78OmLVn', field_type: 'select' }, '業別': { field_id: 'fldtrade', field_type: 'select' }, '組別': { field_id: 'fldgroup', field_type: 'select' } };
function schema(key) {
  return Object.fromEntries(['record_id', ...specs[key].required, ...(specs[key].persons ?? [])].map((n, i) => [n, n === 'record_id' ? {} : sf[n] && key === 'preschedule_all' ? sf[n] : { field_id: `fld${i}`, field_type: n === '工作日期' || n === '出工日期' || n === '日期' || /[开结]始时间|结束时间/.test(n) ? 'datetime' : specs[key].persons?.includes(n) ? 'link' : n === '在職' ? 'checkbox' : 'text' }]));
}
async function source(dir, key, rows = [], columns = schema(key), overrides = {}) {
  await writeFile(path.join(dir, `${key}.ndjson`), rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  await writeFile(path.join(dir, `${key}.manifest.json`), JSON.stringify({ table_id: specs[key].table, has_more: false, records_count: rows.length, columns, query_context: { record_scope: 'all_records' }, ...overrides }));
  return readSource(dir, key);
}
const person = (id = 'recA', name = '甲') => ({ record_id: id, 姓名: name, 在職: true, 所屬組別: ['控制'], 職級: ['同仁'] });
async function dailyFile(dir, roster, extra = {}) {
  const d = { status: 'ok', weekStart: '2026-10-12', asOf: '2026-10-20T12:00:00+08:00', source: 'synthetic test', complete: true, rosterSha256: roster.health.sha256, members: [], punch: {}, leave: {}, ...extra };
  await writeFile(path.join(dir, `daily-${d.weekStart}.json`), JSON.stringify(d));
  return readDaily(dir, d.weekStart, roster, '2026-10-20');
}
async function fixture(dir, { missingCost = false } = {}) {
  const roster = await source(dir, 'roster', [person(), person('recB', '乙')]);
  const schedule = await source(dir, 'preschedule_all', [{ record_id: 'recS', 開始日期: '2026-10-12', 結束日期: '2026-10-12', 人員: [{ id: 'recA' }, { id: 'recB' }], 條類型: ['出工'] }]);
  for (const k of ['waiye', 'neiye', 'xingzheng', 'attendance_oct', 'leave_oct']) await source(dir, k);
  const costs = {};
  for (const key of ['v3-internal-cost', 'v3-field-cost', 'v3-admin-cost']) costs[key] = key === 'v3-admin-cost' && missingCost ? await readSource(dir, key) : await source(dir, key, key === 'v3-internal-cost' ? [{ record_id: 'recC', 工作日期: '2026-10-12', 填報人: [{ id: 'recA' }] }] : []);
  return { roster, schedule, costs };
}
async function fakeReference(dir, { difference = false, unsafe = false } = {}) {
  const file = path.join(dir, 'fake_reference.py');
  await writeFile(file, `import datetime\nDATA_DIR = ''\nNAME_ALIAS = {'異體':'乙'}\nEXCLUDE_NAMES = set()\nEXCLUDE_LEVELS = set()\nSCOPE_DIVISIONS = ('內業',)\ndef norm(n): return NAME_ALIAS.get((n or '').strip(), (n or '').strip())\ndef load_ndjson(p):\n import json\n return [json.loads(x) for x in open(p) if x.strip()]\ndef serial_to_date(v): return None\ndef main(): raise RuntimeError('main must not execute')\ndef pull_all(*a): raise RuntimeError('pull must not execute')\ndef build_report(*a): raise RuntimeError('report must not execute')\ndef build_spotlight(*a): raise RuntimeError('spotlight must not execute')\ndef record_history(*a): raise RuntimeError('history must not execute')\ndef create_docx(*a): raise RuntimeError('docs must not execute')\ndef overwrite_docx(*a): raise RuntimeError('docs must not execute')\nclass Analysis:\n def __init__(self,start,end,today):\n  from collections import defaultdict\n  self.start,self.end,self.today=start,end,today\n  self.roster=load_ndjson(DATA_DIR+'/roster.ndjson')\n  self.id2name={r['record_id']:r['姓名'] for r in self.roster}\n  self.active=set(self.id2name.values());self.level={};self.grp={}\n  self.scope={'甲','乙'};self.no_signal=set();self.holidays=set()\n  self.workdays=[start+datetime.timedelta(days=i) for i in range((end-start).days+1) if (start+datetime.timedelta(days=i)).weekday()<5]\n  self.log_due_cutoff=today\n  self.presch=defaultdict(dict);self.log=defaultdict(set)\n  for n in self.scope:\n   for d in self.workdays:\n    self.presch[n,d.isoformat()]={'出工':1}\n    if n=='甲':self.log[n,d.isoformat()]={'內業'}\n def biz_of(self,n):return '內業'\n def worked_att(self,n,d):return True\n def evaluate(self,n):\n  return ('內業', n=='乙', [{'date':d.isoformat(),'pre':'${difference ? '未排' : '排'}','log':'填' if n=='甲' else '未填','kind':'work','leave':None,'pend':None} for d in self.workdays])\n${unsafe ? "open(DATA_DIR+'/forbidden', 'w').write('x')" : ''}\n`);
  return file;
}
function run(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30000, env: { ...process.env, ...env } });
}

test('date validation, fixed defaults and help need no cache or CLI', () => {
  assert.equal(parseArgs([]).today, '2026-10-20');
  assert.throws(() => parseArgs(['--start', '2026-02-30']));
  assert.throws(() => parseArgs(['--start', '2026-10-21']));
  assert.throws(() => parseArgs(['--pull']));
  assert.throws(() => parseArgs(['--wat']));
  assert.equal(dateMs('2026-10-12'), dateMs('2026-10-12T00:00:00+08:00'));
  assert.equal(dateMs(1234567890000), 1234567890000);
  assert.throws(() => dateMs('2026-10-12T00:00:00'));
  const r = run(['--help', '--data-dir', '/does-not-exist'], { PATH: '/invalid' });
  assert.equal(r.status, 0); assert.match(r.stdout, /Exit:/);
  assert.equal(run(['--start', 'bad', '--format', 'json']).status, 3);
});

test('manifest completeness, schema, bad dates, links and empty tables', async t => {
  const dir = await tmp(); t.after(() => rm(dir, { recursive: true, force: true }));
  assert.equal((await source(dir, 'v3-internal-cost')).health.complete, true);
  assert.equal((await source(dir, 'v3-internal-cost', [], undefined, { has_more: true })).health.complete, false);
  assert.equal((await source(dir, 'roster', [], undefined, { records_count: 2 })).table, null);
  assert.equal((await source(dir, 'roster', [], undefined, { table_id: 'tblWrong' })).table, null);
  assert.equal((await source(dir, 'roster', [], {})).table, null);
  await rm(path.join(dir, 'roster.manifest.json'));
  assert.equal((await readSource(dir, 'roster')).health.complete, false);
  assert.equal((await source(dir, 'v3-admin-cost', [{ record_id: 'recBad', 工作日期: '2026-02-30', 填表人: [] }])).table, null);
  assert.equal((await source(dir, 'v3-admin-cost', [{ record_id: 'recBad', 工作日期: '2026-10-12', 填表人: ['甲'] }])).table, null);
  await source(dir, 'roster'); await writeFile(path.join(dir, 'roster.ndjson'), '{bad');
  assert.equal((await readSource(dir, 'roster')).health.errors[0], 'invalid-json');
});

test('real TS planning uses field IDs, Taipei boundaries, multiple links and nonleave kinds', async t => {
  const dir = await tmp(); t.after(() => rm(dir, { recursive: true, force: true }));
  const columns = { ...sf, 開始日期: sf['結束日期'], 結束日期: sf['開始日期'] };
  const s = await source(dir, 'preschedule_all', [
    { record_id: 'rec1', 結束日期: '2026-10-16T23:59:00+08:00', 開始日期: '2026-10-19T00:00:00+08:00', 人員: [{ id: 'recA' }, { id: 'recB' }], 條類型: ['特殊'] },
    { record_id: 'rec2', 結束日期: '2026-10-17', 人員: [{ id: 'recA' }], 條類型: ['出工'] },
    { record_id: 'rec3', 結束日期: '2026-10-17', 人員: [{ id: 'recC' }], 條類型: ['休假'] },
    { record_id: 'rec4', 結束日期: '2026-10-17', 人員: [{ id: 'recD' }], 條類型: ['請假'] },
  ], columns);
  const core = await loadPure('scheduleCheck');
  for (const day of ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19']) assert.deepEqual([...core.scheduledPersonIds(s.table, dateMs(day), dateMs(day) + 86400000)].sort(), ['recA', 'recB']);
  assert.equal(core.scheduledPersonIds(s.table, dateMs('2026-10-20'), dateMs('2026-10-21')).size, 0);
});

test('cost sources: leader, old crew column, known-positive on partial failure, no fake missing', async t => {
  const dir = await tmp(); t.after(() => rm(dir, { recursive: true, force: true }));
  const f = await fixture(dir, { missingCost: true });
  f.costs['v3-field-cost'] = await source(dir, 'v3-field-cost', [{ record_id: 'recField', 工作日期: '2026-10-12', 組長: [{ id: 'recB' }], 組員: [{ id: 'recA' }] }]);
  const d = await calculateDashboard({ ...f, daily: {}, dates: ['2026-10-12'] });
  assert.ok(d.rows.every(r => r.loggedKnown && r.logged));
  assert.ok(d.rows.every(r => r.missing === null && !r.attendanceKnown));
  assert.equal(d.coverage[0].complete, false);
  f.costs['v3-field-cost'] = await source(dir, 'v3-field-cost');
  const response = await dailyFile(dir, f.roster);
  const partial = await calculateDashboard({ ...f, daily: { '2026-10-12': response }, dates: ['2026-10-12'] });
  const a = partial.rows.find(r => r.recordId === 'recA'), b = partial.rows.find(r => r.recordId === 'recB');
  assert.equal(a.loggedKnown, true); assert.equal(b.loggedKnown, false); assert.equal(b.missing, null);
  const result = compare({ dashboard: partial, reference: null, dates: ['2026-10-12'], sources: [f.roster.health] });
  assert.equal(result.summary.daily[0].dashboard.attention, null);
});

test('daily snapshot contracts: no demo, correct roster, date coverage and priority of list.find', async t => {
  const dir = await tmp(); t.after(() => rm(dir, { recursive: true, force: true }));
  const f = await fixture(dir);
  assert.equal((await dailyFile(dir, f.roster, { demo: true })).health.complete, false);
  assert.equal((await dailyFile(dir, f.roster, { rosterSha256: 'wrong' })).health.complete, false);
  assert.equal((await dailyFile(dir, f.roster, { asOf: '2026-10-13T12:00:00+08:00' })).health.complete, false);
  assert.equal((await dailyFile(dir, f.roster, { members: ['recUnknown'] })).health.complete, false);
  const daily = await dailyFile(dir, f.roster, { members: ['recA', 'recB'], punch: { recA: ['2026-10-12'] }, leave: { recB: [{ date: '2026-10-12', kind: 'out' }, { date: '2026-10-12', kind: 'leave' }] } });
  const result = await calculateDashboard({ ...f, daily: { '2026-10-12': daily }, dates: ['2026-10-12'] });
  assert.equal(result.rows.find(r => r.recordId === 'recB').leave, 'out');
  assert.equal(result.rows.find(r => r.recordId === 'recB').missing, false);
  assert.ok(result.rows.every(r => r.complete));
  const core = await loadPure('scheduleCheck');
  const native = core.dailyStatus(core.parseRoster(f.roster.table), new Set(['recA', 'recB']), new Set(['recA']), new Set(['recA']), new Set(['recA', 'recB']), new Map([['recB', 'out']]));
  assert.equal(result.rows.filter(r => r.missing).length, native.filter(r => r.missing).length);
  assert.equal(result.rows.filter(r => r.leave).length, native.filter(r => r.leave).length);
});

test('raw attendance calls existing core: member expansion, alt IDs, half leave/trip/out, midnight and punches', async t => {
  const dir = await tmp(); t.after(() => rm(dir, { recursive: true, force: true }));
  const roster = await source(dir, 'roster', [person(), { ...person('recOld'), 在職: false }, person('recB', '乙')], { ...schema('roster'), Lark帳號: { field_id: 'fldaccount', field_type: 'user' } });
  roster.table.records[0].people = { Lark帳號: [{ id: 'openA', name: '甲' }] };
  roster.table.records[1].people = { Lark帳號: [{ id: 'openA', name: '甲' }] };
  roster.table.records[2].people = { Lark帳號: [{ id: 'openB', name: '乙' }] };
  const raw = { complete: true, weekStart: '2026-10-12', completeness: { employeeIds: true, groups: true, deptUsers: true, tasks: true, approvals: true }, employeeIds: { openA: 'empA', openB: 'empB' }, groups: [{ bindUsers: [], bindDepts: ['dept'], exceptUsers: ['empB'], exceptDepts: [] }], deptUsers: { dept: ['empA', 'empB'] }, tasks: [
    { user_id: 'empA', day: 20261012, records: [{ check_in_result: 'Normal', check_out_result: 'Lack' }] },
    { user_id: 'empA', day: 20261013, records: [{ check_in_result: 'Lack', check_out_result: 'NoNeedCheck' }] },
    { user_id: 'empA', day: 20261014, records: [{ check_in_result: 'Lack', check_in_result_supplement: 'ManagerModification' }] },
  ], approvals: [{ user_id: 'empA', date: 20261012, leaves: [{ approval_id: 'half', start_time: '2026-10-12 12:30:00', end_time: '2026-10-13 00:00:00', unit: 3, interval: 43200 }], trips: [{ approval_id: 'trip', start_time: '2026-10-14 09:00:00', end_time: '2026-10-14 18:00:00' }], outs: [{ approval_id: 'out', start_time: '2026-10-15 09:00:00', end_time: '2026-10-15 10:00:00' }] }] };
  const d = await fromRaw(raw, roster.table);
  assert.deepEqual(d.members.sort(), ['recA', 'recOld']);
  assert.deepEqual(d.punch.recA, ['2026-10-12', '2026-10-14']);
  assert.ok(d.leave.recA.some(x => x.date === '2026-10-12' && x.kind === 'leave'));
  assert.ok(!d.leave.recA.some(x => x.date === '2026-10-13'));
  assert.ok(d.leave.recA.some(x => x.kind === 'trip'));
  assert.ok(d.leave.recA.some(x => x.kind === 'out'));
  assert.deepEqual(d.leave.recA, d.leave.recOld);
  await assert.rejects(fromRaw({ ...raw, employeeIds: {} }, roster.table), /employee-map/);
  await assert.rejects(fromRaw({ ...raw, completeness: {} }, roster.table), /incomplete/);
});

test('CLI cache-only integration: full equal 0, strict diff 1, partial 2, text/JSON and timezone stability', async t => {
  const dir = await tmp(); t.after(() => rm(dir, { recursive: true, force: true }));
  const f = await fixture(dir); await dailyFile(dir, f.roster);
  let reference = await fakeReference(dir);
  const args = ['--start', '2026-10-12', '--end', '2026-10-12', '--data-dir', dir, '--reference', reference];
  const before = (await readdir(dir)).sort();
  const r = run([...args, '--format', 'json', '--strict'], { PATH: '/usr/bin:/bin', TZ: 'UTC' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.summary.dashboard.attentionPeople, 1);
  assert.equal(result.summary.dashboard.attentionPersonDays, 1);
  assert.equal(result.summary.pythonReview.missingLogPersonDays, 1);
  assert.equal(result.summary.daily[0].common.delta.attention, 0);
  const npmRun = spawnSync('npm', ['run', '--silent', 'yupai:parity', '--', ...args, '--format', 'json', '--strict'], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(npmRun.status, 0, npmRun.stderr);
  assert.deepEqual(JSON.parse(npmRun.stdout), result);
  assert.ok(!/open_id|employee_id|check_time|GPS/.test(npmRun.stdout));
  const other = run([...args, '--format', 'json', '--strict'], { PATH: '/usr/bin:/bin', TZ: 'America/Los_Angeles' });
  assert.deepEqual(JSON.parse(other.stdout), result);
  const text = run(args, { PATH: '/usr/bin:/bin' });
  assert.equal(text.status, 0); assert.match(text.stdout, /native=2 people\/2 person-days; attention=1 people\/1 person-days/);
  assert.equal(renderText(result), text.stdout);
  reference = await fakeReference(dir, { difference: true });
  const changed = run([...args, '--strict', '--format', 'json']);
  assert.equal(changed.status, 1, changed.stdout);
  assert.equal(run([...args, '--format', 'json']).status, 0);
  await rm(path.join(dir, 'v3-admin-cost.manifest.json'));
  const partial = run([...args, '--format', 'json', '--strict']);
  assert.equal(partial.status, 2); assert.equal(JSON.parse(partial.stdout).summary.dashboard.attentionPeople, null);
  assert.ok(!(await readdir(dir)).includes('__pycache__'));
  assert.ok(before.every(n => n !== 'report.md'));
});

test('reference adapter never calls CLI/report/main and audit blocks import-time writes', async t => {
  const dir = await tmp(); t.after(() => rm(dir, { recursive: true, force: true }));
  await fixture(dir);
  const reference = await fakeReference(dir, { unsafe: true });
  const p = spawnSync('/usr/bin/python3', ['-B', referenceAdapter, '--reference', reference, '--data-dir', dir, '--start', '2026-10-12', '--end', '2026-10-12', '--today', '2026-10-20'], { encoding: 'utf8', env: { PATH: '/invalid', PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(p.status, 3); assert.match(p.stderr, /PermissionError/);
  assert.ok(!(await readdir(dir)).includes('forbidden'));
  assert.ok(!(await readdir(dir)).includes('__pycache__'));
});

test('identity ambiguity stays name-level; aliases map uniquely; weekends never Python zeros', async t => {
  const dir = await tmp(); t.after(() => rm(dir, { recursive: true, force: true }));
  const f = await fixture(dir); const daily = await dailyFile(dir, f.roster);
  const dashboard = await calculateDashboard({ ...f, daily: { '2026-10-12': daily }, dates: ['2026-10-12', '2026-10-17'] });
  dashboard.rows.push(...dashboard.rows.filter(r => r.recordId === 'recA').map(r => ({ ...r, recordId: 'recDup' })));
  const cell = { date: '2026-10-12', pre: '排', log: '填', kind: 'work', missing: false, activity: { planningKinds: ['出工'], logged: true, workedAttendance: true }, leaveSources: [], evidence: {} };
  const reference = { aliases: { 異體: '乙' }, people: [{ name: '甲', division: '內業', rosterRecordIds: ['recA', 'recDup'], cells: [cell] }, { name: '異體', division: '內業', rosterRecordIds: [], cells: [cell] }, { name: '未對應', division: '外業', rosterRecordIds: [], cells: [cell] }], excluded: [], workdays: ['2026-10-12'], holidays: [], counts: {} };
  const r = compare({ dashboard, reference, dates: ['2026-10-12', '2026-10-17'], sources: [f.roster.health] });
  assert.equal(r.coverage.identity.ambiguousPeople, 1); assert.equal(r.coverage.identity.unmappedPeople, 1); assert.equal(r.coverage.identity.uniquelyMappedPeople, 1);
  assert.equal(r.rows.filter(r => r.recordId === 'recA' && r.python).length, 0);
  assert.equal(r.rows.find(r => r.recordId === 'recB').pythonName, '異體');
  assert.equal(r.summary.daily[1].python.attention, null); assert.equal(r.summary.daily[1].delta.attention, null);
});

test('reason classification uses evidence, preserves unknown and union counts', async () => {
  const d = { date: '2026-10-19', recordId: 'recA', name: '甲', group: '業務', planned: false, plannedKnown: true, logged: false, loggedKnown: true, attendanceKnown: true, member: true, punched: false, leave: null, missing: true, missingKnown: true, complete: true, evidence: {} };
  const p = { date: d.date, pre: '未排', log: '免', kind: 'work', missing: true, activity: { planningKinds: [], logged: false, workedAttendance: true }, leaveSources: [], evidence: {} };
  const ref = c => ({ aliases: {}, people: [{ name: '甲', division: '業務', cells: [c], rosterRecordIds: ['recA'] }], excluded: [], workdays: [d.date], counts: {}, holidays: [] });
  const get = (c, dash = d) => compare({ dashboard: { rows: [dash], coverage: [{ date: d.date, complete: dash.complete }] }, reference: ref(c), dates: [d.date], sources: [{ key: 'roster', complete: true }], mixedSnapshot: true });
  assert.ok(get(p).rows[0].reasons.includes('sales-exemption'));
  assert.ok(get({ ...p, log: '待' }).rows[0].reasons.includes('grace-period'));
  assert.ok(get({ ...p, kind: 'none' }).rows[0].reasons.includes('no-activity-day'));
  assert.ok(get({ ...p, kind: 'leave', pre: '假', log: '假', missing: false, leaveSources: ['pending'] }).rows[0].reasons.includes('leave-policy'));
  assert.ok(get({ ...p, pre: '排', log: '填', missing: false, activity: { ...p.activity, logged: true } }).rows[0].reasons.includes('log-source'));
  assert.ok(get({ ...p, pre: '待排' }).rows[0].reasons.includes('planning-kind/deadline'));
  assert.ok(get({ ...p, missing: false }, { ...d, planned: true, logged: true }).rows[0].reasons.includes('punch-only'));
  assert.equal(get({ ...p, log: '未填' }).summary.daily[0].dashboard.attention, 1); // not 3 overlapping conditions
  assert.equal(get(p).summary.daily[0].delta.missingPunch, null);
});

test('subprocess bounds, command allowlist, protected paths, and fake CLI pagination/denial', async t => {
  const dir = await tmp(); t.after(() => rm(dir, { recursive: true, force: true }));
  await assert.rejects(cliRead(['auth', 'login']), /allowlisted/);
  await assert.rejects(cliRead(['api', 'POST', '/open-apis/bitable/v1/apps/x/tables/y/records']), /allowlisted/);
  await assert.rejects(prepareSnapshot('/workspace/yupai_report/forbidden'), /protected/);
  await assert.rejects(runFile(process.execPath, ['-e', 'setTimeout(()=>{}, 1000)'], { timeout: 10 }), /timeout/);
  const fake = path.join(dir, 'lark-cli');
  const originalPath = process.env.PATH;
  await writeFile(fake, `#!${process.execPath}\nconst fs=require('fs');const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(path.join(dir, 'calls'))},JSON.stringify(a)+'\\n');if(a[0]!=='base')process.exit(8);if(a[1]==='+field-list'){console.log(JSON.stringify({ok:true,data:{fields:[{id:'fldD',name:'工作日期',type:'datetime'},{id:'fldP',name:'填報人',type:'link'}]}}));}else{const p=a[a.indexOf('--output')+1],offset=Number(a[a.indexOf('--offset')+1]);const r=[{record_id:'rec'+offset,工作日期:'2026-10-12',填報人:[{id:'recA'}]}];fs.writeFileSync(p,JSON.stringify(r[0])+'\\n');fs.writeFileSync(p.replace('.ndjson','.manifest.json'),JSON.stringify({table_id:'tbl8JdWLLwlPFuoF',records_count:1,has_more:offset===0,next_offset:1,query_context:{record_scope:'all_records'},columns:{record_id:{},工作日期:{field_id:'fldD',field_type:'datetime'},填報人:{field_id:'fldP',field_type:'link'}}}));console.log('{}');}\n`);
  await chmod(fake, 0o700); process.env.PATH = `${dir}:${originalPath}`;
  try {
    await pullTable(dir, 'v3-internal-cost');
    const result = await readSource(dir, 'v3-internal-cost'); assert.equal(result.health.count, 2); assert.equal(result.health.complete, true);
    const calls = (await readFile(path.join(dir, 'calls'), 'utf8')).trim().split('\n').map(x => JSON.parse(x));
    assert.equal(calls.length, 3); assert.ok(calls.every(a => a[0] === 'base' && ['+field-list', '+record-list'].includes(a[1]) && a.includes('user')));
    assert.ok(calls[2].includes('--offset')); assert.equal(calls[2][calls[2].indexOf('--offset') + 1], '1');
    await writeFile(fake, `#!${process.execPath}\nprocess.exit(7);\n`); await assert.rejects(pullTable(dir, 'v3-internal-cost'), /subprocess-failed:7/);
  } finally { process.env.PATH = originalPath; }
});

// Optional integration uses the user-specified reference implementation, with ONLY synthetic caches.
// The standalone suite still works elsewhere; set YUPAI_REFERENCE to enable this check there.
const realReference = process.env.YUPAI_REFERENCE ?? '/workspace/yupai_report/generate.py';
let referenceAvailable = true;
try { await readFile(realReference); } catch { referenceAvailable = false; }
test('original Python engine: scope, no activity, sales, grace, leave and Friday deadline on synthetic caches', { skip: !referenceAvailable }, async t => {
  const dir = await tmp(); t.after(() => rm(dir, { recursive: true, force: true }));
  const roster = [
    { ...person('recA', '甲'), 所屬組別: ['控制'] },
    { ...person('recB', '乙'), 所屬組別: ['業務'] },
    { ...person('recC', '丙'), 所屬組別: ['控制'], 職級: ['經理'] },
    { ...person('recD', '丁'), 所屬組別: ['行政'] },
    { ...person('recE', '戊'), 所屬組別: ['控制'] },
    { ...person('recF', '己'), 所屬組別: ['控制'] },
  ];
  await source(dir, 'roster', roster);
  await source(dir, 'preschedule_all', [
    { record_id: 'recPlanA', 開始日期: '2026-10-12', 結束日期: '2026-10-20', 人員: [{ id: 'recA' }], 條類型: ['出工'], 業別: ['內業'] },
    { record_id: 'recRest', 開始日期: '2026-10-13', 結束日期: '2026-10-13', 人員: [{ id: 'recF' }], 條類型: ['休假'], 業別: ['內業'] },
    { record_id: 'recSpecial', 開始日期: '2026-10-14', 結束日期: '2026-10-14', 人員: [{ id: 'recF' }], 條類型: ['特殊'], 業別: ['內業'] },
  ]);
  await source(dir, 'attendance_oct', ['甲','乙','丙','丁','己'].flatMap((name, i) => [
    { record_id: `recAtt${i}`, 姓名: name, 日期: '2026-10-12', 出勤狀態: '已出勤', 請假件數: '0' },
    ...(name === '己' ? [{ record_id: 'recSpecialActive', 姓名: name, 日期: '2026-10-14', 出勤狀態: '已出勤', 請假件數: '0' }] : []),
  ]));
  await source(dir, 'leave_oct', [
    { record_id: 'recPending', 发起人: [{ name: '甲' }], 申请状态: ['审批中'], 开始时间: '2026-10-16T12:30:00+08:00', 结束时间: '2026-10-17T00:00:00+08:00', 假期类型: ['事假'] },
    { record_id: 'recApproved', 发起人: [{ name: '甲' }], 申请状态: ['已通过'], 开始时间: '2026-10-15T08:00:00+08:00', 结束时间: '2026-10-15T12:00:00+08:00', 假期类型: ['事假'] },
  ]);
  for (const k of ['waiye', 'neiye', 'xingzheng']) await source(dir, k);
  const args = ['-B', referenceAdapter, '--reference', realReference, '--data-dir', dir, '--start', '2026-10-12', '--end', '2026-10-20', '--today'];
  const evaluate = async today => JSON.parse(await runFile('python3', [...args, today], { env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } }));
  const r = await evaluate('2026-10-20');
  const cell = (name, date, result = r) => result.people.find(p => p.name === name)?.cells.find(c => c.date === date);
  assert.equal(r.counts.evaluatedPeople, 3); // 甲, 乙, 己; manager/admin excluded, 戊 no signal
  assert.ok(r.noSignal.includes('戊'));
  assert.equal(cell('乙', '2026-10-12').log, '免');
  assert.equal(cell('甲', '2026-10-19').log, '待');
  assert.equal(cell('甲', '2026-10-20').log, '待');
  assert.equal(cell('甲', '2026-10-14').log, '未填');
  assert.ok(cell('甲', '2026-10-16').leaveSources.includes('pending'));
  assert.ok(cell('甲', '2026-10-15').leaveSources.includes('approved'));
  assert.equal(cell('甲', '2026-10-16').missing, false); // even a half day exempts daily checking
  assert.equal(cell('己', '2026-10-13').kind, 'leave');
  assert.equal(cell('己', '2026-10-14').pre, '未排'); // special planning does not qualify
  assert.equal(cell('己', '2026-10-15').kind, 'none');
  assert.ok(!r.workdays.includes('2026-10-17') && !r.workdays.includes('2026-10-18'));
  const thursday = await evaluate('2026-10-08'), friday = await evaluate('2026-10-09');
  assert.equal(cell('乙', '2026-10-12', thursday).pre, '待排');
  assert.equal(cell('乙', '2026-10-12', friday).pre, '未排');
  const originalFiles = await readdir(dir);
  assert.ok(!originalFiles.includes('report.md') && !originalFiles.includes('__pycache__'));
});
