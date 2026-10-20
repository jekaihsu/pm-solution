import { readFile, stat, realpath, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';

export const BASE = 'Sdw1bG1djaHsVGsRPvmjyVWipgg';
export const specs = {
  roster: { table: 'tblmlpA6nG5Ou7NQ', required: ['姓名', '在職', '所屬組別', '職級'] },
  preschedule_all: { table: 'tblN8c3WN44233aG', required: ['人員', '條類型', '開始日期', '結束日期', '業別', '組別'] },
  waiye: { table: 'tbl97f1uXqi7Qz0k', required: ['出工日期', '此單出工人'] },
  neiye: { table: 'tblTP5Naz52FBpFg', required: ['姓名', '工作日期-營業額明細'] },
  xingzheng: { table: 'tbl2c5CLgwPZ3Pl2', required: ['營業額人員-明細', '工作日期-營業額明細'] },
  attendance_oct: { table: 'tblsrN2D99v46m3e', required: ['姓名', '日期', '出勤狀態', '核准假別', '請假件數'] },
  leave_oct: { table: 'tblUxMuP87ZmHHZJ', required: ['发起人', '申请状态', '开始时间', '结束时间', '假期类型'] },
  'v3-internal-cost': { table: 'tbl8JdWLLwlPFuoF', required: ['工作日期', '填報人'], persons: ['填報人'] },
  'v3-field-cost': { table: 'tblQCy3eU0wsUj1I', required: ['工作日期', '組長'], persons: ['組長', '實際出工人', '組員'] },
  'v3-admin-cost': { table: 'tbliyB0wgDhgUQbA', required: ['工作日期', '填表人'], persons: ['填表人'] },
};
export const referenceKeys = Object.keys(specs).slice(0, 7);
export const costKeys = Object.keys(specs).slice(7);
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const iso = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
export function dateMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') throw new Error('invalid-date');
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value;
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw) || !Number.isFinite(Date.parse(raw)) || new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10)) throw new Error('invalid-date');
  return Date.parse(raw);
}
export function datesBetween(start, end) {
  const out = [];
  for (let ms = dateMs(start); ms <= dateMs(end); ms += 86400000) out.push(iso(ms));
  return out;
}
export function runFile(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 45000, maxBuffer: 16 * 1024 * 1024, ...options, shell: false }, (error, stdout, stderr) => {
      if (error) {
        const diagnostic = stdout + stderr;
        const apiCode = diagnostic.match(/\b(999\d{5}|125\d{4}|41050|40004)\b/)?.[1];
        const scopes = ['contact:contact.base:readonly', 'contact:user.employee_id:readonly', 'attendance:rule:readonly', 'attendance:task:readonly'].filter(s => diagnostic.includes(s));
        const safe = new Error(error.killed ? 'subprocess-timeout' : `subprocess-failed:${error.code ?? 'unknown'}${apiCode ? ':api=' + apiCode : ''}${scopes.length ? ':scopes=' + scopes.join(',') : ''}`); reject(safe);
      }
      else resolve(stdout);
    });
  });
}
const dateType = (c) => ['date', 'datetime'].includes(c.field_type) || c.kind === 'date';
const linkType = (c) => ['link', 'duplex_link', 'single_link'].includes(c.field_type) || [18, 21].includes(c.rawType);
const columnId = (c) => c.field_id ?? c.id;
export async function readSource(dir, key, spec = specs[key]) {
  const file = path.resolve(dir, `${key}.ndjson`);
  const health = { key, path: file, complete: false, errors: [], sha256: null, manifestSha256: null, count: null, revision: null, capturedAt: null };
  let manifest, rows;
  try {
    const [bytes, meta, info] = await Promise.all([readFile(file), readFile(file.replace(/\.ndjson$/, '.manifest.json')), stat(file)]);
    health.sha256 = hash(bytes); health.manifestSha256 = hash(meta); health.fileMtime = info.mtime.toISOString();
    manifest = JSON.parse(meta); rows = bytes.toString('utf8').split(/\r?\n/).filter(x => x.trim()).map(x => JSON.parse(x));
    health.count = rows.length; health.revision = manifest.rev ?? null; health.capturedAt = manifest.capturedAt ?? manifest.captured_at ?? manifest.fetched_at ?? null;
    if (manifest.has_more !== false) health.errors.push('pagination-incomplete');
    if (manifest.records_count !== rows.length) health.errors.push('record-count-mismatch');
    if (manifest.table_id !== spec.table) health.errors.push('table-id-mismatch');
    health.recordScope = manifest.query_context?.record_scope ?? null;
    if (health.recordScope !== 'all_records' && !(['attendance_oct', 'leave_oct'].includes(key) && health.recordScope === 'filtered_records')) health.errors.push('record-scope-not-all');
    if (manifest.timezone && manifest.timezone !== 'Asia/Taipei') health.errors.push('timezone-mismatch');
    const columns = manifest.columns ?? {};
    for (const name of spec.required) if (!columns[name] || !columnId(columns[name])) throw new Error(`missing-schema:${name}`);
    if (key === 'preschedule_all') {
      for (const id of ['fldMXOggGP', 'fldjWv1xST', 'fld7KNCsVe', 'fld78OmLVn']) if (!Object.values(columns).some(c => columnId(c) === id)) throw new Error(`missing-field-id:${id}`);
    }
    if (spec.persons) {
      if (key === 'v3-field-cost' && !columns['實際出工人'] && !columns['組員']) throw new Error('missing-schema:實際出工人/組員');
      for (const name of spec.persons.filter(n => columns[n])) if (!linkType(columns[name])) throw new Error(`not-link:${name}`);
    }
    const seen = new Set();
    for (const r of rows) {
      if (typeof r.record_id !== 'string' || !r.record_id || seen.has(r.record_id)) throw new Error('invalid-or-duplicate-record-id');
      seen.add(r.record_id);
      for (const [name, c] of Object.entries(columns)) {
        const v = r[name];
        if (v === null || v === undefined || v === '') continue;
        if (dateType(c)) dateMs(v);
        if (name === '工作日期-營業額明細' && !Number.isFinite(Number(v))) throw new Error('invalid-serial-date');
        if (linkType(c) && (!Array.isArray(v) || v.some(x => !(typeof x?.id === 'string' && x.id.startsWith('rec'))))) throw new Error(`invalid-link:${name}`);
      }
    }
    const fields = Object.entries(columns).filter(([name]) => name !== 'record_id').map(([name, c]) => ({ id: columnId(c), name, kind: dateType(c) ? 'date' : c.field_type === 'checkbox' ? 'checkbox' : 'text', primary: false }));
    const records = rows.map(r => {
      const values = {}, links = {}, people = {};
      for (const f of fields) {
        const v = r[f.name] ?? null, c = columns[f.name];
        if (linkType(c)) { links[f.name] = (v ?? []).map(x => x.id); values[f.name] = (v ?? []).map(x => x.name ?? x.id); }
        else if (['user', 'person'].includes(c.field_type)) { people[f.name] = (v ?? []).map(x => ({ id: x.id, name: x.name ?? '' })); values[f.name] = people[f.name].map(x => x.name); }
        else values[f.name] = dateType(c) && v !== null && v !== '' ? dateMs(v) : v;
      }
      return { id: r.record_id, fields: values, links, people };
    });
    health.complete = !health.errors.length;
    // Never use a wrong table or a count mismatch as valid partial evidence.
    const usable = !health.errors.some(x => x !== 'pagination-incomplete');
    return { health, rows, manifest, table: usable ? { table: { id: spec.table, name: key }, fields, records, complete: health.complete, total: records.length, source: 'lark', fetchedAt: health.capturedAt ? Date.parse(health.capturedAt) : 0 } : null };
  } catch (error) {
    health.errors.push(error.code === 'ENOENT' ? 'missing-file-or-manifest' : error instanceof SyntaxError ? 'invalid-json' : /^(missing-schema|missing-field-id|invalid-|not-link)/.test(error.message) ? error.message : 'unreadable-source');
    return { health, table: null };
  }
}

// The only network commands this tool can execute. No auth/config/docs/Base mutation.
export async function cliRead(args, options) {
  const value = flag => args[args.indexOf(flag) + 1];
  const base = args[0] === 'base' && ['+record-list', '+field-list'].includes(args[1]) && value('--base-token') === BASE && value('--as') === 'user' && [specs.roster.table, ...costKeys.map(k => specs[k].table)].includes(value('--table-id'));
  const api = args[0] === 'api' && ((args[1] === 'GET' && /^\/open-apis\/(contact\/v3\/(users\/batch|users\/find_by_department|departments\/[^/]+\/children)|attendance\/v1\/groups(?:\/[^/]+)?)$/.test(args[2])) || (args[1] === 'POST' && args[2] === '/open-apis/attendance/v1/user_approvals/query'));
  const task = args.slice(0, 3).join(' ') === 'attendance user_tasks query';
  if (!base && !api && !task) throw new Error('command-not-allowlisted');
  return runFile('lark-cli', args, options);
}
function unwrap(raw) {
  const d = JSON.parse(raw);
  if (d.ok === false || (d.code !== undefined && d.code !== 0)) throw new Error(`read-api-denied:${d.code}`);
  return d.data ?? d;
}
export async function apiRead(method, endpoint, params = {}, body) {
  const args = endpoint === '/attendance/v1/user_tasks/query' ? ['attendance', 'user_tasks', 'query', '--employee-type', 'employee_id', '--ignore-invalid-users'] : ['api', method, `/open-apis${endpoint}`];
  args.push('--as', 'user', '--params', JSON.stringify(params));
  if (body) args.push('--data', JSON.stringify(body));
  return unwrap(await cliRead(args));
}
export async function pagedRead(endpoint, params, pick) {
  const out = [], seen = new Set(); let token;
  do {
    const d = await apiRead('GET', endpoint, { ...params, page_size: 50, ...(token ? { page_token: token } : {}) });
    const items = pick(d);
    if (!Array.isArray(items) || typeof d.has_more !== 'boolean') throw new Error('unverified-api-pagination');
    out.push(...items);
    token = d.has_more ? d.page_token : null;
    if (d.has_more && (!token || seen.has(token))) throw new Error('invalid-api-pagination');
    seen.add(token);
  } while (token);
  return out;
}
export async function prepareSnapshot(dir) {
  const resolved = path.resolve(dir);
  // Check resolved ancestors too, so a symlink cannot route writes into a protected tree.
  let ancestor = resolved;
  while (true) { try { const actual = await realpath(ancestor); const target = path.join(actual, path.relative(ancestor, resolved));
    if (['/workspace/yupai_report', '/workspace/pm-solution'].some(p => target === p || target.startsWith(p + '/'))) throw new Error('protected-snapshot-path');
    break;
  } catch (e) { if (e.code !== 'ENOENT') throw e; ancestor = path.dirname(ancestor); } }
  await mkdir(resolved, { recursive: false, mode: 0o700 });
  return resolved;
}
export async function pullTable(dir, key, spec = specs[key]) {
  const raw = unwrap(await cliRead(['base', '+field-list', '--as', 'user', '--base-token', BASE, '--table-id', spec.table, '--format', 'json']));
  const metadata = Array.isArray(raw) ? raw : raw.items ?? raw.fields;
  if (!Array.isArray(metadata) || raw.has_more === true) throw new Error('unverified-field-metadata');
  const selected = [...spec.required, ...(spec.persons ?? [])].filter((n, i, a) => a.indexOf(n) === i);
  const found = selected.map(name => metadata.find(f => (f.field_name ?? f.name) === name)).filter(Boolean);
  if (spec.required.some(name => !found.some(f => (f.field_name ?? f.name) === name))) throw new Error('missing-pull-fields');
  const pages = [], offsets = new Set(); let offset = 0, columns, revision;
  for (let page = 0; page < 1000; page++) {
    const file = path.join(dir, `${key}.page-${page}.ndjson`);
    const args = ['base', '+record-list', '--as', 'user', '--base-token', BASE, '--table-id', spec.table, '--format', 'ndjson', '--limit', '2000', '--offset', String(offset), '--output', file];
    for (const f of found) args.push('--field-id', f.field_id ?? f.id);
    await cliRead(args, { cwd: dir });
    const bytes = await readFile(file), m = JSON.parse(await readFile(file.replace('.ndjson', '.manifest.json'), 'utf8'));
    const rows = bytes.toString('utf8').split(/\r?\n/).filter(x => x.trim()).map(x => JSON.parse(x));
    if (page > 0 && revision !== m.rev) throw new Error('pull-revision-changed');
    revision = m.rev;
    if (m.table_id !== spec.table || m.records_count !== rows.length || typeof m.has_more !== 'boolean' || m.query_context?.record_scope !== 'all_records') throw new Error('invalid-pull-page');
    if (columns && JSON.stringify(columns) !== JSON.stringify(Object.fromEntries(Object.entries(m.columns).map(([k, v]) => [k, { field_id: v.field_id, field_type: v.field_type }])))) throw new Error('pull-schema-changed');
    columns = Object.fromEntries(Object.entries(m.columns).map(([k, v]) => [k, { field_id: v.field_id, field_type: v.field_type }]));
    pages.push(...rows);
    for (const f of found) {
      const c = m.columns[f.field_name ?? f.name];
      if (!c || c.field_id !== (f.field_id ?? f.id) || c.field_type !== (f.type ?? f.field_type)) throw new Error('pull-field-metadata-mismatch');
    }
    if (!m.has_more) {
      const capturedAt = new Date().toISOString();
      await writeFile(path.join(dir, `${key}.ndjson`), pages.map(r => JSON.stringify(r)).join('\n') + (pages.length ? '\n' : ''), { mode: 0o600 });
      await writeFile(path.join(dir, `${key}.manifest.json`), JSON.stringify({ table_id: spec.table, rev: revision, records_count: pages.length, has_more: false, columns, capturedAt, query_context: { record_scope: 'all_records' }, timezone: 'Asia/Taipei', page_count: page + 1 }), { mode: 0o600 });
      return;
    }
    if (!Number.isInteger(m.next_offset) || m.next_offset <= offset || offsets.has(m.next_offset)) throw new Error('invalid-pull-offset');
    offsets.add(offset); offset = m.next_offset;
  }
  throw new Error('pull-page-limit');
}
