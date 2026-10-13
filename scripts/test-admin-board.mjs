// R11 行政看板邏輯測試（不連 Lark）。lib/adminBoard.ts 的純函式。
// Usage: node --test scripts/test-admin-board.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdminBoard, ADMIN_SCHEDULE_FID } from "../lib/adminBoard.ts";

const DAY = 86400000;
const TZ = 8 * 3600000;
const weekStart = Date.UTC(2026, 9, 5) - TZ; // Mon 2026-10-05 00:00 Taipei
const weekEnd = weekStart + 7 * DAY;
const at = (d) => weekStart + d * DAY + 9 * 3600000;

const F = (name, kind = "text", id = name) => ({ id, name, kind, primary: false });
const table = (fields, rows) => ({
  table: { id: "t", name: "t" },
  fields,
  records: rows.map((r, i) => ({ id: r.id ?? `rec${i}`, fields: r.fields, links: r.links })),
  fetchedAt: 0,
  source: "lark",
  complete: true,
  total: rows.length,
});

const S = ADMIN_SCHEDULE_FID;
const schedFields = [
  F("人員", "multiselect", S.person),
  F("業別", "select", S.trade),
  F("真起日欄(欄名可能被改)", "date", S.start),
  F("真訖日欄(欄名可能被改)", "date", S.end),
  F("預估營業額點數", "number", S.points),
];
const sched = (rows) =>
  table(
    schedFields,
    rows.map(({ people, ids, trade = "行政", start, end = start, points }) => ({
      fields: { 人員: people, 業別: trade, "真起日欄(欄名可能被改)": at(start), "真訖日欄(欄名可能被改)": at(end), 預估營業額點數: points ?? null },
      links: { 人員: ids },
    })),
  );

const costFields = [
  { ...F("單號"), primary: true },
  F("工作日期", "date"),
  F("填表人", "multiselect"),
  F("工作單列", "multiselect"),
  F("加班時數", "number"),
];
const workFields = [
  { ...F("工作單號"), primary: true },
  F("所屬成本單", "multiselect"),
  F("行政工項", "multiselect"),
  F("件數", "number"),
  F("最終營業額點數", "number"),
  F("備註"),
  F("⚠負值"),
];
const cost = (rows) =>
  table(costFields, rows.map((r) => ({ id: r.id, fields: { 單號: r.title, 工作日期: at(r.day), 填表人: [r.who], 工作單列: r.orders ?? null, 加班時數: r.ot ?? null }, links: { 填表人: [r.whoId] } })));
const work = (rows) =>
  table(workFields, rows.map((r) => ({ fields: { 工作單號: r.no, 所屬成本單: [r.costTitle ?? "x"], 行政工項: [r.item ?? "公文"], 件數: 1, 最終營業額點數: r.pts, 備註: null, "⚠負值": r.warn ?? "" }, links: r.costId ? { 所屬成本單: [r.costId] } : undefined })));

const run = (w, c, s) => buildAdminBoard({ work: w, cost: c, sched: s, start: weekStart, end: weekEnd });
const rowOf = (b, id) => b.rows.find((r) => r.personId === id);

test("同人同日兩條預排只算 1 點", () => {
  const s = sched([
    { people: ["甲"], ids: ["P1"], start: 0 },
    { people: ["甲"], ids: ["P1"], start: 0 },
  ]);
  const b = run(work([]), cost([]), s);
  assert.equal(rowOf(b, "P1").plan.points, 1);
});

test("多人預排條對每人展開，起訖多天每天每人 1 點", () => {
  const s = sched([{ people: ["甲", "乙"], ids: ["P1", "P2"], start: 0, end: 2 }]);
  const b = run(work([]), cost([]), s);
  assert.equal(rowOf(b, "P1").plan.points, 3);
  assert.equal(rowOf(b, "P2").plan.points, 3);
});

test("預排有填點數就用填的值（按天分攤）；同日已填就不再補 1 點", () => {
  const s = sched([
    { people: ["甲"], ids: ["P1"], start: 0, end: 1, points: 4 }, // 每天 2
    { people: ["甲"], ids: ["P1"], start: 1 }, // 與上面同日、未填 → 不補
    { people: ["甲"], ids: ["P1"], start: 3 }, // 未填 → 1
  ]);
  const p = rowOf(run(work([]), cost([]), s), "P1").plan;
  assert.equal(p.points, 5);
  assert.equal(p.days, 3);
  assert.equal(p.defaulted, 1);
});

test("非行政業別的預排不算；週外的天不算", () => {
  const s = sched([
    { people: ["甲"], ids: ["P1"], start: 0, trade: "外業" },
    { people: ["乙"], ids: ["P2"], start: 6, end: 9 }, // 只有 d6 在本週
  ]);
  const b = run(work([]), cost([]), s);
  assert.equal(rowOf(b, "P1"), undefined);
  assert.equal(rowOf(b, "P2").plan.points, 1);
});

test("日期用 fid 取，不看欄名：欄名顛倒也不影響", () => {
  const s = sched([{ people: ["甲"], ids: ["P1"], start: 1, end: 2 }]);
  const [a, b] = ["真起日欄(欄名可能被改)", "真訖日欄(欄名可能被改)"];
  s.fields = s.fields.map((f) => ({ ...f, name: f.name === a ? "結束日期" : f.name === b ? "開始日期" : f.name }));
  s.records = s.records.map((r) => ({ ...r, fields: { ...r.fields, 結束日期: r.fields[a], 開始日期: r.fields[b] } }));
  assert.equal(rowOf(run(work([]), cost([]), s), "P1").plan.points, 2);
});

test("工作單經成本單取得人與日期（link record_id）", () => {
  const c = cost([{ id: "C1", title: "T1", day: 2, who: "甲", whoId: "P1", ot: 1.5 }]);
  const w = work([{ no: "W1", pts: 2, costTitle: "T1", costId: "C1" }]);
  const b = run(w, c, sched([]));
  const r = rowOf(b, "P1");
  assert.equal(r.orders.length, 1);
  assert.equal(r.revenue, 2);
  assert.equal(r.days, 1);
  assert.equal(r.overtime, 1.5);
  assert.equal(r.orders[0].date, at(2));
});

test("成本單標題重複時，用「工作單列」仍對得正確", () => {
  const c = cost([
    { id: "C1", title: "同標題", day: 0, who: "甲", whoId: "P1", orders: ["W1"] },
    { id: "C2", title: "同標題", day: 3, who: "乙", whoId: "P2", orders: ["W2"] },
  ]);
  const w = work([
    { no: "W1", pts: 1, costTitle: "同標題" },
    { no: "W2", pts: 5, costTitle: "同標題" },
  ]);
  const b = run(w, c, sched([]));
  assert.equal(rowOf(b, "P1").revenue, 1);
  assert.equal(rowOf(b, "P2").revenue, 5);
  assert.equal(rowOf(b, "P2").orders[0].date, at(3));
});

test("主表列全部人；工作單／營業額含全部，差異只算有預排的人", () => {
  const c = cost([
    { id: "C1", title: "T1", day: 0, who: "甲", whoId: "P1", orders: ["W1"] },
    { id: "C2", title: "T2", day: 0, who: "乙", whoId: "P2", orders: ["W2"] },
  ]);
  const w = work([
    { no: "W1", pts: 2, costId: "C1" },
    { no: "W2", pts: 7, costId: "C2" },
  ]);
  const s = sched([
    { people: ["甲"], ids: ["P1"], start: 0 },
    { people: ["丙"], ids: ["P3"], start: 1 },
  ]);
  const b = run(w, c, s);
  assert.deepEqual(b.rows.map((r) => r.personId).sort(), ["P1", "P2", "P3"]);
  assert.equal(b.rows.find((r) => r.personId === "P2").plan, undefined);
  assert.equal(b.totals.orders, 2);
  assert.equal(b.totals.revenue, 9); // 全部人
  assert.equal(b.totals.points, 2);
  assert.equal(b.totals.diff, 0); // 只算有預排的人（甲 2−2、丙 0−0）
  assert.equal(b.totals.plannedN, 2);
  assert.equal(b.stats.overlapDays, 1);
});

test("⚠ 亮燈（非空字串）算異常張數；排程讀不到時不分區", () => {
  const c = cost([{ id: "C1", title: "T1", day: 0, who: "甲", whoId: "P1" }]);
  const w = work([
    { no: "W1", pts: 1, costId: "C1", warn: "件數不符" },
    { no: "W2", pts: 1, costId: "C1" },
  ]);
  const b = run(w, c, undefined);
  assert.equal(rowOf(b, "P1").anomalyCount, 1);
  assert.equal(b.rows.length, 1);
  assert.equal(b.totals.plannedN, 0);
});

test("週外的成本單不算；對不到成本單的工作單單獨計數", () => {
  const c = cost([{ id: "C1", title: "T1", day: 9, who: "甲", whoId: "P1" }]);
  const w = work([{ no: "W1", pts: 1, costId: "C1" }, { no: "W2", pts: 1, costId: "NOPE" }]);
  const b = run(w, c, sched([]));
  assert.equal(b.rows.length, 0);
  assert.equal(b.stats.unmatchedOrders, 1);
});
