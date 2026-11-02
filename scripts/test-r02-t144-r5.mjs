import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonAttendanceAndBackfill, blankRow, resolveWorkFields, R02_FALLBACK_HOLIDAYS } from '../lib/controlGroup.ts';
import { attendanceLeaveDays, excusedDaysByPerson } from '../lib/attendanceCore.ts';
const wf = resolveWorkFields([]);
// 示範：週 10/26–11/1，10/26 光復節補假；示範甲 10/27–10/30 有填，10/26 沒填
const order = d => ({ id: `示範-${d}`, fields: { 工作日期: `2026-${d}` } });
const rowA = { ...blankRow('示範甲'), team: '控制', orders: ['10-27', '10-28', '10-29', '10-30'].map(order) };
const days = Array.from({ length: 7 }, (_, i) => ({ date: i < 6 ? `2026-10-${26 + i}` : '2026-11-01', kind: 'past' }));
const view = { days, people: [{ name: '示範甲', group: '控制', days: ['off', 'ok', 'ok', 'ok', 'ok', 'off', 'off'] }] };
const run = (leave, people, hol) => buildPersonAttendanceAndBackfill([rowA], [], wf, '工作日期', '2026-10-26', '2026-11-01', leave, [], people, hol).people[0];

test('Lark 出勤 off 的 10/26 不算缺日報', () => {
  const api = JSON.parse(JSON.stringify(attendanceLeaveDays(view)));
  assert.deepEqual(api.offDays, { 示範甲: ['2026-10-26', '2026-10-31', '2026-11-01'] });
  assert.deepEqual(api.people, ['示範甲']);
  const r = run(excusedDaysByPerson(api.days, api.offDays), new Set(api.people), new Set());
  assert.deepEqual(r.missingDates, []);
});
test('出勤有讀到且當天不是 off：即使假日表有該日，仍算缺日報（出勤為主）', () => {
  const v = { days, people: [{ name: '示範甲', group: '控制', days: ['ok', 'ok', 'ok', 'ok', 'ok', 'off', 'off'] }] };
  const api = attendanceLeaveDays(v);
  const r = run(excusedDaysByPerson(api.days, api.offDays), new Set(api.people), new Set(['2026-10-26']));
  assert.deepEqual(r.missingDates, ['2026-10-26']);
});
test('出勤讀不到該人：退回 holidays（10/26 在備援假日表）', () => {
  assert.ok(R02_FALLBACK_HOLIDAYS.has('2026-10-26'));
  assert.deepEqual(run({}, undefined).missingDates, []);
  assert.deepEqual(run({}, new Set(['別人'])).missingDates, []);
  assert.deepEqual(run({}, undefined, new Set()).missingDates, ['2026-10-26']);
});
test('off 不覆蓋請假種類', () => {
  const m = excusedDaysByPerson({ 示範甲: [{ date: '2026-10-26', kind: 'half' }] }, { 示範甲: ['2026-10-26', '2026-10-31'] });
  assert.deepEqual(m.示範甲, { '2026-10-26': 'half', '2026-10-31': 'off' });
});
