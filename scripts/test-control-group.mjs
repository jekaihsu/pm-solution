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

// ---- 拆組出工（一組拆成多組）與 ROV 歸外業 ----
import { splitCrews, keepFieldSchedule, keepInternalSchedule } from "../lib/controlGroup.ts";

const cf = [{ ...field("單號", "text"), primary: true }, field("組別", "select"), field("工作日期", "date"), field("組長", "text")];
const wfs = [field("組別", "text"), field("最終營業額點數", "number"), field("所屬成本單", "text"), field("控制組檢核", "select")];
const mkWork = (rows) => table(wfs, rows);
const o = (cost, pts, chk) => ({ 組別: "水深A", 最終營業額點數: pts, 所屬成本單: [cost], 控制組檢核: chk ?? null });
const run = (costRows, workRows) => {
  const cost = costRows ? table(cf, costRows) : undefined;
  const w = mkWork(workRows);
  const wf = resolveWorkFields(wfs);
  const rows = groupRows(w.records, wf, new Map());
  return { rows, out: splitCrews(rows, wf, wfs, cost, "出工日期") };
};

test("同組同日兩個組長 → 拆成兩子列，合計不變", () => {
  const { rows, out } = run(
    [
      { 單號: "C1", 組別: "水深A", 工作日期: at(0), 組長: ["甲"] },
      { 單號: "C2", 組別: "水深A", 工作日期: at(0), 組長: ["乙"] },
    ],
    [o("C1", 3, "通過"), o("C1", 2, "不通過"), o("C2", 4, "通過")],
  );
  const g = out[0];
  assert.equal(g.crews.length, 2);
  assert.deepEqual(g.crews.map((c) => c.group).sort(), ["水深A・乙組", "水深A・甲組"]);
  assert.equal(g.revenue, 9);
  assert.equal(g.crews.reduce((s, c) => s + c.revenue, 0), 9);
  assert.equal(g.crews.reduce((s, c) => s + c.orders.length, 0), 3);
  assert.equal(g.orders.length, rows[0].orders.length);
  assert.equal(g.crews.find((c) => c.group === "水深A・甲組").fail, 1);
});

test("同組長開多張單 → 不拆", () => {
  const { out } = run(
    [
      { 單號: "C1", 組別: "水深A", 工作日期: at(0), 組長: ["甲"] },
      { 單號: "C2", 組別: "水深A", 工作日期: at(0), 組長: ["甲"] },
    ],
    [o("C1", 3), o("C2", 4)],
  );
  assert.equal(out[0].crews, undefined);
});

test("不同日各一個組長 → 不拆（要同組同日）", () => {
  const { out } = run(
    [
      { 單號: "C1", 組別: "水深A", 工作日期: at(0), 組長: ["甲"] },
      { 單號: "C2", 組別: "水深A", 工作日期: at(1), 組長: ["乙"] },
    ],
    [o("C1", 3), o("C2", 4)],
  );
  assert.equal(out[0].crews, undefined);
});

test("拆組時組長空白的工作單歸「未填組長」", () => {
  const { out } = run(
    [
      { 單號: "C1", 組別: "水深A", 工作日期: at(0), 組長: ["甲"] },
      { 單號: "C2", 組別: "水深A", 工作日期: at(0), 組長: ["乙"] },
      { 單號: "C3", 組別: "水深A", 工作日期: at(0), 組長: null },
    ],
    [o("C1", 1), o("C2", 1), o("C3", 5)],
  );
  const names = out[0].crews.map((c) => c.group);
  assert.ok(names.includes("水深A・未填組長"));
  assert.equal(out[0].crews.find((c) => c.group === "水深A・未填組長").revenue, 5);
  assert.equal(out[0].crews.reduce((s, c) => s + c.revenue, 0), out[0].revenue);
});

test("沒有成本單資料 → 不拆、不報錯", () => {
  const { out } = run(undefined, [o("C1", 3), o("C2", 4)]);
  assert.equal(out[0].crews, undefined);
  assert.equal(out[0].revenue, 7);
});

test("預排 ROV 組一律算外業：R01 有、R02 沒有，不論業別", () => {
  const s = table(schedule.fields, [
    { 業別: "內業", 組別: "ROV", 開始日期: at(0), 結束日期: at(0) },
    { 業別: "內業", 組別: "rov組", 開始日期: at(1), 結束日期: at(1) },
    { 業別: "內業", 組別: "內業一組", 開始日期: at(0), 結束日期: at(0) },
    { 業別: "外業", 組別: "水深A組", 開始日期: at(0), 結束日期: at(0) },
  ]);
  const sf = resolveScheduleFields(s.fields);
  const r01 = plannedPoints(s, sf, weekStart, weekEnd, keepFieldSchedule);
  const r02 = plannedPoints(s, sf, weekStart, weekEnd, keepInternalSchedule);
  assert.deepEqual([...r01.keys()].sort(), ["ROV", "水深A組"].sort());
  assert.equal(r01.get("ROV").points, 2);
  assert.deepEqual([...r02.keys()], ["內業一組"]);
});

// 成本單「單號」標題會重複（同組同日多張）→ 用成本單的「工作單列」對到工作單號，不靠標題
import { planDiffTotals } from "../lib/controlGroup.ts";

test("成本單標題重複時，用工作單列對應工作單號仍能拆組", () => {
  const cf2 = [...cf, field("工作單列", "multiselect")];
  const wfs2 = [{ ...field("工作單號", "text"), primary: true }, ...wfs];
  const cost = table(cf2, [
    { 單號: "水深A 07/15", 組別: "水深A", 工作日期: at(0), 組長: ["甲"], 工作單列: ["NO.1"] },
    { 單號: "水深A 07/15", 組別: "水深A", 工作日期: at(0), 組長: ["乙"], 工作單列: ["NO.2", "NO.3"] },
  ]);
  const w = table(wfs2, [
    { 工作單號: "NO.1", 組別: "水深A", 最終營業額點數: 1, 所屬成本單: ["水深A 07/15"] },
    { 工作單號: "NO.2", 組別: "水深A", 最終營業額點數: 2, 所屬成本單: ["水深A 07/15"] },
    { 工作單號: "NO.3", 組別: "水深A", 最終營業額點數: 3, 所屬成本單: ["水深A 07/15"] },
  ]);
  const wf = resolveWorkFields(wfs2);
  const out = splitCrews(groupRows(w.records, wf, new Map()), wf, wfs2, cost, "出工日期");
  assert.deepEqual(out[0].crews.map((c) => [c.group, c.revenue]).sort(), [["水深A・乙組", 5], ["水深A・甲組", 1]].sort());
});

test("主表列出全部組；營業額含全部，差異只算有預排的組", () => {
  const wfA = [field("組別", "text"), field("最終營業額點數", "number")];
  const w = table(wfA, [{ 組別: "A", 最終營業額點數: 5 }, { 組別: "B", 最終營業額點數: 10 }]);
  const s = table(schedule.fields, [{ 業別: "外業", 組別: "A組", 開始日期: at(0), 結束日期: at(1) }]);
  const planned = plannedPoints(s, resolveScheduleFields(s.fields), weekStart, weekEnd);
  const rows = groupRows(w.records, resolveWorkFields(wfA), planned);
  const p = planDiffTotals(rows);
  assert.deepEqual(p.rows.map((r) => r.group).sort(), ["A", "B"]);
  assert.equal(p.revenue, 15);
  assert.equal(p.orders, 2);
  assert.equal(p.points, 2);
  assert.equal(p.diff, 3);
  assert.equal(p.n, 1);
  assert.equal(rows.find((r) => r.group === "B").planned, undefined);
});
