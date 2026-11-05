import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkFields, r02EffectiveRevenue, buildDailyPersonRevenue, buildPersonAttendanceAndBackfill, groupRows, blankRow } from '../lib/controlGroup.ts';
// #183 匿名 fixture：人員 P1/P2，無真實資料。
const field = (name, kind = 'text') => ({ id: name, name, kind, primary: false });
const wf = resolveWorkFields([field('最終營業額點數', 'number'), field('修改後營業額', 'number'), field('執行工作數量', 'number')]);
const rec = (id, fields) => ({ id, fields });
const D = '2026-11-03';
const orders = [
  rec('differ', { 工作日期: D, 最終營業額點數: 1, 修改後營業額: 0.5, 執行工作數量: 1 }),
  rec('zero', { 工作日期: D, 最終營業額點數: 1, 修改後營業額: 0, 執行工作數量: 1 }),
  rec('blank', { 工作日期: '2026-11-04', 最終營業額點數: 0.75, 修改後營業額: null, 執行工作數量: 1 }),
  rec('blankstr', { 工作日期: '2026-11-04', 最終營業額點數: 0.25, 修改後營業額: '  ', 執行工作數量: 1 }),
];
test('修改後有值且不同 → 用修改後', () => assert.equal(r02EffectiveRevenue(orders[0].fields, wf), 0.5));
test('修改後＝0 → 算 0，不退回原點數', () => assert.equal(r02EffectiveRevenue(orders[1].fields, wf), 0));
test('修改後空白 → 退回最終營業額點數', () => { assert.equal(r02EffectiveRevenue(orders[2].fields, wf), 0.75); assert.equal(r02EffectiveRevenue(orders[3].fields, wf), 0.25); });
test('沒有修改後欄位 → 與現行相同', () => assert.equal(r02EffectiveRevenue({ 最終營業額點數: 2 }, wf), 2));
test('第 1 區每日／週合計用修改後口徑', () => {
  const row = { ...blankRow('P1'), team: '控制', orders };
  const r = buildDailyPersonRevenue([row], wf, '工作日期', '2026-11-02');
  assert.deepEqual(r.grandDays, [0, 0.5, 1, 0, 0, 0, 0]);
  assert.equal(r.grandTotal, 1.5);
});
test('第 2 區當週營業額與效率跟第 1 區一致', () => {
  const row = { ...groupRows(orders, wf, new Map())[0], group: 'P1', team: '控制' };
  assert.equal(row.revenue, 3); // groupRows 本身（R01 等共用）不變
  const a = buildPersonAttendanceAndBackfill([row], [], wf, '工作日期', '2026-11-02', '2026-11-06');
  const p = a.people.find(x => x.person === 'P1');
  assert.equal(p.revenue, 1.5);
  assert.equal(p.actualWorkDays, 2);
  assert.equal(p.dailyAvgRevenue, 0.75);
  assert.equal(a.totals.totalRevenue, 1.5);
});
