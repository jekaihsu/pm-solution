import test from 'node:test';
import assert from 'node:assert/strict';
import { projectDueDates, matchesDueRange, isDueSoon, taipeiDate } from '../lib/r02ProjectDates.ts';

test('V4 契約迄日按工程歸集，空白與佔位工程不當成日期', () => {
  const records = [
    { id:'a', fields:{ 工程編號:'C115264', 契約迄日:Date.parse('2026-11-04T16:00:00Z') } },
    { id:'b', fields:{ 工程編號:'C115264', 契約迄日:'2026-11-08' } },
    { id:'c', fields:{ 工程編號:'C115265', 契約迄日:null } },
    { id:'d', fields:{ 工程編號:'C000000', 契約迄日:'2026-11-08' } },
  ];
  const dates = projectDueDates(records);
  assert.deepEqual(dates.get('C115264'), ['2026-11-05','2026-11-08']);
  assert.equal(dates.has('C115265'), false);
  assert.equal(dates.has('C000000'), false);
  assert.equal(taipeiDate(null), '');
  assert.equal(matchesDueRange([], '', ''), true);
  assert.equal(matchesDueRange([], '2026-11-01', ''), false);
  assert.equal(matchesDueRange(dates.get('C115264'), '2026-11-06', '2026-11-09'), true);
  assert.equal(isDueSoon(dates.get('C115264'), '2026-10-29', null), false);
  assert.equal(isDueSoon(dates.get('C115264'), '2026-10-29', 7), true);
  assert.equal(isDueSoon(['2026-10-28'], '2026-10-29', 7), false);
});
