// Checks for the R01／R02 group logic in lib/controlGroup.ts. No Lark access.
// Usage: node --test scripts/test-control-group.mjs   (Node 23.6+ runs the .ts import directly)
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupRows, plannedPoints, resolveScheduleFields, resolveWorkFields } from "../lib/controlGroup.ts";

const DAY = 86400000;
const TZ = 8 * 3600000;
const weekStart = Date.UTC(2026, 9, 5) - TZ; // Mon 2026-10-05 00:00 Taipei
const weekEnd = weekStart + 7 * DAY;
const at = (d) => weekStart + d * DAY + 9 * 3600000;

const field = (name, kind) => ({ id: name, name, kind, primary: false });
const table = (fields, rows) => ({
  table: { id: "t", name: "t" },
  fields,
  records: rows.map((fields, i) => ({ id: `rec${i}`, fields })),
  fetchedAt: 0,
  source: "demo",
  complete: true,
  total: rows.length,
});

const schedule = table(
  [field("業別", "select"), field("組別", "select"), field("開始日期", "date"), field("結束日期", "date")],
  [
    { 業別: "外業", 組別: "水深A組", 開始日期: at(0), 結束日期: at(1) }, // 2 days, no points → 2
    { 業別: "外業", 組別: "水深C組", 開始日期: at(2), 結束日期: at(2) },
    { 業別: "行政", 組別: "行政", 開始日期: at(0), 結束日期: at(4) },
  ],
);
const workFields = [field("組別", "text"), field("最終營業額點數", "number")];
const work = table(workFields, [
  { 組別: "水深A", 最終營業額點數: 3 },
  { 組別: "水深A", 最終營業額點數: 2 },
  { 組別: "水深C", 最終營業額點數: 1 },
]);

const rowsFor = (keepTrade) => {
  const planned = plannedPoints(schedule, resolveScheduleFields(schedule.fields), weekStart, weekEnd, keepTrade);
  return groupRows(work.records, resolveWorkFields(workFields), planned);
};

test("預排「水深A組」對到工作單「水深A」，不另開一列", () => {
  const rows = rowsFor((t) => t === "外業");
  assert.deepEqual(rows.map((r) => r.group).sort(), ["水深A", "水深C"]);
  const a = rows.find((r) => r.group === "水深A");
  assert.equal(a.revenue, 5);
  assert.equal(a.planned?.points, 2);
  assert.equal(rows.find((r) => r.group === "水深C").planned?.points, 1);
});

test("只有預排、沒有工作單的組仍保留預排上的名稱", () => {
  const rows = rowsFor(() => true);
  const admin = rows.find((r) => r.group === "行政");
  assert.ok(admin, "行政 row kept for the footnote");
  assert.equal(admin.orders.length, 0);
});

test("「控制組」這種本身以組結尾的名稱，兩邊寫法一樣時照樣對得上", () => {
  const s = table(schedule.fields, [{ 業別: "內業", 組別: "控制組", 開始日期: at(0), 結束日期: at(0) }]);
  const w = table(workFields, [{ 組別: "控制組", 最終營業額點數: 4 }]);
  const planned = plannedPoints(s, resolveScheduleFields(s.fields), weekStart, weekEnd);
  const rows = groupRows(w.records, resolveWorkFields(workFields), planned);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].planned?.points, 1);
});
