#!/usr/bin/env python3
"""Read-only adapter: import the reference, instantiate ONE Analysis, evaluate scope."""
import argparse
import contextlib
import datetime as dt
import importlib.util
import io
import json
import os
import sys
from collections import Counter, defaultdict


def readonly(event, args):
    if event == 'open':
        mode, flags = args[1], args[2]
        if (isinstance(mode, str) and any(c in mode for c in 'wax+')) or (isinstance(flags, int) and flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC)):
            raise PermissionError('reference writes forbidden')
    if event.startswith(('subprocess.', 'socket.', 'os.exec', 'os.spawn')) or event in {'os.system', 'os.remove', 'os.rename', 'os.mkdir', 'os.rmdir', 'os.chmod', 'os.link', 'os.symlink', 'os.truncate', 'os.utime', 'os.posix_spawn', 'os.fork'}:
        raise PermissionError('reference side effects forbidden')


def run(args):
    sys.dont_write_bytecode = True
    sys.addaudithook(readonly)
    spec = importlib.util.spec_from_file_location('parity_reference', args.reference)
    mod = importlib.util.module_from_spec(spec)
    # Never expose incidental module output, API responses or arbitrary exceptions.
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        spec.loader.exec_module(mod)
        mod.DATA_DIR = os.path.abspath(args.data_dir)
        an = mod.Analysis(*[dt.date.fromisoformat(x) for x in (args.start, args.end, args.today)])
        people = []
        evidence = defaultdict(lambda: defaultdict(list))
        raw = {key: mod.load_ndjson(os.path.join(mod.DATA_DIR, key + '.ndjson')) for key in ['preschedule_all', 'waiye', 'neiye', 'xingzheng', 'attendance_oct', 'leave_oct']}
        def add(name, date, source, rid):
            if name and date and args.start <= date <= args.end:
                evidence[(name, date)][source].append(rid)
        for r in raw['preschedule_all']:
            s, e = r.get('開始日期'), r.get('結束日期') or r.get('開始日期')
            if not s: continue
            day, last = dt.date.fromisoformat(s[:10]), dt.date.fromisoformat(e[:10])
            while day <= last:
                for p in r.get('人員') or []:
                    add(an.id2name.get(p['id']), day.isoformat(), 'planning', r['record_id'])
                day += dt.timedelta(days=1)
        for r in raw['waiye']:
            for name in (r.get('此單出工人') or '').split(','):
                add(mod.norm(name), (r.get('出工日期') or '')[:10], 'logs', r['record_id'])
        for key, col in [('neiye', '姓名'), ('xingzheng', '營業額人員-明細')]:
            for r in raw[key]:
                day = mod.serial_to_date(r.get('工作日期-營業額明細'))
                if day: add(mod.norm(r.get(col)), day.isoformat(), 'logs', r['record_id'])
        for r in raw['attendance_oct']:
            add(mod.norm(r.get('姓名')), (r.get('日期') or '')[:10], 'attendance', r['record_id'])
        for r in raw['leave_oct']:
            if (r.get('申请状态') or [''])[0] not in ('已通过', '审批中'): continue
            s, e = r.get('开始时间'), r.get('结束时间') or r.get('开始时间')
            if not s: continue
            day, last = dt.date.fromisoformat(s[:10]), dt.date.fromisoformat(e[:10])
            name = mod.norm(''.join(p.get('name', '') for p in r.get('发起人') or []).replace(' ', ''))
            while day <= last:
                add(name, day.isoformat(), 'leave', r['record_id'])
                day += dt.timedelta(days=1)
        for name in sorted(an.scope):
            division, need, cells = an.evaluate(name)
            clean = []
            for cell in cells:
                date = cell['date']
                pc = an.presch.get((name, date), {})
                clean.append({k: cell[k] for k in ('date', 'pre', 'log', 'kind')} | {
                    'missing': cell['pre'] == '未排' or cell['log'] == '未填',
                    'leaveSources': (['attendance'] if cell.get('leave') else []) + (['pending' if x[0] == '审批中' else 'approved' for x in cell.get('pend') or []]) + (['planning-rest'] if '休假' in pc and not any(x in pc for x in ('出工', '待命', '支援')) else []),
                    'activity': {'planningKinds': sorted(x for x in pc if x is not None), 'logged': bool(an.log.get((name, date))), 'workedAttendance': an.worked_att(name, date)},
                    'evidence': {k: sorted(set(v)) for k, v in evidence[(name, date)].items()},
                })
            people.append({'name': name, 'division': division, 'scope': True, 'needsAttention': need,
                           'rosterRecordIds': sorted(r['record_id'] for r in an.roster if r.get('姓名') == name), 'cells': clean})
        excluded = []
        for name in sorted(an.active - an.scope):
            reasons = []
            if name in mod.EXCLUDE_NAMES: reasons.append('excluded-name')
            if an.level.get(name) in mod.EXCLUDE_LEVELS: reasons.append('excluded-level')
            if an.biz_of(name) not in mod.SCOPE_DIVISIONS: reasons.append('excluded-division')
            if name in an.no_signal: reasons.append('no-signal')
            excluded.append({'name': name, 'reasons': reasons or ['activity-scope']})
    cells = [c for p in people for c in p['cells']]
    log_people = [p for p in people if any(c['log'] == '未填' for c in p['cells'])]
    counts = {'evaluatedPeople': len(people), 'attentionPeople': sum(p['needsAttention'] for p in people),
              'clearPeople': sum(not p['needsAttention'] for p in people),
              'attentionByDivision': dict(Counter(p['division'] for p in people if p['needsAttention'])),
              'missingLogPeople': len(log_people), 'missingLogPersonDays': sum(c['log'] == '未填' for c in cells),
              'onlyMissingPlanningPeople': sum(p['needsAttention'] and not any(c['log'] == '未填' for c in p['cells']) for p in people),
              'fieldNoPlanningPeople': sum(p['division'] == '外業' and not any(c['pre'] == '排' for c in p['cells']) for p in people),
              'attentionPersonDays': sum(c['missing'] for c in cells), 'missingPlanningPersonDays': sum(c['pre'] == '未排' for c in cells)}
    return {'people': people, 'excluded': excluded, 'noSignal': sorted(an.no_signal), 'aliases': mod.NAME_ALIAS,
            'workdays': [d.isoformat() for d in an.workdays], 'holidays': sorted(an.holidays),
            'logDueCutoff': an.log_due_cutoff.isoformat(), 'counts': counts}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for key in ['reference', 'data-dir', 'start', 'end', 'today']:
        parser.add_argument('--' + key, required=True)
    try:
        print(json.dumps(run(parser.parse_args()), ensure_ascii=False, sort_keys=True))
    except Exception as exc:
        print('reference adapter failed: ' + type(exc).__name__, file=sys.stderr)
        sys.exit(3)
