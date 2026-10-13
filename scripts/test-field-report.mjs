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

test("工程編號＝案件編號前 7 碼：完整編號重複的兩筆記錄合併成同一工程，且仍標編號重複", () => {
  const c = cases([
    ["CA", "A100001", "甲案"],
    ["CB", "A100001", "乙案"], // 編號重複
  ]);
  const r = run(
    work([{ day: 0, group: "水深A", caseId: "CB", caseNo: "A100001" }]),
    sched([{ start: 0, group: "水深A組", caseIds: ["CA"], caseNos: ["A100001"] }]),
    c,
  );
  assert.equal(r.cases.length, 1);
  const row = caseRow(r, "P:A100001");
  assert.equal(row.result, "有排有做");
  assert.equal(row.no, "A100001");
  assert.equal(row.dup, true);
  assert.equal(row.name, "甲案等 2 案");
  assert.equal(r.summary.caseOverlap, 1);
  assert.equal(row.matchedGroupDays, 1);
});

test("母案＋子案合併成同一工程：預排連母案、工作單連子案 → 一列有排有做，不是兩列異常", () => {
  const c = cases([["KP", "C115016", "母案工程"], ["KC", "C115016-2-1", "子案工程"], ["KA", "C115016A", "母案工程"]]);
  const r = run(
    work([{ day: 0, group: "水深A", caseId: "KC", caseNo: "C115016-2-1", pts: 2 }, { day: 0, group: "水深A", caseId: "KA", caseNo: "C115016A", pts: 1 }]),
    sched([{ start: 0, group: "水深A組", caseIds: ["KP"], caseNos: ["C115016"] }]),
    c,
  );
  assert.equal(r.cases.length, 1);
  const row = r.cases[0];
  assert.equal(row.caseId, "P:C115016");
  assert.equal(row.no, "C115016");
  assert.equal(row.result, "有排有做");
  assert.equal(row.points, 3);
  assert.equal(row.orders, 2);
  assert.equal(row.planGroupDays, 1);
  assert.equal(row.actualGroupDays, 1);
  assert.equal(row.matchedGroupDays, 1);
  assert.equal(row.name, "母案工程等 3 案"); // 本週涉及 KP（預排）、KC、KA（工作單）三筆案件記錄
  assert.equal(r.exceptions.filter((e) => e.kind !== "工作單異常").length, 0);
  assert.equal(r.summary.planCases, 1);
  assert.equal(r.summary.actualCases, 1);
  assert.equal(r.summary.caseOverlap, 1);
});

test("小寫 c115223、前後空白視為 C115223", () => {
  const c = cases([["KA", " c115223 ", "小寫案"], ["KB", "C115223-1", "後綴案"]]);
  const r = run(work([{ day: 0, group: "水深A", caseId: "KA", caseNo: "c115223" }]), sched([{ start: 0, group: "水深A組", caseIds: ["KB"], caseNos: ["C115223-1"] }]), c);
  assert.equal(r.cases.length, 1);
  assert.equal(r.cases[0].no, "C115223");
  assert.equal(r.cases[0].result, "有排有做");
});

test("C000000 占位碼兩筆不合併：各自一列（鍵＝record_id）並標編號重複", () => {
  const c = cases([["Z1", "C000000", "占位一"], ["Z2", "C000000", "占位二"]]);
  const r = run(work([{ day: 0, group: "水深A", caseId: "Z2", caseNo: "C000000" }]), sched([{ start: 0, group: "水深A組", caseIds: ["Z1"], caseNos: ["C000000"] }]), c);
  assert.equal(r.cases.length, 2);
  assert.equal(caseRow(r, "Z1").result, "有排未做");
  assert.equal(caseRow(r, "Z2").result, "未排有做");
  assert.equal(caseRow(r, "Z1").dup, true);
  assert.equal(caseRow(r, "Z2").dup, true);
  assert.equal(r.summary.caseOverlap, 0);
});

test("不符格式（115526、空白）不合併：一案一列，用 record_id", () => {
  const c = cases([["N1", "115526", "六碼"], ["N2", "115526-1", "六碼後綴"], ["N3", "", "空白編號"]]);
  const r = run(work([{ day: 0, group: "水深A", caseId: "N2", caseNo: "115526-1" }]), sched([{ start: 0, group: "水深A組", caseIds: ["N1", "N3"], caseNos: ["115526", ""] }]), c);
  assert.deepEqual(r.cases.map((x) => x.caseId).sort(), ["N1", "N2", "N3"]);
  assert.equal(caseRow(r, "N1").result, "有排未做");
  assert.equal(caseRow(r, "N2").result, "未排有做");
  assert.equal(caseRow(r, "N1").dup, false);
});

test("異常列以工程分組：不同子案的未排有做併成工程一列（連續日期合併）", () => {
  const c = cases([["KP", "C115016", "母案"], ["KC", "C115016-2-1", "子案"], ["KD", "D200001", "他案"]]);
  const r = run(
    work([{ day: 0, group: "水深A", caseId: "KC", caseNo: "C115016-2-1" }, { day: 1, group: "水深A", caseId: "KP", caseNo: "C115016" }]),
    sched([{ start: 3, group: "水深A組", caseIds: ["KD"], caseNos: ["D200001"] }]),
    c,
  );
  const unplanned = r.exceptions.filter((e) => e.kind === "未排有做");
  assert.equal(unplanned.length, 1);
  assert.equal(unplanned[0].caseId, "P:C115016");
  assert.equal(unplanned[0].no, "C115016");
  assert.equal(unplanned[0].from, dayNo(0));
  assert.equal(unplanned[0].to, dayNo(1));
  assert.equal(unplanned[0].days, 2);
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

// 工程編號規則表（engineeringCode）與 R09／R10 兩份一致的比對，統一放在 test-internal-report.mjs。

test("第 8 碼是數字的打錯編號（A1150174）不併進 A115017：各自一列，用 record_id", () => {
  const c = cases([["X1", "A1150174", "打錯案"], ["X2", "A115017", "正確案"]]);
  const r = run(work([{ day: 0, group: "水深A", caseId: "X1", caseNo: "A1150174" }]), sched([{ start: 0, group: "水深A組", caseIds: ["X2"], caseNos: ["A115017"] }]), c);
  assert.deepEqual(r.cases.map((x) => x.caseId).sort(), ["P:A115017", "X1"]);
  assert.equal(caseRow(r, "X1").no, "A1150174");
  assert.equal(caseRow(r, "X1").result, "未排有做");
});

test("案件表查得到該記錄、但編號空白：維持 record_id，不退回用 link 標題合併", () => {
  const c = cases([["K1", "", "空白編號"], ["K2", "C115016", "真案"]]);
  const r = run(work([{ day: 0, group: "水深A", caseId: "K2", caseNo: "C115016" }]), sched([{ start: 0, group: "水深A組", caseIds: ["K1"], caseNos: ["C115016"] }]), c);
  assert.deepEqual(r.cases.map((x) => x.caseId).sort(), ["K1", "P:C115016"]);
  assert.equal(caseRow(r, "K1").result, "有排未做");
  assert.equal(caseRow(r, "P:C115016").result, "未排有做");
});

test("案件表寫 C000000、link 標題寫 C115016：以案件表為準，不合併（釘住取值順序）", () => {
  const c = cases([["K1", "C000000", "占位"], ["K2", "C115016", "真案"]]);
  const r = run(work([{ day: 0, group: "水深A", caseId: "K2", caseNo: "C115016" }]), sched([{ start: 0, group: "水深A組", caseIds: ["K1"], caseNos: ["C115016"] }]), c);
  assert.deepEqual(r.cases.map((x) => x.caseId).sort(), ["K1", "P:C115016"]);
});

test("記錄不在案件表裡：才用標題文字備援合併", () => {
  const c = cases([["OTHER", "C200001", "別案"]]);
  const r = run(work([{ day: 0, group: "水深A", caseId: "GONE", caseNo: "C115016-2" }]), sched([{ start: 0, group: "水深A組", caseIds: ["GONE2"], caseNos: ["C115016"] }]), c);
  assert.equal(r.cases.length, 1);
  assert.equal(r.cases[0].caseId, "P:C115016");
  assert.equal(r.cases[0].result, "有排有做");
});

test("沒有案件表：工作單與預排的標題文字 C115016-2 與 C115016 合併成同一工程（無 record_id）", () => {
  const r = run(work([{ day: 0, group: "水深A", caseId: null, caseNo: "C115016-2" }]), sched([{ start: 0, group: "水深A組", caseIds: [], caseNos: ["C115016"] }]), undefined);
  assert.equal(r.cases.length, 1);
  assert.equal(r.cases[0].caseId, "P:C115016");
  assert.equal(r.cases[0].no, "C115016");
  assert.equal(r.cases[0].result, "有排有做");
  assert.equal(r.cases[0].matchedGroupDays, 1);
});

test("沒有案件表、有 record_id：同樣用標題文字合併", () => {
  const r = run(work([{ day: 0, group: "水深A", caseId: "x2", caseNo: "C115016-2" }]), sched([{ start: 0, group: "水深A組", caseIds: ["x1"], caseNos: ["C115016"] }]), undefined);
  assert.equal(r.cases.length, 1);
  assert.equal(r.cases[0].caseId, "P:C115016");
  assert.equal(r.cases[0].result, "有排有做");
});

test("沒有案件表時，畫面上兩列顯示相同完整編號要標編號重複（C000000 ×2）", () => {
  const r = run(
    work([{ day: 0, group: "水深A", caseId: "y", caseNo: "C000000" }]),
    sched([{ start: 0, group: "水深A組", caseIds: ["x", "w"], caseNos: ["C000000", "C100009"] }]),
    undefined,
  );
  assert.equal(r.cases.length, 3);
  assert.deepEqual(r.cases.filter((x) => x.dup).map((x) => x.caseId).sort(), ["x", "y"]);
});

const bigContract = () => cases([["KP", "C115016", "母案工程"], ["K1", "C115016-1", "舊子案甲"], ["K2", "C115016-2", "舊子案乙"], ["K3", "C115016-3", "舊子案丙"], ["KQ", "C115016A", "舊子案丁"]]);

test("工程名稱只看本週涉及的案件：開口契約大工程只涉及母案 → 名稱就是母案名稱，不顯示「等 n 案」", () => {
  const r = run(work([{ day: 0, group: "水深A", caseId: "KP", caseNo: "C115016" }]), sched([{ start: 0, group: "水深A組", caseIds: ["KP"], caseNos: ["C115016"] }]), bigContract());
  assert.equal(r.cases.length, 1);
  assert.equal(r.cases[0].name, "母案工程");
  assert.equal(r.cases[0].dup, false);
});

test("工程名稱「等 n 案」的 n＝本週涉及的不重複案件記錄數；名稱取編號排序最前（母案）", () => {
  const r = run(work([{ day: 0, group: "水深A", caseId: "K3", caseNo: "C115016-3" }]), sched([{ start: 0, group: "水深A組", caseIds: ["K2", "KP"], caseNos: ["C115016-2", "C115016"] }]), bigContract());
  assert.equal(r.cases.length, 1);
  assert.equal(r.cases[0].name, "母案工程等 3 案");
});

test("編號重複只看本週涉及的案件：涉及的那筆編號在案件表出現兩次才標", () => {
  const c = cases([["KP", "C115016", "母案"], ["KP2", "C115016", "同編號另一筆"]]);
  const r = run(work([{ day: 0, group: "水深A", caseId: "KP", caseNo: "C115016" }]), sched([{ start: 0, group: "水深A組", caseIds: ["KP"], caseNos: ["C115016"] }]), c);
  assert.equal(r.cases[0].dup, true);
});

// ================= 第二輪審查：編號重複統一規則／名稱備援／等 n 案不重複計 =================
const wk = (caseId, caseNo) => work([{ day: 0, group: "水深A", caseId, caseNo }]);
const sc = (caseIds, caseNos = caseIds) => sched([{ start: 0, group: "水深A組", caseIds, caseNos }]);

test("無案件表、工作單連 r2、預排連 r1、標題都是 C115016：合併成 P:C115016 一列且標編號重複", () => {
  const r = run(wk("r2", "C115016"), sc(["r1"], ["C115016"]), undefined);
  assert.equal(r.cases.length, 1);
  assert.equal(r.cases[0].caseId, "P:C115016");
  assert.equal(r.cases[0].dup, true);
});

test("有案件表、兩個不在表裡的 record_id 標題都是 C000000：各自一列、都標編號重複", () => {
  const r = run(wk("g1", "C000000"), sc(["g2"], ["C000000"]), cases([["O", "C200001", "別案"]]));
  assert.equal(r.cases.length, 2);
  assert.deepEqual(r.cases.map((x) => x.dup), [true, true]);
});

test("編號重複大小寫、前後空白不敏感（無案件表；有案件表 c115016 在表裡出現兩次）", () => {
  const r1 = run(wk("r2", " c115016 "), sc(["r1"], ["C115016"]), undefined);
  assert.equal(r1.cases[0].dup, true);
  const r2 = run(wk("KP", "C115016"), sc(["KP"], ["C115016"]), cases([["KP", "c115016", "母案"], ["KP2", "C115016", "另一筆"]]));
  assert.equal(r2.cases[0].dup, true);
});

test("同工程內「本週沒涉及」的記錄編號重複 → 不標；沒重複的也不誤標", () => {
  const c = cases([["KP", "C115016", "母案"], ["KX", "C115016-1", "子案甲"], ["KY", "C115016-1", "子案乙"], ["KZ", "C115016-9", "子案丙"]]);
  const r = run(wk("KZ", "C115016-9"), sc(["KP"], ["C115016"]), c);
  assert.equal(r.cases.length, 1);
  assert.equal(r.cases[0].dup, false);
});

test("記錄不在案件表：名稱用案件表「完整編號唯一」備援（不是空白）；沒 link 只有編號文字也一樣；不合併單列也一樣", () => {
  const c = cases([["KP", "C115016", "母案工程"]]);
  const r1 = run(wk("GONE", "C115016"), sc(["GONE"], ["C115016"]), c);
  assert.equal(r1.cases[0].name, "母案工程");
  const r2 = run(wk(null, "C115016"), sc([], ["C115016"]), c);
  assert.equal(r2.cases[0].name, "母案工程");
  const r3 = run(wk("GONE", "115526"), sc(["GONE"], ["115526"]), cases([["N1", "115526", "六碼案"]]));
  assert.equal(r3.cases[0].name, "六碼案");
});

test("「等 n 案」不重複計同一案：W1 連 KP、W2 沒 link 但編號文字 C115016 → 不顯示「等 2 案」", () => {
  const w = work([{ day: 0, group: "水深A", caseId: "KP", caseNo: "C115016" }, { day: 1, group: "水深A", caseId: null, caseNo: "C115016" }]);
  const r = run(w, sc(["KP"], ["C115016"]), bigContract());
  assert.equal(r.cases.length, 1);
  assert.equal(r.cases[0].name, "母案工程");
  const r2 = run(w, sc(["KP"], ["C115016"]), undefined);
  assert.equal(r2.cases[0].dup, false);
});

test("R10 合併路徑：沒 link 的文字標題用案件表編號補名稱（t: 標題）", () => {
  const c = cases([["KP", "C115016", "母案工程"], ["KC", "C115016-2", "子案工程"]]);
  const r = run(wk(null, "C115016-2"), sc(["KP"], ["C115016"]), c);
  assert.equal(r.cases[0].name, "母案工程等 2 案");
});
