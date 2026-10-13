// R09 內業報告邏輯測試（不連 Lark）。lib/internalReport.ts 的純函式。
// Usage: node --test scripts/test-internal-report.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInternalReport, mergeDayRuns, engineeringCode } from "../lib/internalReport.ts";
import { engineeringCode as fieldEngineeringCode } from "../lib/fieldReport.ts";

const DAY = 86400000;
const TZ = 8 * 3600000;
const weekStart = Date.UTC(2026, 9, 5) - TZ; // Mon 2026-10-05 00:00 Taipei
const weekEnd = weekStart + 7 * DAY;
const at = (d) => weekStart + d * DAY + 9 * 3600000; // d=0 is Monday
const dayNo = (d) => Math.floor((at(d) + TZ) / DAY);

const F = (name, kind = "text", id = name, primary = false) => ({ id, name, kind, primary });
const table = (fields, rows) => ({
  table: { id: "t", name: "t" },
  fields,
  records: rows.map((r, i) => ({ id: r.id ?? `rec${i}`, fields: r.fields, links: r.links })),
  fetchedAt: 0,
  source: "lark",
  complete: true,
  total: rows.length,
});

// ---- 預排表：欄 id 直接寫死真實 V3 的 id（不引用被測模組的常數，常數被改壞測試才抓得到）；起訖欄名故意對調（模擬 UI 曾經改反）----
const schedFields = [
  F("日期", "text", "fldZ3yBlLD", true),
  F("結束日期", "date", "fldMXOggGP"), // 真起日，欄名是反的
  F("開始日期", "date", "fldjWv1xST"), // 真訖日，欄名是反的
  F("業別", "select", "fldrENe4H6"),
  F("組別", "select", "fldNDUy2XP"),
  F("人員", "multiselect", "fld7KNCsVe"),
  F("案件", "multiselect", "fldnzMsrzZ"),
  F("條類型", "select", "fld78OmLVn"),
  F("預估營業額點數", "number", "fld5lTSN1r"),
  F("備註", "text", "fldpFvkV6G"),
];
// ppl: [[id, name], ...]；cases: [[id, code], ...]
const planRow = ({ s, e = s, trade = "內業", group = "控制組", ppl, cases = [], kind = "出工", note = null }) => ({
  fields: { 日期: "x", 結束日期: at(s), 開始日期: at(e), 業別: trade, 組別: group, 人員: ppl.map((p) => p[1]), 案件: cases.map((c) => c[1]), 條類型: kind, 預估營業額點數: null, 備註: note },
  links: { 人員: ppl.map((p) => p[0]), 案件: cases.map((c) => c[0]) },
});
const sched = (rows) => table(schedFields, rows.map(planRow));

// ---- 內業成本單 ----
const costFields = [F("單號", "text", "c1", true), F("工作日期", "date"), F("內業組別", "select"), F("填報人", "multiselect"), F("出工成本總計", "number"), F("人力成本", "number")];
const cost = (rows) =>
  table(
    costFields,
    rows.map((r) => ({ id: r.id, fields: { 單號: r.title ?? "同標題", 工作日期: at(r.day), 內業組別: r.team ?? "控制", 填報人: [r.who], 出工成本總計: 4900, 人力成本: 4900 }, links: { 填報人: [r.whoId] } })),
  );

// ---- 內業工作單 ----
const workFields = [
  F("工作單號", "text", "w1", true),
  F("所屬成本單", "multiselect"),
  F("所屬案件", "multiselect"),
  F("案件編號", "text"),
  F("最終營業額點數", "number"),
  F("備註", "text"),
  F("檢核狀態", "select"),
  F("⚠組別權重=0", "text"),
  F("⚠案件不符", "text"),
  F("⚠工項不符", "text"),
  F("工作日期-營業額明細", "date"),
];
const workRow = (r) => ({
  fields: {
    工作單號: r.no,
    所屬成本單: r.costId ? [r.costTitle ?? "同標題"] : r.costTitle ? [r.costTitle] : null,
    所屬案件: r.caseId ? [r.code] : null,
    案件編號: r.code ?? null,
    最終營業額點數: r.pts ?? null,
    備註: r.note ?? null,
    檢核狀態: r.status ?? null,
    "⚠組別權重=0": r.w0 ? "⚠組別權重=0" : null,
    "⚠案件不符": r.wCase ? "⚠此明細不屬於所選案件" : null,
    "⚠工項不符": r.wItem ? "⚠此工項所屬組別在所選明細無權重" : null,
    "工作日期-營業額明細": r.fday === undefined ? null : at(r.fday),
  },
  links: { ...(r.costId ? { 所屬成本單: [r.costId] } : {}), ...(r.caseId ? { 所屬案件: [r.caseId] } : {}) },
});
const work = (rows) => table(workFields, rows.map(workRow));

const casesTable = (rows) => table([F("案件編號", "text", "k1", true), F("案件名稱", "text")], rows.map(([id, code, name]) => ({ id, fields: { 案件編號: code, 案件名稱: name } })));

const run = (w, c, s, k) => buildInternalReport({ work: w, cost: c, sched: s, cases: k, start: weekStart, end: weekEnd });
const A = ["pA", "甲"], B = ["pB", "乙"], C = ["pC", "丙"];
const K1 = ["k1", "C100001"], K2 = ["k2", "C100002"], K3 = ["k3", "C100003"];
const person = (b, id) => b.people.find((p) => p.personId === id);

// ================= 預排：人員展開、同日去重、排除 =================
test("多人預排條逐人展開：兩個人各自有預排人日", () => {
  const b = run(work([]), cost([]), sched([{ s: 0, e: 1, ppl: [A, B] }]));
  assert.equal(person(b, "pA").plannedDays, 2);
  assert.equal(person(b, "pB").plannedDays, 2);
  assert.equal(b.summary.plannedDays, 4);
  assert.equal(b.summary.plannedPeople, 2);
});

test("同人同日兩條預排（不論案件）只算 1 人日", () => {
  const b = run(work([]), cost([]), sched([
    { s: 0, ppl: [A], cases: [K1] },
    { s: 0, ppl: [A], cases: [K2] },
    { s: 0, e: 1, ppl: [A], cases: [K1] },
  ]));
  assert.equal(person(b, "pA").plannedDays, 2);
  assert.equal(b.summary.plannedDays, 2);
});

test("ROV、休假條、非內業業別都不算內業預排", () => {
  const b = run(work([]), cost([]), sched([
    { s: 0, ppl: [A], group: "ROV" },
    { s: 0, ppl: [A], group: "rov組" },
    { s: 1, ppl: [B], kind: "休假" },
    { s: 2, ppl: [C], trade: "外業" },
    { s: 3, ppl: [C], trade: "行政", group: "行政" },
  ]));
  assert.equal(b.people.length, 0);
  assert.equal(b.summary.plannedDays, 0);
});

test("預排日期認欄 id，不看欄名（欄名被對調也照 fldMXOggGP 起、fldjWv1xST 訖）", () => {
  const b = run(work([]), cost([]), sched([{ s: 1, e: 3, ppl: [A] }]));
  assert.equal(person(b, "pA").plannedDays, 3);
});

test("只算所選週內的日子", () => {
  const b = run(work([]), cost([]), sched([{ s: -2, e: 0, ppl: [A] }, { s: 6, e: 9, ppl: [B] }]));
  assert.equal(person(b, "pA").plannedDays, 1);
  assert.equal(person(b, "pB").plannedDays, 1);
});

// ================= 工作單經成本單取人與日期 =================
test("工作單經成本單 record_id 取人與日期：成本單標題重複也不誤配", () => {
  const c = cost([
    { id: "C1", title: "同標題", day: 0, who: "甲", whoId: "pA", team: "控制" },
    { id: "C2", title: "同標題", day: 3, who: "乙", whoId: "pB", team: "圖報A" },
  ]);
  const w = work([
    { no: "W1", costId: "C1", caseId: "k1", code: "C100001", pts: 1 },
    { no: "W2", costId: "C2", caseId: "k1", code: "C100001", pts: 5 },
  ]);
  const b = run(w, c, sched([]), casesTable([["k1", "C100001", "測試工程"]]));
  assert.equal(person(b, "pA").revenue, 1);
  assert.equal(person(b, "pB").revenue, 5);
  assert.deepEqual(person(b, "pA").teams, ["控制"]);
  assert.deepEqual(person(b, "pB").teams, ["圖報A"]);
  // 日期也要是各自成本單的日期
  assert.equal(person(b, "pB").actualDays, 1);
  const row = b.exceptions.find((e) => e.personId === "pB");
  assert.equal(row.from, dayNo(3));
});

test("沒有 link record_id（示範資料）時，標題唯一才備援；重複標題不猜", () => {
  const c = cost([
    { id: "C1", title: "唯一標題", day: 0, who: "甲", whoId: "pA" },
    { id: "C2", title: "重複", day: 1, who: "乙", whoId: "pB" },
    { id: "C3", title: "重複", day: 2, who: "丙", whoId: "pC" },
  ]);
  const w = work([
    { no: "W1", costTitle: "唯一標題", pts: 2 },
    { no: "W2", costTitle: "重複", pts: 3 },
  ]);
  const b = run(w, c, sched([]));
  assert.equal(person(b, "pA").revenue, 2);
  assert.equal(person(b, "pB").revenue, 0);
  assert.equal(person(b, "pC").revenue, 0);
  assert.equal(b.stats.unmatchedOrders, 1);
});

test("工作單的 link 指到週外成本單：不算本週；成本單對不到時用「工作日期-營業額明細」備援日期", () => {
  const c = cost([{ id: "C1", title: "T", day: 9, who: "甲", whoId: "pA" }]);
  const w = work([
    { no: "W1", costId: "C1", pts: 1 }, // 成本單在週外
    { no: "W2", costId: "NOPE", pts: 2, fday: 1 }, // 對不到成本單，但公式日期在本週
  ]);
  const b = run(w, c, sched([]));
  assert.equal(b.summary.orders, 1);
  assert.equal(b.summary.revenue, 2);
  assert.equal(b.stats.unmatchedOrders, 1);
});

test("實際人日＝本週成本單的不重複（人，日）；沒有工作單的成本單也算", () => {
  const c = cost([
    { id: "C1", day: 0, who: "甲", whoId: "pA" },
    { id: "C2", day: 0, who: "甲", whoId: "pA" }, // 同人同日兩張成本單
    { id: "C3", day: 1, who: "甲", whoId: "pA" }, // 這天沒有工作單
  ]);
  const w = work([{ no: "W1", costId: "C1", caseId: "k1", code: "C100001", pts: 1 }]);
  const b = run(w, c, sched([]));
  assert.equal(person(b, "pA").actualDays, 2);
  assert.equal(b.summary.actualDays, 2);
});

// ================= 吻合、有排未填、未排有填 =================
test("未排有填／有排未填／吻合 分類與人日達成率", () => {
  const c = cost([
    { id: "C1", day: 0, who: "甲", whoId: "pA" }, // 吻合
    { id: "C2", day: 1, who: "甲", whoId: "pA" }, // 吻合
    { id: "C3", day: 2, who: "甲", whoId: "pA" }, // 未排有填
    { id: "C4", day: 0, who: "乙", whoId: "pB" }, // 乙整週只填這天，且沒排 → 未排有填
  ]);
  const s = sched([
    { s: 0, e: 1, ppl: [A], cases: [K1] },
    { s: 3, ppl: [A], cases: [K1] }, // 有排未填
    { s: 4, ppl: [C], cases: [K2] }, // 丙有排未填，且整週沒成本單
  ]);
  const b = run(work([]), c, s);
  assert.equal(person(b, "pA").matched, 2);
  assert.equal(person(b, "pA").plannedOnly, 1);
  assert.equal(person(b, "pA").actualOnly, 1);
  assert.equal(person(b, "pB").actualOnly, 1);
  assert.equal(person(b, "pB").plannedDays, 0);
  assert.equal(person(b, "pC").plannedOnly, 1);
  assert.equal(person(b, "pC").actualDays, 0);
  assert.equal(b.summary.plannedDays, 4);
  assert.equal(b.summary.actualDays, 4);
  assert.equal(b.summary.matched, 2);
  assert.equal(b.summary.plannedOnly, 2);
  assert.equal(b.summary.actualOnly, 2);
  assert.equal(b.summary.achievement, 0.5); // 吻合 ÷ 預排人日
  const kinds = b.exceptions.map((e) => e.kinds.join("+")).sort();
  assert.deepEqual(kinds, ["有排未填", "有排未填", "未排有填", "未排有填"]);
});

test("沒有任何預排時人日達成率是 null，不除以 0", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const b = run(work([]), c, sched([]));
  assert.equal(b.summary.achievement, null);
});

test("預排表讀不到：不產生有排未填／未排有填，並說明", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const b = run(work([]), c, undefined);
  assert.equal(b.summary.plannedDays, 0);
  assert.equal(b.exceptions.length, 0);
  assert.ok(b.notes.some((n) => n.includes("預排")));
});

// ================= 連續日期合併 =================
test("mergeDayRuns：連續日期合成 起～迄，斷開就分段", () => {
  assert.deepEqual(mergeDayRuns([5, 3, 4, 8, 3]), [
    { from: 3, to: 5, days: 3 },
    { from: 8, to: 8, days: 1 },
  ]);
  assert.deepEqual(mergeDayRuns([]), []);
});

test("同人同案連續日期合併成一列（起～迄、天數）；不同案、不連續各自一列", () => {
  const s = sched([
    { s: 0, e: 2, ppl: [A], cases: [K1] }, // 週一到三
    { s: 4, ppl: [A], cases: [K1] }, // 週五（不連續）
    { s: 0, e: 1, ppl: [A], cases: [K2] }, // 另一案
  ]);
  const b = run(work([]), cost([]), s, casesTable([["k1", "C100001", "甲工程"], ["k2", "C100002", "乙工程"]]));
  const rows = b.exceptions.filter((e) => e.kinds[0] === "有排未填");
  assert.equal(rows.length, 3);
  const r1 = rows.find((r) => r.caseId === "P:C100001" && r.days === 3);
  assert.equal(r1.from, dayNo(0));
  assert.equal(r1.to, dayNo(2));
  assert.equal(r1.name, "甲工程");
  assert.equal(r1.code, "C100001");
  assert.ok(rows.find((r) => r.caseId === "P:C100001" && r.days === 1 && r.from === dayNo(4)));
  assert.ok(rows.find((r) => r.caseId === "P:C100002" && r.days === 2));
});

// ================= 案件比對 =================
test("案件結果：有排有做／有排未做／未排有做，用案件 record_id", () => {
  const c = cost([
    { id: "C1", day: 0, who: "甲", whoId: "pA" },
    { id: "C2", day: 1, who: "甲", whoId: "pA" },
  ]);
  const w = work([
    { no: "W1", costId: "C1", caseId: "k1", code: "C100001", pts: 1 },
    { no: "W2", costId: "C1", caseId: "k1", code: "C100001", pts: 0.5 },
    { no: "W3", costId: "C2", caseId: "k3", code: "C100003", pts: 2 },
  ]);
  const s = sched([
    { s: 0, ppl: [A], cases: [K1] }, // 有排有做
    { s: 0, ppl: [B], cases: [K2] }, // 有排未做
    { s: 1, ppl: [A], cases: [K1, K2] }, // 一條排兩案：k1、k2 各算 1 人日
  ]);
  const b = run(w, c, s, casesTable([["k1", "C100001", "甲工程"], ["k2", "C100002", "乙工程"], ["k3", "C100003", "丙工程"]]));
  const byId = (id) => b.cases.find((r) => r.caseId === id);
  assert.equal(byId("P:C100001").result, "有排有做");
  assert.equal(byId("P:C100001").plannedDays, 2);
  assert.equal(byId("P:C100001").actualDays, 1); // 只有週一這天有 k1 的工作單
  assert.equal(byId("P:C100001").orders, 2);
  assert.equal(byId("P:C100001").revenue, 1.5);
  assert.equal(byId("P:C100002").result, "有排未做");
  assert.equal(byId("P:C100002").plannedDays, 2);
  assert.equal(byId("P:C100002").orders, 0);
  assert.equal(byId("P:C100003").result, "未排有做");
  assert.equal(byId("P:C100003").name, "丙工程");
  assert.deepEqual(b.caseSummary, { planned: 2, plannedWithOrders: 1, plannedNoOrders: 1, actual: 2, unplanned: 1 });
});

// ================= 異常與人工確認 =================
test("⚠ 亮燈與已退回的單列入人工確認，同人同案同類別連續日期合併、備註原文保留", () => {
  const c = cost([
    { id: "C1", day: 0, who: "甲", whoId: "pA", team: "圖報A" },
    { id: "C2", day: 1, who: "甲", whoId: "pA", team: "圖報A" },
    { id: "C3", day: 3, who: "乙", whoId: "pB" },
  ]);
  const w = work([
    { no: "W1", costId: "C1", caseId: "k1", code: "C100001", pts: 1, w0: true, note: "第一天備註" },
    { no: "W2", costId: "C2", caseId: "k1", code: "C100001", pts: 2, w0: true, note: "第二天備註" },
    { no: "W3", costId: "C3", caseId: "k2", code: "C100002", pts: 0.5, wCase: true, wItem: true, status: "已退回", note: "退回說明" },
    { no: "W4", costId: "C3", caseId: "k2", code: "C100002", pts: 1, status: "已通過" },
  ]);
  const s = sched([
    { s: 0, e: 1, ppl: [A], cases: [K1] },
    { s: 3, ppl: [B], cases: [K2] },
  ]);
  const b = run(w, c, s, casesTable([["k1", "C100001", "甲工程"], ["k2", "C100002", "乙工程"]]));
  assert.deepEqual(b.flagCounts, { "⚠組別權重=0": 2, "⚠案件不符": 1, "⚠工項不符": 1 });
  assert.equal(b.returned, 1);
  assert.equal(b.exceptions.filter((e) => e.kinds[0] === "有排未填" || e.kinds[0] === "未排有填").length, 0); // 全部吻合
  assert.equal(b.exceptions.length, 2);
  const merged = b.exceptions.find((e) => e.personId === "pA");
  assert.deepEqual(merged.kinds, ["⚠組別權重=0"]);
  assert.equal(merged.days, 2);
  assert.equal(merged.revenue, 3);
  assert.equal(merged.team, "圖報A");
  assert.ok(merged.note.includes("第一天備註") && merged.note.includes("第二天備註"));
  const ret = b.exceptions.find((e) => e.personId === "pB");
  assert.deepEqual(ret.kinds, ["⚠案件不符", "⚠工項不符", "已退回"]);
  assert.equal(ret.revenue, 0.5); // 只算亮燈／退回的那張單
  assert.equal(ret.note, "退回說明");
});

test("未排有填列出點數與備註，有排未填沒有營業額", () => {
  const c = cost([{ id: "C1", day: 2, who: "甲", whoId: "pA" }]);
  const w = work([{ no: "W1", costId: "C1", caseId: "k1", code: "C100001", pts: 1.25, note: "臨時支援" }]);
  const s = sched([{ s: 4, ppl: [A], cases: [K2], note: "預排備註 X" }]);
  const b = run(w, c, s, casesTable([["k1", "C100001", "甲工程"], ["k2", "C100002", "乙工程"]]));
  const filled = b.exceptions.find((e) => e.kinds[0] === "未排有填");
  assert.equal(filled.revenue, 1.25);
  assert.equal(filled.note, "臨時支援");
  assert.equal(filled.code, "C100001");
  const planned = b.exceptions.find((e) => e.kinds[0] === "有排未填");
  assert.equal(planned.revenue, null);
  assert.equal(planned.code, "C100002");
  assert.equal(planned.note, "預排備註：預排備註 X");
});

test("有排未填的組別：用該人本週成本單的組別；整週沒填就退回預排上的組別（去掉結尾「組」）", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA", team: "圖報A" }]);
  const s = sched([
    { s: 3, ppl: [A], cases: [K1], group: "控制組" },
    { s: 3, ppl: [C], cases: [K1], group: "圖報B組" },
  ]);
  const b = run(work([]), c, s);
  assert.equal(b.exceptions.find((e) => e.personId === "pA" && e.kinds[0] === "有排未填").team, "圖報A");
  assert.equal(b.exceptions.find((e) => e.personId === "pC").team, "圖報B");
});

// ================= 跨組顯示、敏感欄位 =================
test("同一人本週在兩個內業組別填單：一人一列，名字後面接組別", () => {
  const c = cost([
    { id: "C1", day: 0, who: "甲", whoId: "pA", team: "控制" },
    { id: "C2", day: 1, who: "甲", whoId: "pA", team: "圖報A" },
    { id: "C3", day: 0, who: "乙", whoId: "pB", team: "控制" },
  ]);
  const b = run(work([]), c, sched([]));
  assert.equal(b.people.filter((p) => p.personId === "pA").length, 1);
  assert.equal(person(b, "pA").label, "甲・控制／圖報A");
  assert.equal(person(b, "pA").teamText, "跨組");
  assert.equal(person(b, "pB").label, "乙");
  assert.equal(person(b, "pB").teamText, "控制");
});

test("輸出不含任何成本欄位（出工成本、人力成本、方案日成本、加班費、雜支）", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const b = run(work([{ no: "W1", costId: "C1", caseId: "k1", code: "C100001", pts: 1 }]), c, sched([{ s: 0, ppl: [A], cases: [K1] }]));
  const json = JSON.stringify(b);
  for (const word of ["4900", "出工成本", "人力成本", "方案日成本", "加班費", "雜支"]) assert.ok(!json.includes(word), word);
});

// ================= 工程編號＝案件編號前 7 碼（業主 2026-10-13）=================
test("engineeringCode：trim、轉大寫、取前 7 碼；第 8 碼是數字不取；C000000 與不符格式回 null；R09 與 R10 規則一致", () => {
  const cases = [
    ["C115016", "C115016"], ["C115016A", "C115016"], ["C115016-2-1", "C115016"], [" c115223 ", "C115223"], ["B115032-5-2A", "B115032"],
    ["C114070-1D", "C114070"], ["C111308A", "C111308"], ["C115101-A", "C115101"], ["b110532-1A", "B110532"], ["Z999999Z", "Z999999"], ["A115074", "A115074"],
    // 第 8 碼是數字：多半是打錯的編號（A1150174 是 A115074 打錯），不可被取成別的工程
    ["A1150174", null], ["C1150019", null], ["C11501600", null],
    ["C000000", null], ["c000000-1", null], ["115526", null], ["報編115509-01", null], ["休假", null], ["", null], ["  ", null], [null, null], [undefined, null], ["C11501", null], ["B11503", null],
  ];
  for (const [input, want] of cases) {
    assert.equal(engineeringCode(input), want, `R09 ${JSON.stringify(input)}`);
    assert.equal(fieldEngineeringCode(input), want, `R10 ${JSON.stringify(input)}`);
  }
});

const PARENT = ["kp", "C115016"];
const projTable = () => casesTable([["kp", "C115016", "母案工程"], ["kc", "C115016-2-1", "子案工程"], ["kc2", "C115016A", "母案工程"]]);
const oneOrder = (extra) => ({ no: "W1", costId: "C1", ...extra });

test("母案＋子案合併成同一工程：預排連母案、工作單連子案 → 一列「有排有做」，不是兩列異常", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "kc", code: "C115016-2-1", pts: 1.5 })]);
  const s = sched([{ s: 0, ppl: [A], cases: [PARENT] }]);
  const b = run(w, c, s, projTable());
  assert.equal(b.cases.length, 1);
  const row = b.cases[0];
  assert.equal(row.caseId, "P:C115016");
  assert.equal(row.code, "C115016");
  assert.equal(row.result, "有排有做");
  assert.equal(row.plannedDays, 1);
  assert.equal(row.actualDays, 1);
  assert.equal(row.orders, 1);
  assert.equal(row.revenue, 1.5);
  assert.deepEqual(b.caseSummary, { planned: 1, plannedWithOrders: 1, plannedNoOrders: 0, actual: 1, unplanned: 0 });
  assert.equal(b.exceptions.length, 0);
});

test("同一工程底下多個案件：不同名稱標「第一個等 n 案」；營業額、人日、張數以工程彙總", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }, { id: "C2", day: 1, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "kc", code: "C115016-2-1", pts: 1 }), { no: "W2", costId: "C2", caseId: "kc2", code: "C115016A", pts: 2 }]);
  const s = sched([{ s: 0, e: 1, ppl: [A], cases: [PARENT] }]);
  const b = run(w, c, s, projTable());
  assert.equal(b.cases.length, 1);
  assert.equal(b.cases[0].revenue, 3);
  assert.equal(b.cases[0].orders, 2);
  assert.equal(b.cases[0].actualDays, 2);
  assert.equal(b.cases[0].name, "母案工程等 3 案"); // 本週涉及 kp（預排）、kc、kc2（工作單）三筆案件記錄
});

test("案件編號小寫、前後空白也視為同一工程（c115223 ＝ C115223）", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "ka", code: " c115223 ", pts: 1 })]);
  const s = sched([{ s: 0, ppl: [A], cases: [["kb", "C115223-1"]] }]);
  const b = run(w, c, s, casesTable([["ka", " c115223 ", "小寫案"], ["kb", "C115223-1", "後綴案"]]));
  assert.equal(b.cases.length, 1);
  assert.equal(b.cases[0].code, "C115223");
  assert.equal(b.cases[0].result, "有排有做");
});

test("C000000 占位碼兩筆不合併：各自一列（鍵＝record_id）並標編號重複", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "z2", code: "C000000", pts: 1 })]);
  const s = sched([{ s: 0, ppl: [A], cases: [["z1", "C000000"]] }]);
  const b = run(w, c, s, casesTable([["z1", "C000000", "占位一"], ["z2", "C000000", "占位二"]]));
  assert.equal(b.cases.length, 2);
  const z1 = b.cases.find((r) => r.caseId === "z1");
  const z2 = b.cases.find((r) => r.caseId === "z2");
  assert.equal(z1.result, "有排未做");
  assert.equal(z2.result, "未排有做");
  assert.equal(z1.dup, true);
  assert.equal(z2.dup, true);
});

test("不符格式（6 位數字 115526、空白）不合併：一案一列，用 record_id", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "n2", code: "115526-1", pts: 1 })]);
  const s = sched([{ s: 0, ppl: [A], cases: [["n1", "115526"], ["n3", ""]] }]);
  const b = run(w, c, s, casesTable([["n1", "115526", "六碼"], ["n2", "115526-1", "六碼後綴"], ["n3", "", "空白編號"]]));
  assert.equal(b.cases.length, 3);
  assert.deepEqual(b.cases.map((r) => r.caseId).sort(), ["n1", "n2", "n3"]);
  assert.equal(b.cases.find((r) => r.caseId === "n1").result, "有排未做");
  assert.equal(b.cases.find((r) => r.caseId === "n2").result, "未排有做");
  assert.equal(b.cases.find((r) => r.caseId === "n1").dup, false);
});

test("完整編號重複的兩筆記錄（C115093 ×2）合併到同一工程，且仍標編號重複", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "d2", code: "C115093", pts: 1 })]);
  const s = sched([{ s: 0, ppl: [A], cases: [["d1", "C115093"]] }]);
  const b = run(w, c, s, casesTable([["d1", "C115093", "甲案"], ["d2", "C115093", "乙案"], ["d3", "C115094", "他案"]]));
  assert.equal(b.cases.length, 1);
  assert.equal(b.cases[0].result, "有排有做");
  assert.equal(b.cases[0].dup, true);
  assert.equal(b.cases[0].name, "甲案等 2 案");
});

test("沒有案件表（示範資料／讀不到）：用標題文字套同一規則", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ code: "C115016-2-1", pts: 1 })]);
  w.records[0].fields["所屬案件"] = ["C115016-2-1"];
  const s = sched([{ s: 0, ppl: [A], cases: [["x", "C115016"]] }]);
  s.records[0].links = undefined;
  const b = run(w, c, s, undefined);
  assert.equal(b.cases.length, 1);
  assert.equal(b.cases[0].caseId, "P:C115016");
  assert.equal(b.cases[0].result, "有排有做");
});

test("異常與人工確認以工程分組：同人同工程不同子案的已退回單、連續日期合併成一列", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }, { id: "C2", day: 1, who: "甲", whoId: "pA" }]);
  const w = work([
    { no: "W1", costId: "C1", caseId: "kc", code: "C115016-2-1", pts: 1, status: "已退回" },
    { no: "W2", costId: "C2", caseId: "kc2", code: "C115016A", pts: 1, status: "已退回" },
  ]);
  const b = run(w, c, sched([{ s: 0, e: 1, ppl: [A], cases: [PARENT] }]), projTable());
  const rows = b.exceptions.filter((e) => e.kinds.includes("已退回"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].caseId, "P:C115016");
  assert.equal(rows[0].code, "C115016");
  assert.equal(rows[0].days, 2);
});

// ================= 第 8 碼是數字不合併／案件表空白編號／本週涉及的案件／無案件表編號重複 =================
test("第 8 碼是數字的打錯編號（A1150174）不併進 A115017：各自一列，用 record_id", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "x1", code: "A1150174", pts: 1 })]);
  const s = sched([{ s: 0, ppl: [A], cases: [["x2", "A115017"]] }]);
  const b = run(w, c, s, casesTable([["x1", "A1150174", "打錯案"], ["x2", "A115017", "正確案"]]));
  assert.deepEqual(b.cases.map((r) => r.caseId).sort(), ["P:A115017", "x1"]);
  assert.equal(b.cases.find((r) => r.caseId === "x1").code, "A1150174");
  assert.equal(b.cases.find((r) => r.caseId === "x1").result, "未排有做");
});

test("案件表查得到該記錄、但編號空白：維持 record_id，不退回用 link 標題合併", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "kp", code: "C115016", pts: 1 })]);
  const s = sched([{ s: 0, ppl: [A], cases: [["z", "C115016"]] }]); // link 標題寫 C115016，但案件表裡 z 的編號是空白
  const b = run(w, c, s, casesTable([["z", "", "空白編號"], ["kp", "C115016", "母案"]]));
  assert.deepEqual(b.cases.map((r) => r.caseId).sort(), ["P:C115016", "z"]);
  assert.equal(b.cases.find((r) => r.caseId === "z").result, "有排未做");
  assert.equal(b.cases.find((r) => r.caseId === "P:C115016").result, "未排有做");
});

test("案件表寫 C000000、link 標題寫 C115016：以案件表為準，不合併（釘住取值順序）", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "kp", code: "C115016", pts: 1 })]);
  const s = sched([{ s: 0, ppl: [A], cases: [["z", "C115016"]] }]);
  const b = run(w, c, s, casesTable([["z", "C000000", "占位"], ["kp", "C115016", "母案"]]));
  assert.deepEqual(b.cases.map((r) => r.caseId).sort(), ["P:C115016", "z"]);
});

test("記錄不在案件表裡：才用 link 標題文字備援合併", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "gone", code: "C115016-2", pts: 1 })]);
  const s = sched([{ s: 0, ppl: [A], cases: [["gone2", "C115016"]] }]);
  const b = run(w, c, s, casesTable([["other", "C200001", "別案"]]));
  assert.equal(b.cases.length, 1);
  assert.equal(b.cases[0].caseId, "P:C115016");
  assert.equal(b.cases[0].result, "有排有做");
});

const bigContract = () =>
  casesTable([["kp", "C115016", "母案工程"], ["k1", "C115016-1", "舊子案甲"], ["k2", "C115016-2", "舊子案乙"], ["k3", "C115016-3", "舊子案丙"], ["kq", "C115016A", "舊子案丁"]]);

test("工程名稱只看本週涉及的案件：開口契約大工程只涉及母案 → 名稱就是母案名稱，不顯示「等 n 案」", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "kp", code: "C115016", pts: 1 })]);
  const b = run(w, c, sched([{ s: 0, ppl: [A], cases: [PARENT] }]), bigContract());
  assert.equal(b.cases.length, 1);
  assert.equal(b.cases[0].name, "母案工程");
  assert.equal(b.cases[0].dup, false);
});

test("工程名稱「等 n 案」的 n＝本週涉及的不重複案件記錄數；名稱取編號排序最前（母案）", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "k3", code: "C115016-3", pts: 1 })]);
  const b = run(w, c, sched([{ s: 0, ppl: [A], cases: [["k2", "C115016-2"], PARENT] }]), bigContract());
  assert.equal(b.cases.length, 1);
  assert.equal(b.cases[0].name, "母案工程等 3 案");
});

test("編號重複只看本週涉及的案件：涉及的那筆編號在案件表出現兩次才標", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "kp", code: "C115016", pts: 1 })]);
  const tbl = casesTable([["kp", "C115016", "母案"], ["kp2", "C115016", "同編號另一筆"]]);
  const b = run(w, c, sched([{ s: 0, ppl: [A], cases: [PARENT] }]), tbl);
  assert.equal(b.cases[0].dup, true);
});

test("沒有案件表時，畫面上兩列顯示相同完整編號要標編號重複（C000000 ×2）", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "y", code: "C000000", pts: 1 })]);
  const s = sched([{ s: 0, ppl: [A], cases: [["x", "C000000"]] }, { s: 0, ppl: [A], cases: [["w", "C100009"]] }]);
  const b = run(w, c, s, undefined);
  assert.equal(b.cases.length, 3);
  assert.deepEqual(b.cases.filter((r) => r.dup).map((r) => r.caseId).sort(), ["x", "y"]);
});

// ================= 第二輪審查：編號重複統一規則／名稱備援／等 n 案不重複計／無人員預排不算涉及 =================
const dupRun = (workRows, planRows, tbl) => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  return run(work(workRows.map((r) => oneOrder(r))), c, sched(planRows), tbl);
};

test("無案件表、工作單連 r2、預排連 r1、標題都是 C115016：合併成 P:C115016 一列且標編號重複", () => {
  const b = dupRun([{ caseId: "r2", code: "C115016", pts: 1 }], [{ s: 0, ppl: [A], cases: [["r1", "C115016"]] }], undefined);
  assert.equal(b.cases.length, 1);
  assert.equal(b.cases[0].caseId, "P:C115016");
  assert.equal(b.cases[0].dup, true);
});

test("有案件表、兩個不在表裡的 record_id 標題都是 C000000：各自一列、都標編號重複", () => {
  const b = dupRun([{ caseId: "g1", code: "C000000", pts: 1 }], [{ s: 0, ppl: [A], cases: [["g2", "C000000"]] }], casesTable([["o", "C200001", "別案"]]));
  assert.equal(b.cases.length, 2);
  assert.deepEqual(b.cases.map((r) => r.dup), [true, true]);
});

test("編號重複大小寫、前後空白不敏感（無案件表 c115016 ＝ C115016；有案件表 c115016 在表裡出現兩次）", () => {
  const b1 = dupRun([{ caseId: "r2", code: " c115016 ", pts: 1 }], [{ s: 0, ppl: [A], cases: [["r1", "C115016"]] }], undefined);
  assert.equal(b1.cases[0].dup, true);
  const b2 = dupRun([{ caseId: "kp", code: "C115016", pts: 1 }], [{ s: 0, ppl: [A], cases: [["kp", "C115016"]] }], casesTable([["kp", "c115016", "母案"], ["kp2", "C115016", "另一筆"]]));
  assert.equal(b2.cases[0].dup, true);
});

test("同工程內「本週沒涉及」的記錄編號重複 → 不標；沒重複的也不誤標", () => {
  const tbl = casesTable([["kp", "C115016", "母案"], ["kx", "C115016-1", "子案甲"], ["ky", "C115016-1", "子案乙"], ["kz", "C115016-9", "子案丙"]]);
  const b = dupRun([{ caseId: "kz", code: "C115016-9", pts: 1 }], [{ s: 0, ppl: [A], cases: [["kp", "C115016"]] }], tbl);
  assert.equal(b.cases.length, 1);
  assert.equal(b.cases[0].dup, false);
});

test("記錄不在案件表：名稱用案件表「完整編號唯一」備援（不是空白）；沒 link 只有編號文字也一樣", () => {
  const tbl = casesTable([["kp", "C115016", "母案工程"]]);
  const b1 = dupRun([{ caseId: "gone", code: "C115016", pts: 1 }], [{ s: 0, ppl: [A], cases: [["gone", "C115016"]] }], tbl);
  assert.equal(b1.cases[0].name, "母案工程");
  const b2 = dupRun([{ code: "C115016", pts: 1 }], [{ s: 0, ppl: [A], cases: [["kp", "C115016"]] }], tbl);
  assert.equal(b2.cases[0].name, "母案工程");
  // 不合併的單列（6 位數字）也靠編號備援
  const b3 = dupRun([{ caseId: "gone", code: "115526", pts: 1 }], [{ s: 0, ppl: [A], cases: [["gone", "115526"]] }], casesTable([["n1", "115526", "六碼案"]]));
  assert.equal(b3.cases[0].name, "六碼案");
});

test("「等 n 案」不重複計同一案：W1 連 KP、W2 沒 link 但編號文字 C115016 → 不顯示「等 2 案」", () => {
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }, { id: "C2", day: 1, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "kp", code: "C115016", pts: 1 }), { no: "W2", costId: "C2", code: "C115016", pts: 1 }]);
  const b = run(w, c, sched([{ s: 0, ppl: [A], cases: [PARENT] }]), projTable());
  assert.equal(b.cases.length, 1);
  assert.equal(b.cases[0].name, "母案工程");
  // 無案件表：record_id 與同編號文字也只算 1
  const b2 = run(w, c, sched([{ s: 0, ppl: [A], cases: [PARENT] }]), undefined);
  assert.equal(b2.cases[0].dup, false);
});

test("R09 預排條沒有人員：不算涉及（不影響名稱的「等 n 案」，也不進案件列）", () => {
  const tbl = casesTable([["kp", "C115016", "母案工程"], ["kq", "C115016-1", "子案工程"]]);
  const c = cost([{ id: "C1", day: 0, who: "甲", whoId: "pA" }]);
  const w = work([oneOrder({ caseId: "kq", code: "C115016-1", pts: 1 })]);
  const b = run(w, c, sched([{ s: 0, ppl: [], cases: [["kp", "C115016"]] }]), tbl);
  assert.equal(b.cases.length, 1);
  assert.equal(b.cases[0].name, "子案工程");
});

test("R09 合併路徑：沒 link 的文字標題用案件表編號補名稱（t: 標題）", () => {
  const tbl = casesTable([["kp", "C115016", "母案工程"], ["kc", "C115016-2", "子案工程"]]);
  const b = dupRun([{ code: "C115016-2", pts: 1 }], [{ s: 0, ppl: [A], cases: [["kp", "C115016"]] }], tbl);
  assert.equal(b.cases[0].name, "母案工程等 2 案");
});
