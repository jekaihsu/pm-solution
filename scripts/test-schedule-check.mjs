// Synthetic policy regressions only: no frozen golden, network, or credentials.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRosterIndex, parseRoster, rosterIssue, exemptionRosterNote, buildScheduleIndex, hasPlanning, scheduledPersonIds, unfilledPlanning, buildLogIndex, LOG_FIELDS, evaluateRange, evaluateDay, existingAttendance, checkText, checkCsvRow, statusText, isFieldGroup } from "../lib/scheduleCheck.ts";
import { EXEMPT_NAMES, GROUP_OVERRIDES } from "../lib/yupaiPolicy.ts";
import { normalizeWorkDate } from "../lib/workDate.ts";
import { yupaiDemo } from "../lib/yupaiDemo.ts";
const F = (name, id = name) => ({ id, name, kind: "text", primary: false });
const table = (names, rows = []) => ({ table: { id: "t", name: "synthetic" }, fields: names.map((n) => typeof n === "string" ? F(n) : n), records: rows.map((r, i) => ({ id: `r${i}`, ...r })), fetchedAt: 0, source: "demo", complete: true, total: rows.length });
const people = (list) => table(["姓名", "在職", "所屬組別"], list.map((p, i) => ({ id: p.id ?? p.name ?? `p${i}`, fields: { 姓名: p.name, 在職: p.active ?? true, 所屬組別: p.group ?? "控制" } })));
const schedule = (list = []) => table([F("起", "fldMXOggGP"), F("訖", "fldjWv1xST"), F("人員", "fld7KNCsVe"), "條類型", "組別", "業別"], list.map((r) => ({ fields: { 起: r.day ?? "2026-10-19", 訖: r.end ?? r.day ?? "2026-10-19", 條類型: r.kind ?? "", 組別: r.group ?? "", 業別: r.trade ?? "" }, links: { 人員: r.ids ?? [] } })));
const logs = (overrides = {}) => Object.fromEntries(Object.entries(LOG_FIELDS).map(([key, [date, person]]) => [key, table([date, person], overrides[key] ?? [])]));
const cost = (name, date = "2026-10-19", kind = "internal-cost", extra = {}) => ({ fields: { 工作日期: date, ...extra }, links: { [kind === "pm-cost" ? "填表人" : "填報人"]: [name] } });
const full = (days = {}, restCounts) => ({ compatibility: "full", days, restCounts, punch: {}, members: [] });
const run = (p, opts = {}) => evaluateRange({ people: p, schedule: opts.schedule ?? schedule(), logs: opts.logs ?? logs(), attendance: opts.attendance ?? full(), start: opts.start ?? "2026-10-12", end: opts.end ?? "2026-10-20", today: opts.today ?? "2026-10-20" });
const row = (r, name, date = "2026-10-19") => r.rows.find((r) => r.name === name && r.date === date);

test("五人豁免、離職排除、林育寬 no-op，嚴格布林在職", () => {
  const p = people([...EXEMPT_NAMES.map((name) => ({ name })), { name: "陳星穎" }, { name: "甲" }, ...["true", 1, false].map((active, i) => ({ name: `非true${i}`, active }))]);
  const r = run(p);
  assert.equal(r.summary.active, 7); assert.equal(r.summary.checked, 1);
  assert.ok(r.rows.every((x) => x.name === "甲"));
  assert.match(exemptionRosterNote(people([{ name: "甲" }])), /no-op/);
  assert.match(exemptionRosterNote(p), /存在/);
  assert.match(exemptionRosterNote({ ...p, complete: false }), /未知/);
});
test("三種名冊錯誤停止核對，舊列仍可解析但不覆蓋在職組別", () => {
  for (const list of [[{ id: "x", name: "甲" }, { id: "x", name: "乙" }], [{ name: " " }], [{ name: "鄭秉彝" }, { name: "鄭秉彜" }]]) {
    assert.ok(rosterIssue(people(list))); assert.throws(() => parseRoster(people(list)));
  }
  const p = people([{ id: "active", name: "甲", group: "水深C" }, { id: "old", name: "甲", group: "PM", active: false }]);
  const r = buildRosterIndex(p); assert.equal(r.allNames.get("old"), "甲"); assert.equal(r.byName.get("甲").effectiveGroup, "水深C");
  const l = buildLogIndex(logs({ "internal-cost": [cost("old")] }), r, "2026-10-19", "2026-10-19"); assert.equal(l.logs.size, 1);
  for (const flag of [{ stale: true }, { error: "x" }, { complete: false }, { total: 10 }]) assert.ok(rosterIssue({ ...p, ...flag }));
});
test("工作日期：UTC序列／ISO／milliseconds／無時區一致，無效與多值不猜", () => {
  for (const v of [46302.66667, "46302.66667", "2026-10-07T16:00:00Z", "2026-10-08T00:00:00+08:00", Date.parse("2026-10-07T16:00Z"), "2026-10-08 00:00:00", "2026-10-08", [46302.66667]]) assert.equal(normalizeWorkDate(v), "2026-10-08", JSON.stringify(v));
  for (const v of [null, undefined, true, false, [], [1, 2], "bad", "2026-02-30", "2026-10-08T25:00:00", Infinity, NaN, {}, ""]) assert.equal(normalizeWorkDate(v), null, JSON.stringify(v));
  assert.equal(normalizeWorkDate("2026-10-08T20:00:00Z"), "2026-10-09");
});
test("五日誌來源聯集、人日去重保留來源；只用工作日期，不回退填表日", () => {
  const p = people([{ name: "甲" }, { name: "乙" }]);
  const r = run(p, { logs: logs({
    "field-work": [{ fields: { "工作日期-薪資": "2026-10-19", 此單出工人: " 甲，乙 " } }],
    "internal-work": [{ fields: { "工作日期-營業額明細": "2026-10-19", 姓名: "甲" } }],
    "admin-work": [{ fields: { "工作日期-營業額明細": "2026-10-19", "營業額人員-明細": "甲" } }],
    "pm-cost": [cost("甲", "2026-10-19", "pm-cost", { 填表日: "2026-10-20" })],
    "internal-cost": [cost("甲"), cost("甲"), cost("乙", null, "internal-cost", { 建立時間: "2026-10-20" })],
  }) });
  assert.equal(row(r, "甲").log, "填"); assert.equal(row(r, "甲").logSources.length, 5);
  assert.equal(row(r, "乙").logSources.length, 1); assert.equal(row(r, "甲", "2026-10-20").log, "·");
  const index = buildLogIndex(logs({ "internal-cost": [cost("甲"), cost("甲")] }), buildRosterIndex(p), "2026-10-19", "2026-10-20"); assert.equal(index.logs.size, 1);
});
test("區間內未知成本 link 報錯；區間外忽略；來源缺失／舊成功／缺欄停止結果", () => {
  const p = people([{ name: "甲" }]);
  assert.throws(() => run(p, { logs: logs({ "pm-cost": [cost("unknown", "2026-10-19", "pm-cost")] }) }), /link/);
  assert.doesNotThrow(() => run(p, { logs: logs({ "pm-cost": [cost("unknown", "2026-10-01", "pm-cost")] }) }));
  for (const source of Object.keys(LOG_FIELDS)) for (const invalid of [undefined, { ...logs()[source], stale: true }, { ...logs()[source], complete: false }, { ...logs()[source], fields: [] }]) assert.throws(() => run(p, { logs: { ...logs(), [source]: invalid } }));
  assert.throws(() => run(p, { schedule: { ...schedule(), complete: false } }));
});
test("空白類型、多人、僅組別共享；三人覆寫、跨組跨日隔離、週末不展開", () => {
  const p = people([{ name: "林豐緯", group: "外業" }, { name: "蔡長庭", group: "外業" }, { name: "陳靖羽", group: "外業" }, { name: "乙", group: "水深C" }, { name: "丙", group: "地形C" }]);
  const ri = buildRosterIndex(p), s = buildScheduleIndex(schedule([{ ids: ["林豐緯"], day: "2026-10-16", end: "2026-10-19" }, { ids: ["陳靖羽", "蔡長庭"], day: "2026-10-20" }]), ri, "2026-10-15", "2026-10-21");
  for (const [name, group] of Object.entries(GROUP_OVERRIDES)) assert.equal(ri.byName.get(name).effectiveGroup, group);
  for (const d of ["2026-10-16", "2026-10-19", "2026-10-20"]) assert.equal(hasPlanning(s, ri.byName.get("乙"), d), true);
  for (const d of ["2026-10-15", "2026-10-17", "2026-10-18", "2026-10-21"]) assert.equal(hasPlanning(s, ri.byName.get("乙"), d), false);
  assert.equal(hasPlanning(s, ri.byName.get("丙"), "2026-10-19"), false); assert.equal(hasPlanning(s, ri.byName.get("丙"), "2026-10-20"), true);
  const groupOnly = buildScheduleIndex(schedule([{ group: "水深C" }]), ri, "2026-10-19", "2026-10-19");
  for (const n of ["林豐緯", "蔡長庭", "乙"]) assert.equal(hasPlanning(groupOnly, ri.byName.get(n), "2026-10-19"), true);
  assert.equal(s.personalSchedule.get("林豐緯\t2026-10-19").has(""), true);
  assert.equal(unfilledPlanning(ri.active, scheduledPersonIds(groupOnly, ri.active, "2026-10-19", "2026-10-19")).length, 2);
});
test("泛稱外業不廣播、PM不共享；個人日誌不傳播", () => {
  const p = people([{ name: "甲", group: "外業" }, { name: "乙", group: "外業" }, { name: "丙", group: "PM" }, { name: "丁", group: "PM" }]);
  const r = run(p, { schedule: schedule([{ ids: ["甲"], group: "外業" }, { ids: ["丙"], group: "PM" }]), logs: logs({ "internal-cost": [cost("甲")] }) });
  assert.equal(isFieldGroup("外業"), false); assert.equal(row(r, "乙").planning, "·"); assert.equal(row(r, "丁").planning, "·");
  const shared = run(people([{ name: "甲", group: "水深C" }, { name: "乙", group: "水深C" }]), { schedule: schedule([{ ids: ["甲"] }]), logs: logs({ "internal-cost": [cost("甲")] }), today: "2026-10-22" });
  assert.equal(row(shared, "乙").planning, "排"); assert.equal(row(shared, "乙").log, "未填");
});
test("本人假勤優先、純休假與混合類型、別人的假不傳播", () => {
  const p = people([{ name: "甲", group: "水深C" }, { name: "乙", group: "水深C" }]);
  for (const att of [{ leave: "leave" }, { approvedLeave: "特休" }, { status: "核准請假" }, { leaveCount: 1 }, { leave: "trip" }, { leave: "out" }]) {
    const r = run(p, { schedule: schedule([{ ids: ["乙"] }]), attendance: full({ 甲: { "2026-10-19": att } }) });
    assert.deepEqual([row(r, "甲").planning, row(r, "甲").log], ["假", "假"]); assert.equal(row(r, "甲").missing, false);
  }
  const s = [{ ids: ["甲"], kind: "休假" }];
  const pure = run(p, { schedule: schedule(s) }); assert.equal(row(pure, "甲").kind, "leave"); assert.equal(row(pure, "乙").kind, "work");
  const mix = run(p, { schedule: schedule([...s, { ids: ["甲"], kind: "" }]) }); assert.equal(row(mix, "甲").kind, "work"); assert.equal(row(mix, "甲").planning, "排");
});
test("無活動不判缺；80%不排除、嚴格超過80%排除；上週五期限及 cutoff寬限", () => {
  const p = people([{ name: "甲" }]); const no = run(p); assert.equal(no.summary.unable, 1); assert.equal(no.summary.attention, 0);
  for (const [rest, expected] of [[4, true], [5, false]]) {
    const r = run(p, { attendance: full({}, { "2026-10-19": { rest, total: 5 } }) }); assert.equal(r.dates.includes("2026-10-19"), expected);
  }
  const r = run(p, { schedule: schedule([{ ids: ["甲"], day: "2026-10-16", end: "2026-10-20" }]) });
  assert.equal(r.cutoff, "2026-10-19"); assert.equal(row(r, "甲", "2026-10-16").log, "未填"); assert.equal(row(r, "甲").log, "待"); assert.equal(row(r, "甲", "2026-10-20").log, "待");
  for (const [today, expected] of [["2026-10-15", "待排"], ["2026-10-16", "未排"]]) {
    const x = run(p, { today, logs: logs({ "internal-cost": [cost("甲")] }) }); assert.equal(row(x, "甲").planning, expected);
  }
});
test("行政三人固定待確認；全表最新日期自動更新，永不進缺失／clean／unable", () => {
  const p = people(["劉芳君", "彭書逸", "徐孟君"].map((name) => ({ name, group: "行政" })));
  for (const latest of ["2026-10-08", "2026-10-20", "2026-11-01"]) {
    const r = run(p, { logs: logs({ "admin-work": [{ fields: { "工作日期-營業額明細": latest, "營業額人員-明細": "劉芳君" } }] }), attendance: full(Object.fromEntries(p.records.map((p) => [p.id, { "2026-10-19": { status: "已出勤" } }]))) });
    assert.equal(r.adminLatest, latest); assert.equal(r.summary.checked, 3); assert.equal(r.summary.assessed, 0); assert.equal(r.summary.sourcePending, 3); assert.equal(r.summary.dataAttention, 3);
    for (const k of ["attention", "missed", "clean", "unable"]) assert.equal(r.summary[k], 0, k);
    for (const x of r.rows) assert.deepEqual([x.kind, x.planning, x.log], ["source_pending", "待確認", "待確認"]);
  }
});
const nine = ["朱雅琪", "林瑩瑄", "吳沛柔", "朱雅雯", "沈宜蓁", "涂振邦", "張家彬", "胡畯評", "謝椀曳"];
const plannedNine = new Set(["朱雅琪", "朱雅雯", "沈宜蓁", "涂振邦", "胡畯評", "謝椀曳"]);
for (const name of nine) test(`10/19 九人逐人斷言：${name} ${plannedNine.has(name) ? "排" : "未排"}／填`, () => {
  const p = people(nine.map((name) => ({ name, group: name === "涂振邦" ? "PM" : "控制" })));
  const s = schedule([...plannedNine].map((name) => ({ ids: [name], end: name === "沈宜蓁" ? "2026-10-20" : "2026-10-19" })));
  const r = run(p, { schedule: s, logs: logs({ "pm-cost": nine.filter((n) => ["涂振邦", "張家彬", "胡畯評"].includes(n)).map((n) => cost(n, "2026-10-19", "pm-cost")), "internal-cost": [...nine.filter((n) => !["涂振邦", "張家彬", "胡畯評"].includes(n)).map((n) => cost(n)), cost("謝椀曳")] }) });
  const x = row(r, name); assert.equal(x.planning, plannedNine.has(name) ? "排" : "未排"); assert.equal(x.log, "填");
  assert.equal(row(r, "沈宜蓁", "2026-10-20").planning, "排"); assert.equal(r.rows.filter((x) => x.name === "謝椀曳" && x.date === "2026-10-19").length, 1);
  assert.equal(r.summary.missed, 0); // 10/19 is in grace; these are not nine overdue-log fixes.
});
test("輸出共用狀態與分母；打卡獨立；統計集合不變量及資料注意可與clean重疊", () => {
  const p = people([{ name: "乾淨", group: "" }, { name: "缺失", group: "業務" }, { name: "無活動" }, { name: "劉芳君", group: "行政" }, { name: "全假" }, { name: "許茂坤" }, { name: "陳星穎" }]);
  const r = run(p, { schedule: schedule([{ ids: ["乾淨"] }]), logs: logs({ "internal-cost": [cost("乾淨"), cost("缺失")] }), attendance: { ...full({ 全假: Object.fromEntries(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19", "2026-10-20"].map((d) => [d, { leave: "leave" }])) }), members: ["乾淨"] } });
  const s = r.summary; assert.equal(s.active, s.checked + 2); assert.equal(s.checked, s.attention + s.unable + s.clean + s.sourcePending); assert.equal(s.missed <= s.attention, true);
  assert.equal(s.checked, 5); assert.equal(s.assessed, 4); assert.equal(s.clean, 1); assert.equal(s.unable, 2); assert.equal(s.dataAttention, 2); assert.equal(s.attention, 1); assert.equal(s.unschedOnly, 1); assert.equal(s.punchMissing, 1); assert.equal(s.totalAttention, 5);
  for (const x of r.rows) { const csv = checkCsvRow(x); assert.equal(csv[4], checkText(x, "planning")); assert.equal(csv[5], checkText(x, "log")); assert.equal(csv[8], statusText(x)); }
  assert.deepEqual(s.attentionByDivision, { 外業: 0, 內業: 0, 業務: 1 }); assert.equal(s.byDivision.業務.attention, 1); assert.equal(s.byDivision.內業.checked, 4);
});
test("現有假勤沿用來源但明示不相容：punch不能代替 workedAttendance，未知不當成無活動", () => {
  assert.throws(() => existingAttendance({ status: "error" }));
  const a = existingAttendance({ status: "ok", leave: {}, punch: { 甲: ["2026-10-19"] }, members: ["甲"] });
  assert.equal(a.restCounts, undefined);
  const r = run(people([{ name: "甲" }]), { attendance: a }); assert.equal(r.compatibility, "existing-api"); assert.equal(row(r, "甲").kind, "unknown"); assert.equal(r.summary.clean, 0); assert.equal(r.summary.unable, 0); assert.equal(r.summary.attendanceUnknown, 1); assert.equal(r.summary.attention, 0);
});
test("展示業別最多票／平手順序與共享資格獨立；PM保持內業", () => {
  const p = people([{ name: "甲", group: "水深C" }, { name: "乙", group: "PM" }]);
  const r = run(p, { schedule: schedule([{ ids: ["甲", "乙"], trade: "業務" }, { ids: ["甲"], trade: "內業" }]) });
  assert.equal(row(r, "甲").classification, "業務"); assert.equal(row(r, "乙").classification, "內業"); assert.equal(isFieldGroup(row(r, "甲").effectiveGroup), true);
});
test("專用示範名冊、預排與成本單 link 可互通", () => {
  const p = yupaiDemo("yupai-v3-people"), s = yupaiDemo("yupai-v3-schedule"), dates = s.records.map((r) => r.fields.開始日期).sort();
  const r = evaluateRange({ people: p, schedule: s, logs: Object.fromEntries(Object.keys(LOG_FIELDS).map((k) => [k, yupaiDemo(`yupai-v3-${k}`)])), attendance: full(), start: dates[0], end: dates.at(-1), today: dates.at(-1) });
  assert.ok(r.rows.some((r) => r.planning === "排" && r.log === "填")); assert.ok(r.rows.some((r) => r.name === "外業示範乙" && r.planning === "排"));
});
test("豁免預排日誌仍獨立檢查打卡；離職不檢查打卡", () => {
  const r = run(people([{ name: "許茂坤" }, { name: "陳星穎" }]), { attendance: { ...full(), members: ["許茂坤", "陳星穎"] } });
  assert.equal(r.rows.length, 0); assert.equal(r.summary.checked, 0); assert.equal(r.summary.attention, 0); assert.equal(r.summary.punchMissing, 1);
  assert.ok(r.punchRows.filter((r) => r.name === "許茂坤").some((r) => r.missing)); assert.ok(r.punchRows.filter((r) => r.name === "陳星穎").every((r) => !r.missing && r.status === "不檢核"));
});
test("五種既有出勤狀態才是活動；待確認不是出勤；0件請假不視為假", () => {
  const p = people([{ name: "甲" }]);
  for (const status of ["已出勤", "外業出勤", "休息日出工", "已出勤（打卡＋外業）", "有出勤／有請假"]) {
    const r = run(p, { attendance: full({ 甲: { "2026-10-16": { status } } }) });
    const d = row(r, "甲", "2026-10-16"); assert.deepEqual([d.kind, d.planning, d.log], ["work", "未排", "未填"], status); assert.equal(r.summary.missed, 1);
  }
  for (const leaveCount of [0, "0", "0.0", "", null]) {
    const r = run(p, { attendance: full({ 甲: { "2026-10-19": { status: "待確認", leaveCount } } }) }); assert.equal(row(r, "甲").kind, "none");
  }
});
test("零工作日仍保留 checked／sourcePending；cutoff 沒有過去工作日時用today", () => {
  const p = people([{ name: "甲" }, { name: "劉芳君", group: "行政" }]);
  const r = run(p, { start: "2026-10-17", end: "2026-10-18" });
  assert.equal(r.rows.length, 0); assert.equal(r.summary.checked, 2); assert.equal(r.summary.sourcePending, 1); assert.equal(r.summary.unable, 1); assert.equal(r.cutoff, "2026-10-20");
  const future = run(p, { start: "2026-10-26", end: "2026-10-30" }); assert.equal(future.cutoff, "2026-10-20");
});
test("缺工作日不回退出工日期；工作日期存在但空白亦不回退", () => {
  const p = people([{ name: "甲" }]);
  const r = run(p, { logs: logs({ "field-work": [
    { fields: { 出工日期: "2026-10-19", 此單出工人: "甲" } },
    { fields: { "工作日期-薪資": null, 出工日期: "2026-10-19", 此單出工人: "甲" } },
    { fields: { "工作日期-薪資": "2026-10-19", 出工日期: "2026-10-20", 此單出工人: "甲" } },
  ] }) });
  assert.equal(row(r, "甲").log, "填"); assert.equal(row(r, "甲", "2026-10-20").log, "·");
});
