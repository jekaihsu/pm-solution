// 「預排 vs 日誌」合規口徑測試（不連 Lark）。lib/yupaiCompliance.ts 的純函式。
// Usage: node --import tsx --test scripts/test-yupai-compliance.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, Analysis } from "../lib/yupaiCompliance.ts";

const DAY = 86400000;
// Lark/Excel 日期序列（內業／行政工作日期欄）。
const serial = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / DAY);
};
const iso = (s) => `${s}T00:00:00.000+08:00`;

// 名冊：record_id、姓名、在職、所屬組別、職級。
const roster = [
  { record_id: "r1", 姓名: "甲", 在職: true, 所屬組別: ["水深A組"], 職級: ["員工"] },
  { record_id: "r2", 姓名: "乙", 在職: true, 所屬組別: ["業務"], 職級: ["員工"] },
  { record_id: "r3", 姓名: "丙", 在職: false, 所屬組別: ["水深B組"], 職級: ["員工"] }, // 離職
  { record_id: "r4", 姓名: "丁", 在職: true, 所屬組別: ["水深B組"], 職級: ["經理"] }, // 主管
  { record_id: "r5", 姓名: "戊", 在職: true, 所屬組別: ["圖報A"], 職級: ["員工"] }, // 內業
];

// 甲：外業、10/12 有外業工作單、整區間無預排 → 未排。
// 丙（離職）、丁（經理）各有工作單，應被排除。
const waiye = [
  { record_id: "w1", 出工日期: iso("2026-10-12"), 此單出工人: "甲" },
  { record_id: "w2", 出工日期: iso("2026-10-12"), 此單出工人: "丙" },
  { record_id: "w3", 出工日期: iso("2026-10-12"), 此單出工人: "丁" },
  // 己：只有週六（10/17）有工作單，平日無訊號。
  { record_id: "w4", 出工日期: iso("2026-10-17"), 此單出工人: "庚" },
];

// 乙：業務、10/12+10/13 有預排（出工），無日誌 → 業務免填、不算缺。
const preschedule = [
  { record_id: "p1", 開始日期: iso("2026-10-12"), 結束日期: iso("2026-10-13"), 人員: [{ id: "r2" }], 條類型: ["出工"], 業別: ["業務"], 組別: ["業務"] },
];

// 戊：內業、10/12 有內業工作單（已填）。
const neiye = [{ record_id: "n1", "工作日期-營業額明細": String(serial("2026-10-12")), 姓名: "戊" }];

// 戊：10/14、10/15 有打卡出勤（但無工作單）→ 活動日。
const attendance = [
  { record_id: "a1", 姓名: "戊", 日期: iso("2026-10-14"), 出勤狀態: "已出勤", 請假件數: "0", 核准假別: "" },
  { record_id: "a2", 姓名: "戊", 日期: iso("2026-10-15"), 出勤狀態: "已出勤", 請假件數: "0", 核准假別: "" },
];

const data = { roster, preschedule, waiye, neiye, xingzheng: [], attendance, leave: [] };

test("區間僅取平日（排除週末）", () => {
  const an = new Analysis(data, { start: "2026-10-12", end: "2026-10-18", today: "2026-10-16" });
  assert.equal(an.workdays.length, 5, "10/12–10/18 應有 5 個平日（排除 10/17、10/18）");
});

test("離職與主管排除，外業員工納入", () => {
  const an = new Analysis(data, { start: "2026-10-12", end: "2026-10-18", today: "2026-10-16" });
  assert.ok(an.scope.has("甲"), "在職外業員工應納入");
  assert.ok(!an.scope.has("丙"), "離職者應排除");
  assert.ok(!an.scope.has("丁"), "經理應排除");
});

test("業務組免填日誌：有預排、無日誌不算缺", () => {
  const an = new Analysis(data, { start: "2026-10-12", end: "2026-10-18", today: "2026-10-16" });
  const ev = an.evaluate("乙");
  assert.equal(ev.division, "業務");
  const c12 = ev.cells.find((c) => c.date === "2026-10-12");
  assert.equal(c12.pre, "排");
  assert.equal(c12.log, "免", "業務免填 → log 應為「免」而非「未填」");
  assert.equal(ev.need, false, "業務有排、免填 → 不需關注");
});

test("日誌次日寬限：截止日(含)當天之後標「待」、之前標「未填」", () => {
  const an = new Analysis(data, { start: "2026-10-12", end: "2026-10-18", today: "2026-10-16" });
  const ev = an.evaluate("戊");
  assert.equal(ev.division, "內業");
  const c14 = ev.cells.find((c) => c.date === "2026-10-14");
  const c15 = ev.cells.find((c) => c.date === "2026-10-15");
  assert.equal(c14.log, "未填", "10/14 早於寬限截止 → 未填");
  assert.equal(c15.log, "待", "10/15（=寬限截止）→ 待，不算缺");
  const c12 = ev.cells.find((c) => c.date === "2026-10-12");
  assert.equal(c12.log, "填", "10/12 有內業工作單 → 填");
});

test("只對有活動訊號的日子判缺；無訊號日為「·」", () => {
  const an = new Analysis(data, { start: "2026-10-12", end: "2026-10-18", today: "2026-10-16" });
  const ev = an.evaluate("甲");
  const c12 = ev.cells.find((c) => c.date === "2026-10-12");
  assert.equal(c12.pre, "未排", "有日誌但無預排 → 未排");
  assert.equal(c12.log, "填");
  const c13 = ev.cells.find((c) => c.date === "2026-10-13");
  assert.equal(c13.kind, "none", "10/13 無任何訊號 → 不判缺");
  assert.equal(c13.pre, "·");
});

test("下週預排在上週五之前不判未排（待排）", () => {
  // 視窗為下週（10/19 一 ~ 10/23 五），今天是 10/15（早於該週期限的上週五 10/16）。
  const future = {
    ...data,
    attendance: [{ record_id: "f1", 姓名: "甲", 日期: iso("2026-10-19"), 出勤狀態: "已出勤", 請假件數: "0", 核准假別: "" }],
    waiye: [],
    neiye: [],
    preschedule: [],
  };
  const an = new Analysis(future, { start: "2026-10-19", end: "2026-10-23", today: "2026-10-15" });
  const ev = an.evaluate("甲");
  const c19 = ev.cells.find((c) => c.date === "2026-10-19");
  assert.equal(c19.pre, "待排", "尚未到上週五期限 → 待排，不算未排");
  assert.equal(ev.need, false, "待排不算缺");
});

test("整區間計數（analyze 聚合）合理", () => {
  const { result } = analyze(data, { start: "2026-10-12", end: "2026-10-18", today: "2026-10-16" });
  // 甲（外業，未排）、戊（內業，未填）需關注；乙（業務）無缺。
  assert.ok(result.stats.scope >= 3);
  assert.ok(result.attention.some((r) => r.name === "甲"));
  assert.ok(result.attention.some((r) => r.name === "戊"));
  assert.ok(result.clean.some((r) => r.name === "乙"));
  assert.ok(result.withMissing.includes("戊"), "戊 10/14 未填 → 需補登");
  assert.equal(result.stats.zeroPreTotal, 1, "外業只有甲整區間無預排");
});
