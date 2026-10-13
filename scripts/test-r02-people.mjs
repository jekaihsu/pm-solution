// R02 內業檢查「以人為單位」的邏輯測試（不連 Lark）。
// Usage: node --test scripts/test-r02-people.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
// 人員版邏輯放在 controlGroup.ts 的「R02 以人為單位」區段（Node 直跑 .ts 時模組間不能省副檔名，所以不另開檔）。
import { groupRows, joinInternal, partitionByPlan, plannedPoints, resolveScheduleFields, resolveWorkFields, JOINED_GROUP, JOINED_PERSON, keepInternalSchedule, plannedByPerson, personRows, resolvePersonScheduleFields, teamSections } from "../lib/controlGroup.ts";

const DAY = 86400000;
const TZ = 8 * 3600000;
const weekStart = Date.UTC(2026, 9, 5) - TZ; // Mon 2026-10-05 00:00 Taipei
const weekEnd = weekStart + 7 * DAY;
const at = (d) => weekStart + d * DAY + 9 * 3600000;
const dayNo = (d) => Math.floor((at(d) + TZ) / DAY);

const field = (name, kind, id = name) => ({ id, name, kind, primary: false });
// links: { 欄名: [record ids] } — 與 fields 內的人名文字一一對應
const table = (fields, rows) => ({
  table: { id: "t", name: "t" },
  fields,
  records: rows.map(({ links, ...f }, i) => ({ id: `rec${i}`, fields: f, ...(links ? { links } : {}) })),
  fetchedAt: 0,
  source: "demo",
  complete: true,
  total: rows.length,
});

// 預排表：欄 id 用真實 V3 的 id。故意把欄名對調（模擬 UI 曾經把名稱改反）
const schedFields = [
  field("結束日期", "date", "fldMXOggGP"), // 真起日（欄名反了）
  field("開始日期", "date", "fldjWv1xST"), // 真訖日（欄名反了）
  field("業別", "select", "fldrENe4H6"),
  field("組別", "select", "fldNDUy2XP"),
  field("人員", "multiselect", "fld7KNCsVe"),
  field("條類型", "select", "fld78OmLVn"),
  field("預估營業額點數", "number", "fld5lTSN1r"),
];
const row = ({ s, e, trade = "內業", group = "控制組", ppl, kind = "出工", pts = null }) => ({
  結束日期: at(s), // fldMXOggGP = 真起日
  開始日期: at(e), // fldjWv1xST = 真訖日
  業別: trade,
  組別: group,
  人員: ppl.map((p) => p[1]),
  links: { 人員: ppl.map((p) => p[0]) },
  條類型: kind,
  預估營業額點數: pts,
});
const A = ["pA", "甲"], B = ["pB", "乙"], C = ["pC", "丙"];
const plan = (rows, keep = keepInternalSchedule) => {
  const t = table(schedFields, rows);
  return plannedByPerson(t, resolvePersonScheduleFields(t.fields), weekStart, weekEnd, keep);
};

test("預排日期認欄 id，不看欄名（欄名被對調也照 fldMXOggGP 起、fldjWv1xST 訖）", () => {
  const p = plan([row({ s: 0, e: 2, ppl: [A] })]);
  assert.equal(p.get("pA").days.size, 3);
  assert.equal([...p.get("pA").days.values()].reduce((s, d) => s + d.points, 0), 3);
});

test("同人同日兩條預排只算 1 點（不論案件或條數）", () => {
  const p = plan([row({ s: 0, e: 0, ppl: [A] }), row({ s: 0, e: 0, ppl: [A] }), row({ s: 0, e: 1, ppl: [A] })]);
  const days = p.get("pA").days;
  assert.equal(days.size, 2);
  assert.equal(days.get(dayNo(0)).points, 1);
  assert.equal(days.get(dayNo(1)).points, 1);
});

test("多人預排條逐人展開，組別不參與比對", () => {
  const p = plan([row({ s: 0, e: 1, ppl: [A, B], group: "圖報A組" }), row({ s: 1, e: 1, ppl: [B], group: "控制組" })]);
  assert.equal(p.get("pA").days.size, 2);
  assert.equal(p.get("pB").days.size, 2);
  assert.equal(p.get("pB").days.get(dayNo(1)).points, 1); // 同人同日，兩條只算 1
});

test("有填預估營業額點數就分攤到每天；同日已填則不再補 1 點", () => {
  const p = plan([row({ s: 0, e: 2, ppl: [A], pts: 6 }), row({ s: 1, e: 1, ppl: [A] })]);
  const d = p.get("pA").days;
  assert.equal(d.get(dayNo(0)).points, 2);
  assert.equal(d.get(dayNo(1)).points, 2); // 已被填寫的 6/3 蓋住，不補 1
  assert.equal(d.get(dayNo(1)).defaulted, false);
});

test("業別不是內業、ROV、休假 都不算內業預排", () => {
  const p = plan([
    row({ s: 0, e: 0, ppl: [A], trade: "外業" }),
    row({ s: 0, e: 0, ppl: [B], group: "ROV組" }),
    row({ s: 0, e: 0, ppl: [C], kind: "休假" }),
  ]);
  assert.equal(p.size, 0);
});

test("只算所選週內的日子", () => {
  const p = plan([row({ s: -2, e: 0, ppl: [A] })]);
  assert.equal(p.get("pA").days.size, 1);
});

// ---- 工作單 ----
const wFields = [field("工作單號", "text"), field("所屬成本單", "multiselect"), field("最終營業額點數", "number"), field("雅雯檢核", "checkbox"), field("營業額點數", "number"), field("修改後營業額", "number")];
const cFields = [{ ...field("單號", "text"), primary: true }, field("工作日期", "date"), field("內業組別", "select"), field("填報人", "multiselect")];
const cost = table(cFields, [
  { 單號: "甲 d0", 工作日期: at(0), 內業組別: "控制", 填報人: ["甲"], links: { 填報人: ["pA"] } },
  { 單號: "甲 d1", 工作日期: at(1), 內業組別: "圖報A", 填報人: ["甲"], links: { 填報人: ["pA"] } }, // 同一人跨組
  { 單號: "乙 d0", 工作日期: at(0), 內業組別: "控制", 填報人: ["乙"], links: { 填報人: ["pB"] } },
  { 單號: "丙 d0", 工作日期: at(0), 內業組別: "圖報B", 填報人: ["丙"], links: { 填報人: ["pC"] } },
]);
const work = table(wFields, [
  { 工作單號: "w1", 所屬成本單: ["甲 d0"], 最終營業額點數: 1, 雅雯檢核: true },
  { 工作單號: "w2", 所屬成本單: ["甲 d0"], 最終營業額點數: 2, 雅雯檢核: false },
  { 工作單號: "w3", 所屬成本單: ["甲 d1"], 最終營業額點數: 4, 雅雯檢核: true },
  { 工作單號: "w4", 所屬成本單: ["乙 d0"], 最終營業額點數: 0.5, 雅雯檢核: true },
  { 工作單號: "w5", 所屬成本單: ["丙 d0"], 最終營業額點數: 3, 雅雯檢核: true },
]);
const joined = joinInternal(work, cost).data;
const wf = resolveWorkFields(joined.fields, ["雅雯檢核"]);
const DATE = "工作日期";

test("joinInternal 把成本單的填報人 record_id 帶到工作單", () => {
  const r = joined.records[0];
  assert.deepEqual(r.links[JOINED_PERSON], ["pA"]);
  assert.equal(r.fields[JOINED_GROUP], "控制");
});

test("一列一個人；人跨組時依成本單的內業組別分開、不重複計算", () => {
  const rows = personRows(joined.records, wf, DATE, new Map());
  const keyed = Object.fromEntries(rows.map((r) => [`${r.team}|${r.personId}`, r]));
  assert.equal(rows.length, 4); // 甲在控制、甲在圖報A、乙、丙
  assert.equal(keyed["控制|pA"].orders.length, 2);
  assert.equal(keyed["控制|pA"].revenue, 3);
  assert.equal(keyed["圖報A|pA"].orders.length, 1);
  assert.equal(rows.reduce((s, r) => s + r.orders.length, 0), 5);
  assert.equal(keyed["控制|pA"].pass, 1);
  assert.equal(keyed["控制|pA"].unchecked, 1);
});

test("各組小計＝該組各人加總＝以組計算的值", () => {
  const rows = personRows(joined.records, wf, DATE, new Map());
  const secs = teamSections(rows);
  const byGroup = groupRows(joined.records, wf, new Map());
  for (const g of byGroup) {
    const s = secs.find((x) => x.team === g.group);
    assert.ok(s, g.group);
    assert.equal(s.total.orders.length, g.orders.length);
    assert.equal(s.total.revenue, g.revenue);
    assert.equal(s.total.pass, g.pass);
  }
  assert.equal(secs.length, byGroup.length);
});

test("預排依人員 record_id＋日期掛到當天填報的組；沒預排的人進 unplanned", () => {
  const p = plan([
    row({ s: 0, e: 1, ppl: [A], group: "隨便組" }), // 甲：d0 在控制、d1 在圖報A
    row({ s: 0, e: 0, ppl: [B] }),
  ]);
  const rows = personRows(joined.records, wf, DATE, p);
  const get = (team, id) => rows.find((r) => r.team === team && r.personId === id);
  assert.equal(get("控制", "pA").planned.points, 1);
  assert.equal(get("圖報A", "pA").planned.points, 1);
  assert.equal(get("控制", "pB").planned.points, 1);
  assert.equal(get("圖報B", "pC").planned, undefined);
  const part = partitionByPlan(rows);
  assert.deepEqual(part.unplanned.map((r) => r.personId), ["pC"]);
  assert.equal(part.planned.length, 3);
  assert.equal(part.points, 3);
  assert.equal(part.revenue, 3 + 4 + 0.5);
  assert.equal(part.diff, 7.5 - 3);
});

test("有預排但整週沒工作單的人也有一列（用預排組別當歸屬）", () => {
  const p = plan([row({ s: 3, e: 3, ppl: [["pZ", "戊"]], group: "圖報B組" })]);
  const rows = personRows(joined.records, wf, DATE, p);
  const z = rows.find((r) => r.personId === "pZ");
  assert.equal(z.team, "圖報B"); // 對到既有組名（去掉結尾「組」）
  assert.equal(z.orders.length, 0);
  assert.equal(z.planned.points, 1);
});

test("回歸：R01 的 groupRows／plannedPoints 仍以組為單位", () => {
  const sf = table([field("業別", "select"), field("組別", "select"), field("開始日期", "date"), field("結束日期", "date")], [
    { 業別: "外業", 組別: "水深A組", 開始日期: at(0), 結束日期: at(1) },
    { 業別: "外業", 組別: "水深A組", 開始日期: at(0), 結束日期: at(0) },
  ]);
  const planned = plannedPoints(sf, resolveScheduleFields(sf.fields), weekStart, weekEnd);
  assert.equal(planned.get("水深A組").points, 2); // 同組同日只算一次
  const w = table([field("組別", "text"), field("最終營業額點數", "number")], [{ 組別: "水深A", 最終營業額點數: 1 }, { 組別: "水深A", 最終營業額點數: 2 }]);
  const rows = groupRows(w.records, resolveWorkFields(w.fields), planned);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].group, "水深A");
  assert.equal(rows[0].personId, undefined);
});
