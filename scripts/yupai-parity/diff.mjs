const distinct = (rows, key) => new Set(rows.map(r => r[key])).size;
function dashCounts(rows, rosterKnown = true) {
  const all = rosterKnown && rows.every(r => r.complete);
  const attendance = rosterKnown && rows.every(r => r.attendanceKnown);
  return { evaluated: rosterKnown ? rows.length : null,
    missingPlanning: attendance && rows.every(r => r.plannedKnown) ? rows.filter(r => !r.leave && r.planned === false).length : null,
    missingLog: attendance && rows.every(r => r.loggedKnown) ? rows.filter(r => !r.leave && r.logged === false).length : null,
    // Raw known absences remain useful when leave is unavailable, but are not missing counts.
    planningAbsentBeforeLeave: rosterKnown && rows.every(r => r.plannedKnown) ? rows.filter(r => r.planned === false).length : null,
    logAbsentBeforeLeave: rosterKnown && rows.every(r => r.loggedKnown) ? rows.filter(r => r.logged === false).length : null,
    attention: all ? rows.filter(r => r.missing).length : null,
    leave: attendance ? rows.filter(r => r.leave).length : null,
    missingPunch: attendance ? rows.filter(r => r.member && !r.punched && !r.leave).length : null };
}
function pythonCounts(cells, evaluated) {
  if (!evaluated) return { evaluated: null, missingPlanning: null, missingLog: null, attention: null, leave: null, missingPunch: null };
  return { evaluated: cells.length, missingPlanning: cells.filter(c => c.pre === '未排').length,
    missingLog: cells.filter(c => c.log === '未填').length, attention: cells.filter(c => c.missing).length,
    leave: cells.filter(c => c.kind === 'leave').length, missingPunch: null };
}
function deltas(dashboard, python, allowed) {
  return Object.fromEntries(['evaluated', 'missingPlanning', 'missingLog', 'attention', 'leave', 'missingPunch'].map(k => [k, allowed && dashboard[k] !== null && python[k] !== null ? dashboard[k] - python[k] : null]));
}
export function compare({ dashboard, reference, dates, sources, mixedSnapshot = false }) {
  const aliases = reference?.aliases ?? {}, normalize = n => aliases[n.trim()] ?? n.trim();
  const pyPeople = reference?.people ?? [], byName = new Map(), dPeople = new Map();
  for (const r of dashboard.rows) dPeople.set(r.recordId, { recordId: r.recordId, name: r.name, group: r.group });
  for (const p of dPeople.values()) { const name = normalize(p.name), list = byName.get(name) ?? []; list.push(p); byName.set(name, list); }
  const mapping = new Map(), nameComparisons = [], used = new Set();
  for (const p of pyPeople) {
    const candidates = byName.get(normalize(p.name)) ?? [];
    if (candidates.length === 1) { mapping.set(candidates[0].recordId, p); used.add(p.name); }
    else nameComparisons.push({ name: p.name, division: p.division, identity: candidates.length ? 'ambiguous' : 'unmapped', candidateRecordIds: candidates.map(x => x.recordId).sort(), cells: p.cells });
  }
  const excluded = new Map((reference?.excluded ?? []).map(x => [normalize(x.name), x.reasons]));
  const ambiguousNames = new Set(nameComparisons.filter(x => x.identity === 'ambiguous').map(x => normalize(x.name)));
  const rows = [];
  for (const d of dashboard.rows) {
    const p = mapping.get(d.recordId), c = p?.cells.find(c => c.date === d.date) ?? null;
    const scope = ambiguousNames.has(normalize(d.name)) ? 'ambiguous' : p ? c ? 'shared' : 'not-evaluated' : reference ? 'dashboard-only' : 'reference-unavailable';
    const reasons = [], differences = [];
    if (scope === 'dashboard-only') reasons.push('scope');
    if (scope === 'ambiguous' || normalize(d.name) !== d.name || (p && p.name !== d.name)) reasons.push('identity');
    if (scope === 'not-evaluated') reasons.push('not-evaluated');
    if (!reference || !d.complete) reasons.push('unknown-source');
    if (c) {
      const pyPlanned = c.pre === '排' ? true : c.pre === '未排' || c.pre === '待排' ? false : null;
      const pyLogged = c.log === '填' ? true : c.log === '未填' || c.log === '待' ? false : null;
      if (d.plannedKnown && pyPlanned !== null && d.planned !== pyPlanned) differences.push('planned');
      if (d.loggedKnown && pyLogged !== null && d.logged !== pyLogged) differences.push('logged');
      if (d.attendanceKnown && !!d.leave !== (c.kind === 'leave')) differences.push('leave');
      if (d.missingKnown && d.missing !== c.missing) differences.push('missing');
      if (c.kind === 'none' && (d.missing || (d.plannedKnown && !d.planned) || (d.loggedKnown && !d.logged))) reasons.push('no-activity-day');
      if (d.loggedKnown && d.logged !== c.activity.logged) reasons.push('log-source');
      if (c.log === '待' && d.logged === false) reasons.push('grace-period');
      if (c.log === '免' && d.logged === false) reasons.push('sales-exemption');
      if (differences.includes('leave') || (differences.includes('missing') && (d.leave || c.leaveSources.length))) reasons.push('leave-policy');
      if ((differences.includes('planned') && c.activity.planningKinds.some(k => !['出工', '待命', '支援'].includes(k))) || (c.pre === '待排' && d.planned === false)) reasons.push('planning-kind/deadline');
      if (d.attendanceKnown && d.member && !d.punched && !d.leave && !c.missing) reasons.push('punch-only');
    }
    const issue = differences.length > 0 || scope !== 'shared' || !d.complete || reasons.length > 0;
    if (mixedSnapshot && issue) reasons.push('mixed-snapshot');
    if (differences.length && !reasons.length) reasons.push('unclassified');
    rows.push({ date: d.date, recordId: d.recordId, name: d.name, group: d.group, pythonName: p?.name ?? null, division: p?.division ?? null,
      scope, scopeReasons: excluded.get(normalize(d.name)) ?? [], dashboard: d, python: c,
      pythonRosterRecordIds: p?.rosterRecordIds ?? [], differences, reasons: [...new Set(reasons)].sort(), issue });
  }
  // One name-level row per unresolved Python person/day, never cloned onto roster IDs.
  for (const p of pyPeople.filter(p => !used.has(p.name))) for (const date of dates) {
    const c = p.cells.find(c => c.date === date) ?? null;
    rows.push({ date, recordId: null, name: p.name, group: '', pythonName: p.name, division: p.division, scope: ambiguousNames.has(normalize(p.name)) ? 'python-ambiguous' : 'python-only',
      scopeReasons: [], dashboard: null, python: c, pythonRosterRecordIds: p.rosterRecordIds, differences: [], reasons: ['identity', 'scope', ...(!c ? ['not-evaluated'] : [])], issue: true });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.group.localeCompare(b.group, 'zh-Hant') || a.name.localeCompare(b.name, 'zh-Hant') || (a.recordId ?? '').localeCompare(b.recordId ?? ''));
  const rosterKnown = sources.find(s => s.key === 'roster')?.complete === true;
  const daily = dates.map(date => {
    const ds = dashboard.rows.filter(r => r.date === date), ps = pyPeople.flatMap(p => p.cells.filter(c => c.date === date));
    const evaluated = !!reference?.workdays.includes(date), dr = dashCounts(ds, rosterKnown), pr = pythonCounts(ps, evaluated);
    const common = rows.filter(r => r.date === date && r.scope === 'shared');
    const cd = dashCounts(common.map(r => r.dashboard), rosterKnown), cp = pythonCounts(common.map(r => r.python), evaluated);
    const samePopulation = evaluated && ds.length === common.length && ps.length === common.length;
    return { date, pythonEvaluation: evaluated ? 'evaluated' : reference ? 'not-evaluated' : 'unknown', dashboard: dr, python: pr,
      delta: deltas(dr, pr, samePopulation && ds.every(r => r.complete)),
      deltaLimitation: !samePopulation ? 'different-or-unevaluated-population' : !ds.every(r => r.complete) ? 'incomplete-sources' : null,
      common: { people: common.length, dashboard: cd, python: cp, delta: deltas(cd, cp, evaluated && common.every(r => r.dashboard.complete)), complete: rosterKnown && evaluated && common.every(r => r.dashboard.complete) } };
  });
  const issues = rows.filter(r => r.issue), reasonCounts = {};
  for (const r of issues) for (const reason of r.reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  const allComplete = rosterKnown && dashboard.coverage.every(c => c.complete);
  const commonRows = rows.filter(r => r.scope === 'shared');
  const commonDashboard = commonRows.map(r => r.dashboard), commonPython = commonRows.map(r => r.python);
  const commonComplete = rosterKnown && !!reference && commonDashboard.every(r => r.complete);
  const commonDCounts = dashCounts(commonDashboard, rosterKnown), commonPCounts = pythonCounts(commonPython, !!reference);
  const periodDashboard = allComplete ? {
    missingPlanningPeople: distinct(dashboard.rows.filter(r => !r.leave && r.planned === false), 'recordId'),
    missingPlanningPersonDays: dashboard.rows.filter(r => !r.leave && r.planned === false).length,
    missingLogPeople: distinct(dashboard.rows.filter(r => !r.leave && r.logged === false), 'recordId'),
    missingLogPersonDays: dashboard.rows.filter(r => !r.leave && r.logged === false).length,
    leavePeople: distinct(dashboard.rows.filter(r => r.leave), 'recordId'), leavePersonDays: dashboard.rows.filter(r => r.leave).length,
    missingPunchPeople: distinct(dashboard.rows.filter(r => r.member && !r.punched && !r.leave), 'recordId'),
    missingPunchPersonDays: dashboard.rows.filter(r => r.member && !r.punched && !r.leave).length,
  } : Object.fromEntries(['missingPlanningPeople', 'missingPlanningPersonDays', 'missingLogPeople', 'missingLogPersonDays', 'leavePeople', 'leavePersonDays', 'missingPunchPeople', 'missingPunchPersonDays'].map(k => [k, null]));
  return { rows, nameComparisons,
    coverage: { dates: dashboard.coverage, workdays: reference?.workdays ?? null, holidays: reference?.holidays ?? null,
      snapshotAlignment: mixedSnapshot ? 'mixed-snapshot' : 'unverified', complete: allComplete && !!reference && !nameComparisons.length,
      identity: { uniquelyMappedPeople: mapping.size, ambiguousPeople: nameComparisons.filter(x => x.identity === 'ambiguous').length, unmappedPeople: nameComparisons.filter(x => x.identity === 'unmapped').length } },
    summary: { daily, common: { evaluatedPeople: rosterKnown ? distinct(commonRows, 'recordId') : null, evaluatedPersonDays: rosterKnown ? commonRows.length : null, complete: commonComplete,
      dashboard: { ...commonDCounts, attentionPeople: commonComplete ? distinct(commonDashboard.filter(r => r.missing), 'recordId') : null },
      python: { ...commonPCounts, attentionPeople: reference ? distinct(commonRows.filter(r => r.python.missing), 'recordId') : null },
      delta: deltas(commonDCounts, commonPCounts, commonComplete) }, pythonReview: reference?.counts ?? null, logDueCutoff: reference?.logDueCutoff ?? null,
      dashboard: { ...periodDashboard, nativePeople: rosterKnown ? dPeople.size : null, nativePersonDays: rosterKnown ? dashboard.rows.length : null,
        attentionPeople: allComplete ? distinct(dashboard.rows.filter(r => r.missing), 'recordId') : null,
        attentionPersonDays: allComplete ? dashboard.rows.filter(r => r.missing).length : null,
        knownAttentionPeople: distinct(dashboard.rows.filter(r => r.missing === true), 'recordId'),
        knownAttentionPersonDays: dashboard.rows.filter(r => r.missing === true).length },
      differencePersonDays: rows.filter(r => r.differences.length).length, issueRows: issues.length,
      reasonCounts, reasonCountsMayOverlap: true, units: 'daily counts are person-days; period people are distinct; attention is a union' } };
}
export function renderText(result) {
  const n = x => x === null || x === undefined ? 'N/A' : String(x);
  const lines = [`R04 daily parity ${result.options.start}..${result.options.end} (inclusive) today=${result.options.today} Asia/Taipei`,
    `status=${result.status} exit=${result.exitCode} snapshot=${result.coverage.snapshotAlignment}; current visible data, not a historical snapshot`,
    'Sources (mtime is LOCAL metadata, never remote capture time):'];
  for (const s of result.sources) lines.push(`  ${s.key}: ${s.complete ? 'complete' : 'incomplete'} count=${n(s.count)} revision=${n(s.revision)} captured=${n(s.capturedAt)} sha256=${n(s.sha256)} manifestSha256=${n(s.manifestSha256)} path=${s.path}${s.errors.length ? ' errors=' + s.errors.join(',') : ''}`);
  for (const warning of result.warnings) lines.push(`  warning: ${warning}`);
  const p = result.summary.pythonReview;
  lines.push(p ? `Python period: evaluated=${p.evaluatedPeople} attention=${p.attentionPeople} clear=${p.clearPeople}; missing log=${p.missingLogPeople} people/${p.missingLogPersonDays} person-days; only missing planning=${p.onlyMissingPlanningPeople}; field no planning=${p.fieldNoPlanningPeople}; divisions=${JSON.stringify(p.attentionByDivision)}` : 'Python period: unavailable');
  const d = result.summary.dashboard;
  lines.push(`Dashboard period: native=${n(d.nativePeople)} people/${n(d.nativePersonDays)} person-days; attention=${n(d.attentionPeople)} people/${n(d.attentionPersonDays)} person-days`,
    'Daily: date | D evaluated/unplanned/unlogged/attention/leave/punch-missing | P evaluated/unplanned/unlogged/attention/leave/punch-missing | attention delta | common attention delta');
  for (const r of result.summary.daily) {
    const nums = x => ['evaluated', 'missingPlanning', 'missingLog', 'attention', 'leave', 'missingPunch'].map(k => n(x[k])).join('/');
    lines.push(`  ${r.date} | ${nums(r.dashboard)} | ${nums(r.python)} (${r.pythonEvaluation}) | ${n(r.delta.attention)} | ${n(r.common.delta.attention)}`);
  }
  lines.push(`Common period: ${n(result.summary.common.evaluatedPeople)} people/${n(result.summary.common.evaluatedPersonDays)} person-days; D/P attention=${n(result.summary.common.dashboard.attention)}/${n(result.summary.common.python.attention)}; delta=${n(result.summary.common.delta.attention)}`, `Differences=${result.summary.differencePersonDays} person-days; issue rows=${result.summary.issueRows}; reasons=${JSON.stringify(result.summary.reasonCounts)} (overlap allowed)`, 'Issue rows (full rows and evidence are available with --format json):');
  for (const r of result.rows.filter(r => r.issue)) {
    const d = r.dashboard, p = r.python;
    const state = d ? `planned=${n(d.planned)} logged=${n(d.logged)} member=${n(d.member)} punched=${n(d.punched)} leave=${d.attendanceKnown ? d.leave ?? '-' : 'unknown'} missing=${n(d.missing)}` : 'absent';
    lines.push(`  ${r.date} ${r.group} ${r.name} [${r.recordId ?? 'name-level'}] ${r.scope} D:${state} P:${p ? p.pre + '/' + p.log + '/' + p.kind : 'not-evaluated'} diff=${r.differences.join(',') || '-'} reasons=${r.reasons.join(',') || '-'} evidence=${JSON.stringify({ dashboard: d?.evidence ?? null, python: p?.evidence ?? null })}`);
  }
  return lines.join('\n') + '\n';
}
