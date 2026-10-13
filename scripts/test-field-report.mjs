// R10 外業報告（外業經理用）邏輯測試（不連 Lark）。lib/fieldReport.ts 的純函式。
// Usage: node --test scripts/test-field-report.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFieldReport, FIELD_SCHEDULE_FID, groupKey, isRovGroup, keepFieldGroup, keepFieldSchedule, KEEP_GROUP_EXCLUDE } from "../lib/fieldReport.ts";
import * as cg from "../lib/controlGroup.ts";

const DAY = 86400000;
const TZ = 8 * 3600000;
const weekStart = Date.UTC(2026, 9, 5) - TZ; // Mon 2026-10-05 00:00 Taipei
const weekEnd = weekStart + 7 * DAY;
const at = (d) => weekStart + d * DAY + 9 * 3600000;
const dayNo = (d) => Math.floor((at(d) + TZ) / DAY); // Taipei 日序號

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

// ---- 外業工作單 ----
const workFields = [
  { ...F("工作單號"), primary: true },
  F("出工日期", "date"),
  F("組別"),
  F("所屬案件", "multiselect"),
  F("案件編號"),
  F("最終營業額點數", "number"),
  F("完成數量", "number"),
  F("修改後數量", "number"),
  F("突發狀況"),
  F("備註"),
  F("檢核狀態", "select"),
  F("控制組檢核", "checkbox"),
  F("外業經理檢核", "checkbox"),
];
let seq = 0;
const order = ({ no = `W${++seq}`, day, group, caseId, caseNo = caseId, pts = 1, qty = null, qtyFixed = null, incident = null, note = null, status = null, ctrl = false, mgr = false }) => ({
  fields: { 工作單號: no, 出工日期: at(day), 組別: group, 所屬案件: caseNo ? [caseNo] : null, 案件編號: caseNo ?? null, 最終營業額點數: pts, 完成數量: qty, 修改後數量: qtyFixed, 突發狀況: incident, 備註: note, 檢核狀態: status, 控制組檢核: ctrl, 外業經理檢核: mgr },
  links: caseId ? { 所屬案件: [caseId] } : undefined,
});
const work = (rows) => table(workFields, rows.map(order));

// ---- 工作預排（日期欄名故意對調：一律用 field id）----
const S = FIELD_SCHEDULE_FID;
const schedFields = [
  F("結束日期", "date", S.start), // fid 才是真起日，欄名反了
  F("開始日期", "date", S.end),
  F("業別", "select", S.trade),
  F("組別", "select", S.group),
  F("案件", "multiselect", S.job),
  F("人員", "multiselect", S.people),
];
const plan = ({ start, end = start, trade = "外業", group, caseIds = [], caseNos = caseIds }) => ({
  fields: { 結束日期: at(start), 開始日期: at(end), 業別: trade, 組別: group, 案件: caseNos.length ? caseNos : null, 人員: ["甲"] },
  links: caseIds.length ? { 案件: caseIds } : undefined,
});
const sched = (rows) => table(schedFields, rows.map(plan));

// ---- 案件表 ----
const caseFields = [{ ...F("案件編號"), primary: true }, F("案件名稱")];
const cases = (rows) => table(caseFields, rows.map(([id, no, name]) => ({ id, fields: { 案件編號: no, 案件名稱: name } })));

const run = (w, s, c, today = weekEnd + DAY) => buildFieldReport({ work: w, sched: s, cases: c, start: weekStart, end: weekEnd, today });
const caseRow = (r, id) => r.cases.find((c) => c.caseId === id);

test("組名去尾「組」比對：預排「水深A組」＝工作單「水深A」", () => {
  const r = run(work([{ day: 0, group: "水深A", caseId: "C1" }]), sched([{ start: 0, group: "水深A組", caseIds: ["C1"] }]));
  assert.equal(r.summary.planGroupDays, 1);
  assert.equal(r.summary.hitGroupDays, 1);
  assert.equal(r.summary.unplannedGroupDays, 0);
  assert.equal(caseRow(r, "C1").matchedGroupDays, 1);
  assert.equal(caseRow(r, "C1").result, "有排有做");
  assert.equal(r.exceptions.length, 0);
});

test("日期用 field id：欄名對調也不影響預排起訖", () => {
  const r = run(work([]), sched([{ start: 1, end: 3, group: "水深A組", caseIds: ["C1"] }]));
  assert.equal(r.summary.planGroupDays, 3);
});

test("ROV 預排一律算外業（業別填內業也算）；其他內業組不算", () => {
  const r = run(
    work([]),
    sched([
      { start: 0, trade: "內業", group: "ROV", caseIds: ["C1"] },
      { start: 1, trade: "外業", group: "ROV組", caseIds: ["C1"] },
      { start: 2, trade: "外業", group: "rov", caseIds: ["C1"] }, // 大小寫不拘，同一組
      { start: 0, trade: "內業", group: "圖資A", caseIds: ["C2"] }, // 不是外業
    ]),
  );
  assert.equal(r.summary.planGroupDays, 3);
  assert.equal(caseRow(r, "C2"), undefined);
});

test("案件用 record_id 比對：同編號不同 record 不可合併", () => {
  const c = cases([
    ["CA", "A100001", "甲案"],
    ["CB", "A100001", "乙案"], // 編號重複
  ]);
  const r = run(
    work([{ day: 0, group: "水深A", caseId: "CB", caseNo: "A100001" }]),
    sched([{ start: 0, group: "水深A組", caseIds: ["CA"], caseNos: ["A100001"] }]),
    c,
  );
  assert.equal(r.cases.length, 2);
  assert.equal(caseRow(r, "CA").result, "有排未做");
  assert.equal(caseRow(r, "CB").result, "未排有做");
  assert.equal(caseRow(r, "CA").name, "甲案");
  assert.equal(caseRow(r, "CB").name, "乙案");
  assert.equal(r.summary.caseOverlap, 0);
  // 組日層級仍算命中（同組同日有出工），案件層級吻合 0
  assert.equal(r.summary.hitGroupDays, 1);
  assert.equal(caseRow(r, "CA").matchedGroupDays, 0);
});

test("三種結果分類：有排有做／有排未做／未排有做", () => {
  const c = cases([["C1", "A1", "一"], ["C2", "A2", "二"], ["C3", "A3", "三"]]);
  const r = run(
    work([
      { day: 0, group: "水深A", caseId: "C1", pts: 2 },
      { day: 1, group: "點工B", caseId: "C3", pts: 1.5 },
    ]),
    sched([
      { start: 0, group: "水深A組", caseIds: ["C1"] },
      { start: 0, group: "水深C組", caseIds: ["C2"] },
    ]),
    c,
  );
  assert.equal(caseRow(r, "C1").result, "有排有做");
  assert.equal(caseRow(r, "C2").result, "有排未做");
  assert.equal(caseRow(r, "C3").result, "未排有做");
  assert.equal(caseRow(r, "C1").points, 2);
  assert.equal(caseRow(r, "C1").orders, 1);
  assert.equal(r.summary.planCases, 2);
  assert.equal(r.summary.actualCases, 2);
  assert.equal(r.summary.caseOverlap, 1);
  assert.equal(r.summary.planGroupDays, 2);
  assert.equal(r.summary.hitGroupDays, 1);
  assert.equal(r.summary.missedGroupDays, 1);
  assert.equal(r.summary.actualGroupDays, 2);
  assert.equal(r.summary.unplannedGroupDays, 1);
  const kinds = r.exceptions.map((e) => e.kind).sort();
  assert.deepEqual(kinds, ["有排未做", "未排有做"]);
});

test("連續日期合併成 起～迄；中斷就另起一列", () => {
  const r = run(
    work([
      { day: 0, group: "點工B", caseId: "C1", pts: 1 },
      { day: 1, group: "點工B", caseId: "C1", pts: 1 },
      { day: 2, group: "點工B", caseId: "C1", pts: 1 },
      { day: 4, group: "點工B", caseId: "C1", pts: 0.5 },
      { day: 1, group: "點工B", caseId: "C2", pts: 3 }, // 同組不同案：另一列
    ]),
    sched([]),
  );
  const rows = r.exceptions.filter((e) => e.kind === "未排有做" && e.caseId === "C1");
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].from, rows[0].to, rows[0].days, rows[0].points], [dayNo(0), dayNo(2), 3, 3]);
  assert.deepEqual([rows[1].from, rows[1].to, rows[1].days, rows[1].points], [dayNo(4), dayNo(4), 1, 0.5]);
  assert.equal(r.exceptions.filter((e) => e.caseId === "C2").length, 1);
});

test("預排多日沒做：有排未做也合併成一列", () => {
  const r = run(work([]), sched([{ start: 0, end: 2, group: "水深C組", caseIds: ["C9"] }]));
  const rows = r.exceptions.filter((e) => e.kind === "有排未做");
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].from, rows[0].to, rows[0].days, rows[0].group], [dayNo(0), dayNo(2), 0, "水深C"]);
});

test("排除行政／業務／內業／資訊組與未對應組別（工作單與預排都排）", () => {
  const r = run(
    work([
      { day: 0, group: "水深A", caseId: "C1" },
      { day: 0, group: "行政", caseId: "C2" },
      { day: 0, group: "業務", caseId: "C2" },
      { day: 0, group: "資訊組", caseId: "C2" },
      { day: 0, group: "recABCDEFGH", caseId: "C2" },
    ]),
    sched([
      { start: 0, group: "水深A組", caseIds: ["C1"] },
      { start: 0, trade: "外業", group: "行政組", caseIds: ["C2"] },
    ]),
  );
  assert.equal(r.summary.orders, 1);
  assert.equal(r.summary.actualGroupDays, 1);
  assert.equal(r.summary.planGroupDays, 1);
  assert.equal(caseRow(r, "C2"), undefined);
  assert.deepEqual(r.hiddenGroups.map((h) => h.group).sort(), ["recABCDEFGH", "業務", "行政", "資訊組"].sort());
});

test("預排日晚於今天的不算（本週尚未到的天不算有排未做）", () => {
  const r = run(work([]), sched([{ start: 1, end: 4, group: "水深C組", caseIds: ["C9"] }]), undefined, at(3)); // 今天＝day3
  // day1、day2 已到期；day3（今天）與 day4 還沒到期
  assert.equal(r.summary.planGroupDays, 2);
  assert.equal(r.exceptions.filter((e) => e.kind === "有排未做")[0].to, dayNo(2));
});

test("預排沒填案件：只算組日，不進案件比對；該組當天出工不算未排有做", () => {
  const r = run(work([{ day: 0, group: "水深A", caseId: "C1" }]), sched([{ start: 0, group: "水深A組", caseIds: [] }]));
  assert.equal(r.summary.planGroupDays, 1);
  assert.equal(r.summary.hitGroupDays, 1);
  assert.equal(r.exceptions.filter((e) => e.kind === "未排有做").length, 0);
  assert.equal(caseRow(r, "C1").result, "未排有做"); // 案件層級沒有任何預排指向它
});

test("工作單異常：突發狀況有填、已退回（trim）、修改後數量≠完成數量", () => {
  const r = run(
    work([
      { no: "W-A", day: 0, group: "點工B", caseId: "C1", incident: "下雨停工" },
      { no: "W-B", day: 1, group: "點工B", caseId: "C1", status: "已退回 " }, // 選項結尾有空白
      { no: "W-C", day: 3, group: "點工B", caseId: "C1", qty: 10, qtyFixed: 8 },
      { no: "W-D", day: 5, group: "點工B", caseId: "C1", qty: 10, qtyFixed: 10 }, // 相同：不算
      { no: "W-E", day: 6, group: "點工B", caseId: "C1", qty: 10, qtyFixed: null }, // 沒修改：不算
      { no: "W-F", day: 6, group: "點工B", caseId: "C1", incident: "  " }, // 空白字串不算
    ]),
    sched([{ start: 0, end: 6, group: "點工B", caseIds: ["C1"] }]),
  );
  const rows = r.exceptions.filter((e) => e.kind === "工作單異常");
  const text = rows.map((e) => e.desc.join("｜")).join("\n");
  assert.ok(text.includes("W-A") && text.includes("下雨停工"));
  assert.ok(text.includes("W-B") && text.includes("已退回"));
  assert.ok(text.includes("W-C") && text.includes("10") && text.includes("8"));
  assert.ok(!text.includes("W-D") && !text.includes("W-E") && !text.includes("W-F"));
  // day0、day1 連續 → 一列 0～1；day3 另一列
  assert.deepEqual(rows.map((e) => [e.from, e.to]), [[dayNo(0), dayNo(1)], [dayNo(3), dayNo(3)]]);
});

test("檢核待辦：依組統計外業經理未勾、控制組未勾、已退回", () => {
  const r = run(
    work([
      { day: 0, group: "水深A", caseId: "C1", mgr: true, ctrl: true },
      { day: 0, group: "水深A", caseId: "C1", mgr: false, ctrl: true },
      { day: 1, group: "水深A", caseId: "C1", mgr: false, ctrl: false, status: "已退回 " },
      { day: 1, group: "點工B", caseId: "C2", mgr: true, ctrl: false },
    ]),
    sched([]),
  );
  const a = r.checks.find((c) => c.group === "水深A");
  const b = r.checks.find((c) => c.group === "點工B");
  assert.deepEqual([a.orders, a.managerUnchecked, a.controlUnchecked, a.returned], [3, 2, 1, 1]);
  assert.deepEqual([b.orders, b.managerUnchecked, b.controlUnchecked, b.returned], [1, 0, 1, 0]);
  assert.deepEqual([r.checksTotal.orders, r.checksTotal.managerUnchecked, r.checksTotal.controlUnchecked, r.checksTotal.returned], [4, 2, 2, 1]);
});

test("週外的工作單不算；預排讀不到時不亂判「未排有做」，並註明", () => {
  const r = run(work([{ day: 9, group: "水深A", caseId: "C1" }, { day: 0, group: "水深A", caseId: "C2" }]), undefined);
  assert.equal(r.summary.orders, 1);
  assert.equal(r.scheduleOn, false);
  assert.equal(r.cases.length, 1);
  assert.equal(r.cases[0].result, "預排讀不到");
  assert.equal(r.exceptions.filter((e) => e.kind !== "工作單異常").length, 0);
  assert.equal(r.summary.unplannedGroupDays, 0);
  assert.ok(r.notes.some((n) => n.includes("預排")));
});

test("沒有 link record_id（示範資料）時退回用案件標題文字當鍵", () => {
  const w = work([
    { day: 0, group: "水深A", caseId: null, caseNo: "P-2601" },
    { day: 1, group: "水深A", caseId: null, caseNo: "P-2601" },
  ]);
  const r = run(w, undefined);
  assert.equal(r.cases.length, 1);
  assert.equal(r.cases[0].no, "P-2601");
  assert.equal(r.cases[0].orders, 2);
});

// ---- 走樣防護：fieldReport.ts 不 import 其他 lib 檔，口徑小工具各存一份，這裡對照 R01 ----
test("與 R01（controlGroup.ts）的組名、ROV、預排業別判斷一致", () => {
  const names = ["水深A組", "水深A", " 水深C組 ", "ROV", "rov組", "Rov", "圖報A", "控制組", "行政", "業務", "點工B", "奇穎組", ""];
  for (const g of names) {
    assert.equal(groupKey(g).toUpperCase(), cg.groupKey(g).toUpperCase(), `groupKey ${g}`);
    assert.equal(isRovGroup(g), cg.isRovGroup(g), `isRov ${g}`);
    for (const trade of ["外業", "內業", "行政", "業務", " 外業 ", ""]) assert.equal(keepFieldSchedule(trade, g), cg.keepFieldSchedule(trade, g), `keepSchedule ${trade}/${g}`);
  }
});

test("與 GroupBoard.tsx 的 R01 keepGroup 同一條規則（正規式原文相同）", () => {
  const src = readFileSync(new URL("../components/GroupBoard.tsx", import.meta.url), "utf8");
  assert.ok(src.includes(KEEP_GROUP_EXCLUDE.source), "GroupBoard 的 keepGroup 排除清單已改，fieldReport.ts 要同步");
  for (const g of ["行政", "業務", "內業", "資訊組", "IT", "it", "recABCDEFGH", "id"]) assert.equal(keepFieldGroup(g), false, g);
  for (const g of ["水深A", "點工B", "地形C", "奇穎組", "ROV", "（未填組別）", "Fit"]) assert.equal(keepFieldGroup(g), true, g);
});

test("未排有做列：已標「工作單異常」的單不重複列說明，只補未標異常但有備註的單", () => {
  const r = run(
    work([
      { no: "W-1", day: 0, group: "點工B", caseId: "C1", note: "請業主簽收" }, // 無異常、有備註 → 在未排有做列顯示
      { no: "W-2", day: 0, group: "點工B", caseId: "C1", incident: "下雨停工" }, // 有突發 → 只在工作單異常列
    ]),
    sched([]),
  );
  const un = r.exceptions.find((e) => e.kind === "未排有做");
  const ab = r.exceptions.find((e) => e.kind === "工作單異常");
  assert.ok(un.desc.join("｜").includes("W-1") && un.desc.join("｜").includes("請業主簽收"));
  assert.ok(!un.desc.join("｜").includes("W-2"));
  assert.ok(ab.desc.join("｜").includes("W-2") && ab.desc.join("｜").includes("下雨停工"));
  assert.equal(un.orders, 2); // 營業額與張數仍含這兩張
});

test("檢核欄是選項型（V4／示範）時，「通過」算已勾、「不通過」與空白算未勾", () => {
  const w = work([
    { day: 0, group: "水深A", caseId: "C1", ctrl: "通過", mgr: true },
    { day: 0, group: "水深A", caseId: "C1", ctrl: "不通過", mgr: false },
    { day: 0, group: "水深A", caseId: "C1", ctrl: null, mgr: null },
  ]);
  const r = run(w, sched([]));
  assert.deepEqual([r.checksTotal.controlUnchecked, r.checksTotal.managerUnchecked], [2, 2]);
});
