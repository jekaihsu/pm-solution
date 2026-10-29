import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortR02Attendance } from '../lib/r02AttendanceSort.ts';

test('未填數降冪，正常居中，補填置後；同順位維持原順序', () => {
  const row = (name, missingReportDays, before1030Count = 0, after1030Count = 0) =>
    ({ name, missingReportDays, before1030Count, after1030Count });
  const rows = [row('補填', 0, 1), row('正常一', 0), row('未填一', 1),
    row('混合', 3, 0, 1), row('正常二', 0), row('未填二', 1), row('逾時補填', 0, 0, 1)];
  assert.deepEqual(sortR02Attendance(rows).map(r => r.name),
    ['混合', '未填一', '未填二', '正常一', '正常二', '補填', '逾時補填']);
  assert.equal(rows[0].name, '補填');
});
