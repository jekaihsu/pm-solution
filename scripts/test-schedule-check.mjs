// Policy integration fixtures for R04; no Lark reads or sensitive data.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_GROUP, taipeiDay, parseRoster, rosterIssue, scheduledPersonIds, unfilledPlanning,
  dailyStatus, loggedPersonIds, planningKnown, costSourceKnown, exemptionRosterNote,
} from "../lib/scheduleCheck.ts";

const DAY = 86400000;
const start = Date.UTC(2026, 9, 19) - 8 * 3600000;
const at = (d) => start + d * DAY + 9 * 3600000;
const F = (name, kind = "text", id = name) => ({ id, name, kind, primary: false });
const table = (fields, records = []) => ({
  table: { id: "t", name: "t" }, fields,
  records: records.map((r, i) => ({ id: r.id ?? `r${i}`, fields: r.fields, links: r.links })),
  fetchedAt: 0, source: "lark", complete: true, total: records.length,
});
const people = (rows) => table([F("姓名"), F("所屬組別"), F("在職", "checkbox")], rows.map((r, i) => ({
  id: r.id ?? `P${i}`, fields: { 姓名: r.name, 所屬組別: r.group ?? "內業", 在職: r.active ?? true },
})));
const run = (roster, opts = {}) => dailyStatus(
  roster, new Set(opts.planned ?? []), new Set(opts.logged ?? []), new Set(opts.punched ?? []),
  new Set(opts.members ?? []), new Map(opts.leave ?? []), opts.known,
);
const byId = (rows, id) => rows.find((r) => r.recordId === id);
const schedFields = [
  F("結束日期", "date", "fldMXOggGP"), // Deliberately reversed names: IDs are authoritative.
  F("開始日期", "date", "fldjWv1xST"),
  F("人員", "multiselect", "fld7KNCsVe"), F("條類型", "select", "fld78OmLVn"),
];
const sched = (rows = []) => table(schedFields, rows.map((r) => ({
  fields: { 結束日期: at(r.start), 開始日期: at(r.end ?? r.start), 人員: r.names ?? ["同名"], 條類型: r.kind ?? "工作" },
  links: { 人員: r.ids },
})));
const cost = (rows = []) => ({
  data: table([F("工作日期", "date"), F("組長", "multiselect"), F("實際出工人", "multiselect")], rows),
  dateNames: ["工作日期"], personNames: ["組長", "實際出工人"],
});

test("完整在職名冊保留五人豁免和獨立離職 override，不讀職級", () => {
  const roster = parseRoster(people([
    { id: "E", name: "郑光睿\n" }, { id: "D", name: "陳星穎\n" },
    { id: "I", name: "陳星影", active: false }, { id: "X", name: "已離開", active: false },
    { id: "M", name: "鍾智偉", group: "經理" },
  ]));
  assert.deepEqual(roster.map((p) => p.recordId).sort(), ["D", "E", "I", "M"]);
  assert.equal(byId(roster, "E").name, "鄭光瑞");
  assert.equal(byId(roster, "E").requiresPlanning, false);
  assert.equal(byId(roster, "E").requiresLog, false);
  assert.match(byId(roster, "D").departedReason, /離職/);
  assert.match(byId(roster, "I").departedReason, /離職/);
  assert.equal(byId(roster, "M").requiresLog, true);
  assert.deepEqual(unfilledPlanning(roster, new Set()).map((p) => p.recordId), ["M"]);
});

test("主管、業務、PM／行政／IT／控制／圖報，每人缺預排或日誌皆檢核", () => {
  const fixtures = [
    ["鍾智偉", "經理"], ["涂振邦", "管理"], ["張家彬", "顧問"], ["吳柏頤", "PM"],
    ["吳科翰", "IT"], ["業務員", "業務"], ["行政員", "行政"], ["控制員", "控制"], ["圖報員", "圖報A"],
  ];
  const roster = parseRoster(people(fixtures.map(([name, group]) => ({ name, group }))));
  const ids = roster.map((p) => p.recordId);
  for (const opts of [{ logged: ids }, { planned: ids }]) {
    const rows = run(roster, opts);
    assert.equal(rows.length, fixtures.length);
    for (const row of rows) {
      assert.equal(row.requiresPlanning, true, row.name);
      assert.equal(row.requiresLog, true, row.name);
      assert.equal(row.missing, true, row.name);
      assert.equal(row.compliant, false, row.name);
    }
  }
});

test("兩項豁免不連帶免打卡，豁免與離職均明確保留原因且不列合規", () => {
  const roster = parseRoster(people([
    { id: "E", name: "許茂坤" }, { id: "D", name: "陳星穎\n" },
  ]));
  const rows = run(roster, { members: ["E", "D"] });
  const exempt = byId(rows, "E");
  assert.equal(exempt.requiresPlanning, false);
  assert.equal(exempt.requiresLog, false);
  assert.equal(exempt.missing, true); // independent attendance failure
  assert.match(exempt.reason, /JK 確認免填預排/);
  assert.equal(exempt.compliant, false);
  assert.equal(byId(rows, "D").missing, false);
  assert.match(byId(rows, "D").reason, /離職/);
  assert.equal(byId(run(roster, { punched: ["E"], members: ["E"] }), "E").missing, false);
});

test("無組別即使預排日誌齊全仍保留資料注意，不呈現毫無問題", () => {
  const roster = parseRoster(people([{ id: "P", name: "張証崴", group: "" }]));
  const row = run(roster, { planned: ["P"], logged: ["P"] })[0];
  assert.equal(row.group, NO_GROUP);
  assert.equal(row.classification, "內業");
  assert.equal(row.missing, false);
  assert.ok(row.dataAttentionReasons.some((r) => /未填組別/.test(r)));
  assert.equal(row.compliant, false);
});

test("無活動和請假者保留可見理由，不列合規或製造請假漏填", () => {
  const roster = parseRoster(people([{ id: "P", name: "莊勇勝" }]));
  const noSignal = run(roster)[0];
  assert.equal(noSignal.noSignal, true);
  assert.match(noSignal.reason, /無活動訊號/);
  assert.equal(noSignal.compliant, false);
  for (const leave of ["leave", "trip", "out"]) {
    const rows = run(roster, { leave: [["P", leave]] });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].missing, false);
    assert.equal(rows[0].compliant, false);
    assert.match(rows[0].reason, /請假|出差|外出/);
    assert.match(rows[0].reason, /未計合規/);
  }
});

test("未知來源不造假缺漏或假合規，已知正向記錄仍保留", () => {
  const roster = parseRoster(people([{ id: "P", name: "一般員工" }]));
  const unknown = { sched: false, cost: false, attendance: false };
  const row = run(roster, { members: ["P"], known: unknown })[0];
  assert.equal(row.plannedKnown, false);
  assert.equal(row.loggedKnown, false);
  assert.equal(row.punchedKnown, false);
  assert.equal(row.missing, false);
  assert.equal(row.compliant, false);
  assert.match(row.reason, /未知/);
  const partial = run(roster, { planned: ["P"], known: unknown })[0];
  assert.equal(partial.plannedKnown, true);
  assert.equal(partial.loggedKnown, false);
  assert.equal(partial.compliant, false);
  assert.equal(run(roster, { planned: ["P"], logged: ["P"] })[0].compliant, true);
});

test("僅假勤來源未知時，無法確認核准假別，不判定缺漏或合規", () => {
  const roster = parseRoster(people([{ id: "P", name: "一般員工" }]));
  const known = { sched: true, cost: true, attendance: false };
  for (const members of [[], ["P"]]) {
    const row = run(roster, { members, known })[0];
    assert.equal(row.plannedKnown, true);
    assert.equal(row.loggedKnown, true);
    assert.equal(row.punchedKnown, false);
    assert.equal(row.noSignal, true);
    assert.equal(row.missing, false);
    assert.equal(row.compliant, false);
    assert.match(row.reason, /假勤來源未知/);
    assert.doesNotMatch(row.reason, /有確定缺漏/);
  }
  const filled = run(roster, { planned: ["P"], logged: ["P"], known })[0];
  assert.equal(filled.missing, false);
  assert.equal(filled.compliant, false);
});

test("名冊缺必要欄位與分頁不完整明確回報未知", () => {
  const complete = people([{ name: "一般員工" }]);
  assert.equal(rosterIssue(complete), null);
  for (const name of ["姓名", "在職"]) {
    const missing = { ...complete, fields: complete.fields.filter((f) => f.name !== name) };
    assert.ok(rosterIssue(missing), name);
  }
  const noGroupColumn = { ...complete, fields: complete.fields.filter((f) => f.name !== "所屬組別") };
  const noGroupPerson = parseRoster(noGroupColumn)[0];
  assert.equal(noGroupPerson.requiresPlanning, true);
  assert.equal(noGroupPerson.requiresLog, true);
  assert.ok(noGroupPerson.dataAttentionReasons.some((r) => /未填組別/.test(r)));
  for (const data of [{ ...complete, complete: false }, { ...complete, total: 2 }]) assert.ok(rosterIssue(data));
  for (const data of [{ ...complete, stale: true }, { ...complete, error: "SOURCE_UNAVAILABLE" }]) {
    assert.ok(rosterIssue(data));
    assert.match(exemptionRosterNote(data), /未知/);
    assert.doesNotMatch(exemptionRosterNote(data), /不存在/);
  }
});

test("預排與日誌缺欄／不完整不可視為確定缺填", () => {
  assert.equal(planningKnown(sched()), true);
  assert.equal(planningKnown(undefined), false);
  assert.equal(planningKnown({ ...sched(), complete: false }), false);
  assert.equal(planningKnown({ ...sched(), total: 1 }), false);
  for (const flag of [{ stale: true }, { error: "SOURCE_UNAVAILABLE" }]) {
    assert.equal(planningKnown({ ...sched(), ...flag }), false);
    assert.equal(costSourceKnown({ ...cost(), data: { ...cost().data, ...flag } }), false);
  }
  for (const fields of [schedFields.filter((f) => f.kind !== "date"), schedFields.filter((f) => f.id !== "fld7KNCsVe"), schedFields.filter((f) => f.id !== "fld78OmLVn")]) {
    assert.equal(planningKnown({ ...sched(), fields }), false);
  }
  assert.equal(costSourceKnown(cost()), true);
  assert.equal(costSourceKnown({ ...cost(), data: { ...cost().data, complete: false } }), false);
  for (const fields of [[F("工作日期", "date")], [F("組長", "multiselect")]]) {
    assert.equal(costSourceKnown({ ...cost(), data: table(fields) }), false);
  }
  const requiredPersonNames = [["組長"], ["實際出工人", "組員"]];
  assert.equal(costSourceKnown({ ...cost(), requiredPersonNames }), true);
  assert.equal(costSourceKnown({ ...cost(), requiredPersonNames, data: table([F("工作日期", "date"), F("組長", "multiselect")]) }), false);
  assert.equal(costSourceKnown({ ...cost(), requiredPersonNames, data: table([F("工作日期", "date"), F("組長", "multiselect"), F("組員", "multiselect")]) }), true);
});

test("林育寬不存在、存在、名冊未知分開說明，缺人在完整名冊才宣告 no-op", () => {
  assert.match(exemptionRosterNote(people([{ name: "其他人" }])), /林育寬.*不存在.*no-op/i);
  assert.match(exemptionRosterNote(people([{ name: " 林育宽\n" }])), /林育寬.*存在/);
  assert.doesNotMatch(exemptionRosterNote(people([{ name: " 林育宽\n" }])), /no-op/i);
  for (const data of [undefined, { ...people([]), complete: false }, { ...people([]), total: 1 }]) {
    assert.match(exemptionRosterNote(data), /未知/);
    assert.doesNotMatch(exemptionRosterNote(data), /不存在/);
  }
});

test("真起訖 field ID、台北日期、多人人員 link 和休假條沿用既有規則", () => {
  const data = sched([
    { start: -1, end: 1, ids: ["P1", "P2"] },
    { start: 1, ids: ["leave"], kind: "休假" },
    { start: 1, ids: ["leave2"], kind: "請假" },
    { start: 7, ids: ["outside"] },
  ]);
  assert.deepEqual([...scheduledPersonIds(data, start, start + 7 * DAY)].sort(), ["P1", "P2"]);
  assert.equal(taipeiDay(start - 1), taipeiDay(start) - 1);
  assert.deepEqual([...scheduledPersonIds(data, start + 2 * DAY, start + 3 * DAY)], []);
});

test("日誌取組長與實際出工人 link ID，名稱相同不會串到其他人", () => {
  const data = cost([{ fields: { 工作日期: at(0), 組長: ["同名"], 實際出工人: ["同名"] }, links: { 組長: ["P1"], 實際出工人: ["P2"] } }]);
  assert.deepEqual([...loggedPersonIds([data], taipeiDay(at(0)))].sort(), ["P1", "P2"]);
  assert.deepEqual([...loggedPersonIds([data], taipeiDay(at(1)))], []);
});

test("正規化同名的不同 record ID 均保留，標示身分待確認不靜默合併", () => {
  const roster = parseRoster(people([
    { id: "A", name: "鄭秉彝" }, { id: "B", name: " 鄭秉彜\n" },
  ]));
  assert.deepEqual(roster.map((p) => p.recordId).sort(), ["A", "B"]);
  for (const p of roster) assert.ok(p.dataAttentionReasons.some((r) => /同名.*身分待確認/.test(r)));
  const rows = run(roster, { planned: ["A"], logged: ["A"] });
  assert.equal(byId(rows, "A").planned, true);
  assert.equal(byId(rows, "B").planned, false);
  assert.equal(byId(rows, "A").compliant, false);
});
