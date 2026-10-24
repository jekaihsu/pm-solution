#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { referenceKeys, costKeys, readSource, datesBetween, dateMs, runFile, pullTable, prepareSnapshot, hash } from './data.mjs';
import { loadPure, readDaily, calculateDashboard, pullAttendance } from './dashboard.mjs';
import { compare, renderText } from './diff.mjs';

export function parseArgs(args) {
  const options = { start: '2026-10-12', end: '2026-10-20', today: '2026-10-20', dataDir: '/workspace/yupai_report/data', reference: '/workspace/yupai_report/generate.py', format: 'text', strict: false, pull: false };
  const fields = { '--start': 'start', '--end': 'end', '--today': 'today', '--data-dir': 'dataDir', '--reference': 'reference', '--dashboard-data-dir': 'dashboardDataDir', '--snapshot-dir': 'snapshotDir', '--format': 'format' };
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--strict') options.strict = true;
    else if (arg === '--pull') options.pull = true;
    else if (fields[arg] && args[i + 1] && !args[i + 1].startsWith('--')) options[fields[arg]] = args[++i];
    else throw new Error('invalid-argument');
  }
  for (const k of ['start', 'end', 'today']) if (!/^\d{4}-\d{2}-\d{2}$/.test(options[k]) || !Number.isFinite(dateMs(options[k]))) throw new Error('invalid-date-argument');
  if (options.start > options.end) throw new Error('start-after-end');
  if (!['json', 'text'].includes(options.format)) throw new Error('invalid-format');
  if (options.pull && !options.snapshotDir) throw new Error('pull-requires-independent-snapshot-dir');
  if (!options.pull && options.snapshotDir) throw new Error('snapshot-dir-requires-pull');
  for (const k of ['dataDir', 'reference', 'dashboardDataDir', 'snapshotDir']) if (options[k]) options[k] = path.resolve(options[k]);
  return options;
}
// Frozen at implementation verification, from the read-only seven-cache regression.
const BASELINE_CACHE_FINGERPRINT = 'd5b65dae94a05ac90cd16910dbcb8d2f65b38f608c7a99572e6ac1a0d0d2c798';
const BASELINE_REFERENCE_SHA256 = '991e9a5ed26dfd59e4dc1459550d548548c48cf2c2ef4c7cf20af0dc6e0ba69a';
const help = `Usage: npm run yupai:parity -- [options]
  --start YYYY-MM-DD              default 2026-10-12 (inclusive)
  --end YYYY-MM-DD                default 2026-10-20 (inclusive)
  --today YYYY-MM-DD              default 2026-10-20; reference grace/deadline basis
  --data-dir PATH                 default /workspace/yupai_report/data (read only)
  --reference PATH                default /workspace/yupai_report/generate.py (read only)
  --dashboard-data-dir PATH       costs and daily/raw snapshots
  --pull --snapshot-dir NEW_PATH  explicitly read existing CLI permissions into NEW private directory
  --format text|json              default text; JSON contains all person/day rows
  --strict                        differences exit 1; incomplete still exits 2
  --help                          no data reads or network
Exit: 0 complete, 1 strict differences, 2 incomplete data/identity, 3 argument/runtime error.
No login, Base/doc writes, messages, dependency installation, or dashboard rule changes.
`;
export async function execute(options) {
  const dates = datesBetween(options.start, options.end), warnings = [];
  const referenceSources = Object.fromEntries(await Promise.all(referenceKeys.map(async k => [k, await readSource(options.dataDir, k)])));
  let reference = null, referenceSha256 = null, referenceRuntimeError = false;
  const referenceHealthy = referenceKeys.every(k => referenceSources[k].health.complete);
  if (referenceHealthy) {
    try {
      referenceSha256 = hash(await readFile(options.reference));
      const adapter = fileURLToPath(new URL('./reference.py', import.meta.url));
      reference = JSON.parse(await runFile('python3', ['-B', adapter, '--reference', options.reference, '--data-dir', options.dataDir, '--start', options.start, '--end', options.end, '--today', options.today], { env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } }));
    } catch (e) { referenceRuntimeError = true; warnings.push(`reference-unavailable:${e.message}`); }
  } else warnings.push('reference-required-cache-incomplete: formal Python evaluation stopped');
  let snapshotDir;
  if (options.pull) {
    snapshotDir = await prepareSnapshot(options.snapshotDir);
    for (const k of costKeys) {
      try { await pullTable(snapshotDir, k); }
      catch (e) { warnings.push(`pull-${k}:${e.message}`); }
    }
    if (referenceSources.roster.health.complete) {
      try { await pullAttendance(snapshotDir, dates, options.today, referenceSources.roster); }
      catch (e) { warnings.push(`pull-attendance:${e.message}; full DailyCheck remains unknown`); }
    }
  }
  const costs = {};
  for (const k of costKeys) {
    costs[k] = await readSource(snapshotDir ?? options.dashboardDataDir ?? options.dataDir, k);
    if (!costs[k].health.complete && options.dashboardDataDir && snapshotDir) {
      const fallback = await readSource(options.dashboardDataDir, k);
      if (fallback.health.complete) costs[k] = fallback;
    }
  }
  const core = await loadPure('attendanceCore'), daily = {};
  for (const monday of new Set(dates.map(d => core.weekDates(dateMs(d))[0]))) {
    daily[monday] = await readDaily(options.dashboardDataDir ?? snapshotDir ?? options.dataDir, monday, referenceSources.roster, options.today);
    if (!daily[monday].health.complete && options.dashboardDataDir && snapshotDir) {
      const fallback = await readDaily(snapshotDir, monday, referenceSources.roster, options.today);
      if (fallback.health.complete) daily[monday] = fallback;
    }
  }
  const cacheFingerprint = hash(JSON.stringify(referenceKeys.map(k => [k, referenceSources[k].health.sha256, referenceSources[k].health.manifestSha256])));
  const baselineMatchesCache = cacheFingerprint === BASELINE_CACHE_FINGERPRINT && referenceSha256 === BASELINE_REFERENCE_SHA256;
  if (!baselineMatchesCache) warnings.push('baseline-inputs-differ: cache/reference hashes differ from the verified 2026-10-20 baseline; never force counts to match');
  const sources = [...Object.values(referenceSources), ...Object.values(costs), ...Object.values(daily)].map(x => x.health);
  const dashboard = await calculateDashboard({ roster: referenceSources.roster, schedule: referenceSources.preschedule_all, costs, daily, dates });
  const captureTimes = new Set(sources.filter(s => s.complete && s.capturedAt).map(s => s.capturedAt));
  const result = compare({ dashboard, reference, dates, sources, mixedSnapshot: !!snapshotDir || captureTimes.size > 1 });
  const pythonComplete = referenceHealthy && !!reference;
  const complete = pythonComplete && result.coverage.complete;
  const differences = result.rows.some(r => r.issue);
  const exitCode = referenceRuntimeError ? 3 : !complete ? 2 : options.strict && differences ? 1 : 0;
  return { schemaVersion: 1, status: referenceRuntimeError ? 'error' : complete ? 'complete' : 'incomplete', exitCode, options, referenceSha256, sources, warnings,
    baseline: { cacheFingerprint, expectedCacheFingerprint: BASELINE_CACHE_FINGERPRINT, expectedReferenceSha256: BASELINE_REFERENCE_SHA256, matchesCache: baselineMatchesCache, expected: { evaluatedPeople: 46, attentionPeople: 39, clearPeople: 7, missingLogPeople: 12, missingLogPersonDays: 14, onlyMissingPlanningPeople: 27, fieldNoPlanningPeople: 21 },
      matchesCounts: reference ? reference.counts.evaluatedPeople === 46 && reference.counts.attentionPeople === 39 && reference.counts.clearPeople === 7 && reference.counts.missingLogPeople === 12 && reference.counts.missingLogPersonDays === 14 && reference.counts.onlyMissingPlanningPeople === 27 && reference.counts.fieldNoPlanningPeople === 21 : null,
      note: 'Hashes frozen during implementation verification; count matching alone does not establish snapshot identity. Baseline dates are 2026-10-12..20, today=2026-10-20.' }, ...result };
}
export async function main(args = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(args);
    if (options.help) { process.stdout.write(help); return 0; }
    const result = await execute(options);
    process.stdout.write(options.format === 'json' ? JSON.stringify(result, null, 2) + '\n' : renderText(result));
    return result.exitCode;
  } catch (e) {
    const error = { schemaVersion: 1, status: 'error', exitCode: 3, error: /^(invalid-|start-after|pull-requires|snapshot-dir|protected-snapshot|pure-module)/.test(e.message) ? e.message : 'execution-failed' };
    process.stdout.write(options?.format === 'json' || args.includes('json') ? JSON.stringify(error) + '\n' : `R04 parity error: ${error.error}\n`);
    return 3;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
