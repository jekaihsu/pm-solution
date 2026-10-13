// R04 出勤／出差口徑測試：狀態判定、分母扣請假出差、未來日、台北週界、出差重疊、白名單輸出。不連 Lark。
// Usage: node --test scripts/test-attendance.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyDay,
  taipeiDate,
  weekDates,
  buildAttendanceView,
  buildRoster,
  resolveMembers,
  parseMissingScopes,
  truncateText,
  fieldCostWarning,
  parseFieldCost,
  fieldCostError,
  leaveCoverage,
  attendanceErrorText,
  FIELD_ALL_EMPTY_BASELINE,
  FIELD_ALL_EMPTY_LIMIT,
} from "../lib/attendanceCore.ts";
import { PEOPLE_NAME, PEOPLE_ACCOUNT, PEOPLE_GROUP, PEOPLE_ACTIVE } from "../lib/people.ts";
import { register } from "node:module";

// demoAttendance.ts 用不帶副檔名的相對 import（Next 才解得開）：測試裡補上 .ts
register("data:text/javascript," + encodeURIComponent("export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if(s.startsWith('.')&&!/\.\w+$/.test(s))return n(s+'.ts',c);throw e}}"));

// 白名單輸出檢查：任何回應都不得含 id、地點、打卡時間、Lark API 路徑／token
const LEAK = ["某工地", "longitude", "latitude", "photo", "check_time", "user_id", "employee_id", "open_id", "approval_id", "uniq_id", "recordId", "leaderIds", "crewIds", "fldmg63eFl", "fldQh6cdMp", "flddpaUr6b", "tblQCy3eU0wsUj1I", "Sdw1bG1djaHsVGsRPvmjyVWipgg", "larksuite", "/bitable/", "demo_emp_", "demo_rec_", "ou_demo_"];
const assertNoLeak = (v, extra = []) => {
  const s = JSON.stringify(v);
  for (const x of [...SECRET, ...LEAK, ...extra]) assert.ok(!s.includes(x), x);
};

const rec = (i = "Normal", o = "Normal", si = "None", so = "None") => ({
  check_in_result: i,
  check_out_result: o,
  check_in_result_supplement: si,
  check_out_result_supplement: so,
});

test("狀態判定：各 result／supplement 組合", () => {
  assert.equal(classifyDay([rec()]), "ok");
  assert.equal(classifyDay([rec("SystemCheck", "Normal")]), "ok");
  assert.equal(classifyDay([rec("Late", "Normal")]), "late");
  assert.equal(classifyDay([rec("Normal", "Early")]), "early");
  assert.equal(classifyDay([rec("Late", "Early")]), "late-early");
  assert.equal(classifyDay([rec("Lack", "Normal")]), "lack");
  assert.equal(classifyDay([rec("Normal", "Lack")]), "lack");
  for (const s of ["CardReplacement", "CardReplacementApplication", "ManagerModification"])
    assert.equal(classifyDay([rec("Lack", "Normal", s)]), "ok", s);
  assert.equal(classifyDay([rec("Lack", "Normal", "ShiftChange")]), "lack");
  assert.equal(classifyDay([rec("NoNeedCheck", "NoNeedCheck")]), "off");
  assert.equal(classifyDay([]), "none");
  assert.equal(classifyDay(undefined), "none");
});

test("supplement 先於 NoNeedCheck：請假／外出／出差不會被當成免打卡", () => {
  assert.equal(classifyDay([rec("NoNeedCheck", "NoNeedCheck", "Leave", "Leave")]), "leave");
  assert.equal(classifyDay([rec("NoNeedCheck", "NoNeedCheck", "GoOut", "None")]), "out");
  assert.equal(classifyDay([rec("Normal", "Normal", "Travel", "Travel")]), "trip");
});

test("user_approvals 覆蓋該應打卡日→扣分母；但免打卡日（週末）不被誤算", () => {
  assert.equal(classifyDay([rec()], { approval: "trip" }), "trip");
  assert.equal(classifyDay([rec("NoNeedCheck", "NoNeedCheck")], { approval: "trip" }), "off");
});

test("週次邊界（台北時區）", () => {
  const mon = Date.UTC(2026, 9, 4, 16, 0); // 台北 2026-10-05 00:00
  assert.equal(taipeiDate(mon - 1), "2026-10-04");
  assert.equal(taipeiDate(mon), "2026-10-05");
  assert.deepEqual(weekDates(mon), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  // 週中任一時間點都歸到同一週的週一
  assert.equal(weekDates(mon + 3 * 86400000 + 5 * 3600000)[0], "2026-10-05");
  // 跨月跨年
  assert.equal(weekDates(Date.UTC(2026, 11, 27, 16))[6], "2027-01-03");
});

// ---- 整體 view ----
const SECRET = ["emp_A", "emp_B", "emp_C", "ou_a", "ou_b", "ou_c"];
const roster = [
  { name: "甲", group: "圖報A", openId: "ou_a" },
  { name: "乙", group: "圖報B", openId: "ou_b" },
  { name: "丙", group: "水深A", openId: "ou_c" },
];
const employeeIds = new Map([["ou_a", "emp_A"], ["ou_b", "emp_B"], ["ou_c", "emp_C"]]);
const task = (uid, day, records, extra = {}) => ({ user_id: uid, day, employee_name: "x", group_id: "g1", records, ...extra });
const NOW = Date.UTC(2026, 9, 7, 6, 0); // 台北週三 14:00（2026-10-07）
const WEEK = Date.UTC(2026, 9, 4, 16, 0);
const base = (o = {}) => ({
  weekStart: WEEK,
  now: NOW,
  roster,
  employeeIds,
  members: new Set(["emp_A", "emp_B"]),
  tasks: [],
  approvals: [],
  notes: { rosterInService: 3, noAccount: 0, groupCount: 1, invalidIds: 0 },
  ...o,
});

test("未來日不算缺卡；摘要與分母", () => {
  const v = buildAttendanceView(
    base({
      tasks: [
        task("emp_A", 20261005, [rec()]),
        task("emp_A", 20261006, [rec("Late", "Normal")]),
        task("emp_A", 20261007, [rec("Lack", "Lack")]), // 今天沒打卡＝缺卡
        task("emp_A", 20261008, [rec("Lack", "Lack")]), // 未來（理論上 API 不會回，仍不可算缺卡）
        task("emp_B", 20261005, [rec("Lack", "Normal")]),
        task("emp_B", 20261006, [rec("NoNeedCheck", "NoNeedCheck", "Leave", "Leave")]),
        task("emp_B", 20261010, [rec("NoNeedCheck", "NoNeedCheck")]),
      ],
    }),
  );
  assert.equal(v.status, "ok");
  const a = v.people.find((p) => p.name === "甲");
  assert.deepEqual(a.days, ["ok", "late", "lack", "future", "future", "future", "future"]);
  const b = v.people.find((p) => p.name === "乙");
  assert.deepEqual(b.days, ["lack", "leave", "none", "future", "future", "future", "future"].map((x, i) => (i === 5 ? "future" : x)));
  assert.equal(v.people.length, 2); // 丙不在考勤組
  assert.deepEqual(v.summary, { expected: 4, present: 2, late: 1, early: 0, lack: 2, leave: 1, trip: 0, out: 0, field: 0 });
});

test("user_approvals 的請假覆蓋應打卡日→扣分母並計請假天數", () => {
  const v = buildAttendanceView(
    base({
      tasks: [task("emp_A", 20261005, [rec()]), task("emp_A", 20261006, [rec()])],
      approvals: [{ user_id: "emp_A", date: 20261006, leaves: [{ uniq_id: "L1", start_time: "2026-10-06 09:00:00", end_time: "2026-10-06 18:00:00" }] }],
    }),
  );
  assert.deepEqual(v.people.find((p) => p.name === "甲").days.slice(0, 2), ["ok", "leave"]);
  assert.equal(v.summary.expected, 1);
  assert.equal(v.summary.leave, 1);
});

test("出差：以 approval_id 去重、與週重疊才列、天數與截斷事由", () => {
  const trip = (id, s, e, reason) => ({ approval_id: id, start_time: s, end_time: e, reason });
  const long = "測".repeat(50);
  const v = buildAttendanceView(
    base({
      approvals: [
        { user_id: "emp_C", date: 20261005, trips: [trip("T1", "2026-10-03 09:00:00", "2026-10-06 18:00:00", long)] },
        { user_id: "emp_C", date: 20261006, trips: [trip("T1", "2026-10-03 09:00:00", "2026-10-06 18:00:00", long)] }, // 重複
        { user_id: "emp_A", trips: [trip("T2", "2026-09-20", "2026-09-25", "上個月")] }, // 不重疊
        { user_id: "emp_B", trips: [trip("T3", "2026-10-11 08:00:00", "2026-10-12 18:00:00", "週日開始")] }, // 週日重疊
        { user_id: "emp_B", trips: [trip("T4", "2026-09-28 00:00:00", "2026-10-05 00:00:00", "午夜結束")] }, // 結束於週一 00:00＝不含週一
      ],
    }),
  );
  assert.equal(v.trips.length, 2);
  const t1 = v.trips.find((t) => t.name === "丙");
  assert.equal(t1.start, "2026-10-03");
  assert.equal(t1.end, "2026-10-06");
  assert.equal(t1.days, 4);
  assert.equal(t1.daysInWeek, 2);
  assert.equal(Array.from(t1.reason).length, 41); // 40 字 + …
  const t3 = v.trips.find((t) => t.name === "乙");
  assert.equal(t3.daysInWeek, 1);
  assert.equal(t3.days, 2);
});

test("出差範圍不限考勤組：丙不在考勤組但出差仍列出", () => {
  const v = buildAttendanceView(base({ approvals: [{ user_id: "emp_C", trips: [{ approval_id: "T9", start_time: "2026-10-06", end_time: "2026-10-06", reason: "x" }] }] }));
  assert.equal(v.trips.length, 1);
  assert.ok(!v.people.some((p) => p.name === "丙"));
});

test("白名單輸出：不含 employee_id、open_id、地點、GPS、照片、打卡時間", () => {
  const v = buildAttendanceView(
    base({
      tasks: [
        task("emp_A", 20261005, [{ ...rec(), location_name: "某工地", longitude: 121.5, latitude: 25.0, photo_urls: ["http://p"], check_in_record: { check_time: "1760000000", location_name: "x" } }]),
      ],
      approvals: [{ user_id: "emp_C", trips: [{ approval_id: "T1", start_time: "2026-10-06", end_time: "2026-10-06", reason: "r" }] }],
    }),
  );
  assertNoLeak(v, ["T1"]);
});

// ---- 出差／外出紀錄（業主 2026-10-13：外出加出差都要）----
const out = (id, s, e, interval, reason = "外出事由") => ({ approval_id: id, start_time: s, end_time: e, interval, reason, unit: 2 });

test("外出：同一 approval_id 在多個項目出現只列一次；缺 approval_id 用 uniq_id", () => {
  const o = out("O1", "2026-10-07 09:00:00", "2026-10-07 18:00:00", 32400);
  const v = buildAttendanceView(
    base({
      approvals: [
        { user_id: "emp_C", date: 20261007, outs: [o] },
        { user_id: "emp_C", date: 20261008, outs: [o] },
        { user_id: "emp_C", date: 20261009, outs: [{ uniq_id: "U9", start_time: "2026-10-09 13:00:00", end_time: "2026-10-09 15:00:00", interval: 7200 }] },
        { user_id: "emp_C", date: 20261009, outs: [{ uniq_id: "U9", start_time: "2026-10-09 13:00:00", end_time: "2026-10-09 15:00:00", interval: 7200 }] },
      ],
    }),
  );
  assert.equal(v.outs.length, 2);
  assert.deepEqual(v.recordCounts, { trips: 0, outs: 2 });
});

test("外出時長＝interval／3600 四捨五入到 0.5 小時；interval 缺時用起訖差", () => {
  const v = buildAttendanceView(
    base({
      approvals: [
        { user_id: "emp_C", outs: [out("O1", "2026-10-07 09:00:00", "2026-10-07 18:00:00", 32400)] }, // 9
        { user_id: "emp_C", outs: [out("O2", "2026-10-08 09:00:00", "2026-10-08 10:20:00", 4800)] }, // 1.333 → 1.5
        { user_id: "emp_C", outs: [out("O3", "2026-10-09 09:00:00", "2026-10-09 11:00:00", undefined)] }, // 起訖差 2
        { user_id: "emp_C", outs: [out("O4", "2026-10-06 09:00:00", "2026-10-06 09:20:00", 1200)] }, // 0.333 → 0.5
      ],
    }),
  );
  const h = Object.fromEntries(v.outs.map((r) => [r.start.slice(5), r.hours]));
  assert.deepEqual(h, { "10-07": 9, "10-08": 1.5, "10-09": 2, "10-06": 0.5 });
  assert.equal(v.outs.find((r) => r.hours === 9).timeText, "10/07 09:00–18:00");
});

test("外出＋出差合併成一份清單，依開始時間排序，並有各自張數", () => {
  const v = buildAttendanceView(
    base({
      approvals: [
        { user_id: "emp_C", trips: [{ approval_id: "T1", start_time: "2026-10-07 09:00:00", end_time: "2026-10-08 18:00:00", reason: "出差" }] },
        { user_id: "emp_B", outs: [out("O1", "2026-10-06 14:00:00", "2026-10-06 16:00:00", 7200)] },
        { user_id: "emp_A", outs: [out("O2", "2026-10-07 08:00:00", "2026-10-07 09:00:00", 3600)] },
      ],
    }),
  );
  assert.deepEqual(v.records.map((r) => `${r.kind}:${r.name}`), ["out:乙", "out:甲", "trip:丙"]);
  assert.deepEqual(v.recordCounts, { trips: 1, outs: 2 });
  const trip = v.records.find((r) => r.kind === "trip");
  assert.equal(trip.timeText, "10/07–10/08");
  assert.equal(trip.duration, 2);
  assert.equal(trip.unit, "天");
});

test("外出清單：與週不重疊不列；出勤統計不變（外出仍扣分母）", () => {
  const v = buildAttendanceView(
    base({
      tasks: [task("emp_A", 20261005, [rec()]), task("emp_A", 20261006, [rec()])],
      approvals: [
        { user_id: "emp_A", outs: [out("O1", "2026-10-06 09:00:00", "2026-10-06 18:00:00", 32400)] },
        { user_id: "emp_A", outs: [out("O2", "2026-09-20 09:00:00", "2026-09-20 18:00:00", 32400)] },
      ],
    }),
  );
  assert.equal(v.outs.length, 1);
  assert.equal(v.summary.out, 1);
  assert.equal(v.summary.expected, 1);
});

test("外出白名單輸出：不含 id、地點", () => {
  const v = buildAttendanceView(
    base({ approvals: [{ user_id: "emp_C", outs: [{ ...out("OUT_SECRET", "2026-10-07 09:00:00", "2026-10-07 10:00:00", 3600), uniq_id: "UQ_SECRET", location: "某工地", i18n_names: { zh: "外出" } }] }] }),
  );
  assertNoLeak(v, ["OUT_SECRET", "UQ_SECRET", "i18n", "approve_pass_time"]);
});

test("考勤組成員＝綁定人員＋展開綁定部門－排除人員－排除部門", () => {
  const deptUsers = new Map([["od-1", ["u1", "u2", "u3"]], ["od-2", ["u3", "u4"]], ["od-x", ["u4"]]]);
  const m = resolveMembers({ bindUsers: ["u9", "u1"], bindDepts: ["od-1", "od-2"], exceptUsers: ["u2"], exceptDepts: ["od-x"] }, deptUsers);
  assert.deepEqual([...m].sort(), ["u1", "u3", "u9"]);
});

test("名冊：只取在職；沒有 Lark帳號只計人數", () => {
  const row = (name, group, active, id) => ({
    fields: { [PEOPLE_NAME]: name, [PEOPLE_GROUP]: group, [PEOPLE_ACTIVE]: active },
    people: id ? { [PEOPLE_ACCOUNT]: [{ id, name }] } : undefined,
  });
  const r = buildRoster(
    [row("甲", "圖報A", true, "ou_a"), row("乙", null, true, "ou_b"), row("丙", "水深A", true, null), row("丁", "水深A", false, "ou_d")],
    { name: PEOPLE_NAME, group: PEOPLE_GROUP, active: PEOPLE_ACTIVE, account: PEOPLE_ACCOUNT },
  );
  assert.equal(r.inService, 3);
  assert.equal(r.noAccount, 1);
  assert.deepEqual(r.noAccountPeople, [{ name: "丙", group: "水深A" }]); // 外業用：沒帳號的人也要能對成本單
  assert.deepEqual(r.people, [
    { name: "甲", group: "圖報A", openId: "ou_a" },
    { name: "乙", group: "（未填組別）", openId: "ou_b" },
  ]);
});

test("名冊保留人員名單 record_id（供外業成本單對人；不會輸出）", () => {
  const r = buildRoster(
    [{ id: "recA", fields: { [PEOPLE_NAME]: "甲", [PEOPLE_GROUP]: "外業A", [PEOPLE_ACTIVE]: true }, people: { [PEOPLE_ACCOUNT]: [{ id: "ou_a", name: "甲" }] } }],
    { name: PEOPLE_NAME, group: PEOPLE_GROUP, active: PEOPLE_ACTIVE, account: PEOPLE_ACCOUNT },
  );
  assert.equal(r.people[0].recordId, "recA");
});

test("缺權限訊息解析", () => {
  assert.deepEqual(
    parseMissingScopes({ msg: "Access denied. One of the following scopes is required: [attendance:task:readonly, attendance:task]. Application scope list ..." }),
    ["attendance:task:readonly"],
  );
  assert.deepEqual(parseMissingScopes({ violations: ["contact:user.employee_id:readonly"], msg: "" }), ["contact:user.employee_id:readonly"]);
  assert.deepEqual(parseMissingScopes({ msg: "nothing" }), []);
});

test("事由截斷 40 字並壓平換行", () => {
  assert.equal(truncateText("a\nb  c", 40), "a b c");
  assert.equal(Array.from(truncateText("字".repeat(41), 40)).length, 41);
  assert.equal(truncateText(undefined, 40), "");
});

// ---- 業主 2026-10-13：外業出勤、半天假、出差外出扣分母、今天缺卡 ----
const roster2 = [
  { name: "甲", group: "圖報A", openId: "ou_a", recordId: "recA" },
  { name: "乙", group: "圖報B", openId: "ou_b", recordId: "recB" },
  { name: "丙", group: "水深A", openId: "ou_c", recordId: "recC" },
  { name: "丁", group: "外業A", openId: "ou_d", recordId: "recD" },
  { name: "戊", group: "外業A", openId: "ou_e", recordId: "recE" },
];
const ids2 = new Map([...employeeIds, ["ou_d", "emp_D"], ["ou_e", "emp_E"]]);
const base2 = (o = {}) => base({ roster: roster2, employeeIds: ids2, ...o });
const fc = (rows, extra = {}) => ({ rows, ...extra });
const person = (v, n) => v.people.find((p) => p.name === n);

test("外業：有成本單的日子＝出勤並納入分母；組長與實際出工人都算", () => {
  const v = buildAttendanceView(base2({ fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recD"], crewIds: ["recE"] }]) }));
  assert.deepEqual(person(v, "丁").days.slice(0, 2), ["field", "nofield"]);
  assert.deepEqual(person(v, "戊").days.slice(0, 2), ["field", "nofield"]);
  assert.equal(v.summary.expected, 2);
  assert.equal(v.summary.present, 2);
  assert.equal(v.summary.field, 2);
  assert.equal(v.summary.lack, 0);
  assert.equal(v.notes.fieldPeople, 2);
});

test("外業：組長欄空白只算實際出工人；沒成本單的日子不入分母也不算缺卡", () => {
  const v = buildAttendanceView(base2({ fieldCost: fc([{ date: "2026-10-06", leaderIds: [], crewIds: ["recE"] }]) }));
  assert.ok(!person(v, "丁")); // 整週都沒成本單＝不是本週外業人員
  assert.deepEqual(person(v, "戊").days, ["nofield", "field", "nofield", "future", "future", "future", "future"]);
  assert.deepEqual([v.summary.expected, v.summary.present, v.summary.lack], [1, 1, 0]);
});

test("外業：未來日照舊 future；週末有成本單也算出勤", () => {
  const v = buildAttendanceView(base2({ fieldCost: fc([{ date: "2026-10-09", leaderIds: ["recD"], crewIds: [] }, { date: "2026-10-03", leaderIds: ["recD"], crewIds: [] }]) }));
  assert.equal(person(v, "丁"), undefined); // 10-09 是未來日、10-03 不在本週 → 本週沒有有效成本單
  const w = buildAttendanceView(base2({ now: Date.UTC(2026, 9, 11, 6, 0), fieldCost: fc([{ date: "2026-10-10", leaderIds: ["recD"], crewIds: [] }]) }));
  assert.equal(person(w, "丁").days[5], "field");
});

test("考勤組成員不受成本單影響（仍照打卡）", () => {
  const v = buildAttendanceView(base2({ tasks: [task("emp_A", 20261005, [rec("Lack", "Normal")])], fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recA"], crewIds: ["recB"] }]) }));
  assert.equal(person(v, "甲").days[0], "lack");
  assert.equal(person(v, "乙").days[0], "none");
  assert.equal(v.summary.field, 0);
  assert.equal(v.notes.fieldPeople, 0);
});

test("成本單讀不到：出勤照舊算考勤組成員，顯示原因", () => {
  const v = buildAttendanceView(base2({ tasks: [task("emp_A", 20261005, [rec()])], fieldCost: { rows: [], error: "讀不到外業成本單（1254302）" } }));
  assert.equal(v.status, "ok");
  assert.equal(v.summary.expected, 1);
  assert.equal(v.notes.fieldError, "讀不到外業成本單（1254302）");
  assert.ok(fieldCostWarning(v)?.includes("1254302"));
});

test("成本單對不到名冊的 id 只計數，不輸出", () => {
  const v = buildAttendanceView(base2({ fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recD", "recZZZ"], crewIds: ["recYYY"] }]) }));
  assert.equal(v.notes.fieldUnmatched, 2);
  assert.ok(!JSON.stringify(v).includes("recZZZ"));
});

const leave = (id, s, e, interval, unit = 3) => ({ approval_id: id, start_time: s, end_time: e, interval, unit, reason: "r" });
const lv = (uid, l) => ({ user_id: uid, leaves: [l] });

test("半天假（天為單位 interval=43200）：請假 0.5、應到 0.5、另半天到班 0.5", () => {
  const v = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261006, [rec()])],
    approvals: [lv("emp_A", leave("L1", "2026-10-06 12:30:00", "2026-10-07 00:00:00", 43200))],
  }));
  assert.equal(person(v, "甲").days[1], "leave-half");
  assert.deepEqual([v.summary.leave, v.summary.expected, v.summary.present, v.summary.lack], [0.5, 0.5, 0.5, 0]);
});

test("半天假另半天缺卡：缺卡 0.5；另半天遲到照計次且看得出來", () => {
  const v = buildAttendanceView(base2({
    // 10/06 上午假：check_in 被忽略，check_out Lack 在上班那半邊＝缺卡；10/05 下午假：check_in Late 照計
    tasks: [task("emp_A", 20261006, [rec("Normal", "Lack")]), task("emp_A", 20261005, [rec("Late", "Normal")])],
    approvals: [{ user_id: "emp_A", leaves: [leave("L1", "2026-10-06 08:00:00", "2026-10-06 12:00:00", 14400, 2), leave("L2", "2026-10-05 13:00:00", "2026-10-05 17:00:00", 14400, 2)] }],
  }));
  assert.deepEqual(person(v, "甲").days.slice(0, 2), ["leave-half-late", "leave-half-lack"]);
  assert.deepEqual([v.summary.leave, v.summary.expected, v.summary.present, v.summary.lack, v.summary.late], [1, 1, 0.5, 0.5, 1]);
});

test("半天假：Lark 把請假那半邊標 Leave supplement 時，用另一半邊判斷", () => {
  const v = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261006, [rec("NoNeedCheck", "Normal", "Leave", "None")])],
    approvals: [lv("emp_A", leave("L1", "2026-10-06 08:30:00", "2026-10-06 12:30:00", 14400, 2))],
  }));
  assert.equal(person(v, "甲").days[1], "leave-half");
  assert.deepEqual([v.summary.leave, v.summary.expected, v.summary.present], [0.5, 0.5, 0.5]);
});

test("整天假仍扣分母 1（天為單位 86400；小時為單位 8 小時）", () => {
  const v = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261005, [rec()]), task("emp_A", 20261006, [rec()]), task("emp_A", 20261007, [rec()])],
    approvals: [{ user_id: "emp_A", leaves: [leave("L1", "2026-10-06 00:00:00", "2026-10-07 00:00:00", 86400), leave("L2", "2026-10-07 08:00:00", "2026-10-07 16:00:00", 28800, 2)] }],
  }));
  assert.deepEqual(person(v, "甲").days.slice(0, 3), ["ok", "leave", "leave"]);
  assert.deepEqual([v.summary.leave, v.summary.expected], [2, 1]);
});

test("多日假含半天（1.5 天跨 2 日）：最後一天算半天", () => {
  const v = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261005, [rec()]), task("emp_A", 20261006, [rec()])],
    approvals: [lv("emp_A", leave("L1", "2026-10-05 08:00:00", "2026-10-06 12:30:00", 129600))],
  }));
  assert.deepEqual(person(v, "甲").days.slice(0, 2), ["leave", "leave-half"]);
  assert.equal(v.summary.leave, 1.5);
});

test("外業人員半天假那天有成本單＝外業出勤 0.5；沒成本單只計請假 0.5", () => {
  const v = buildAttendanceView(base2({
    fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recD"], crewIds: ["recE"] }, { date: "2026-10-06", leaderIds: ["recD"], crewIds: [] }]),
    approvals: [lv("emp_D", leave("L1", "2026-10-05 08:00:00", "2026-10-05 12:00:00", 14400, 2)), lv("emp_E", leave("L2", "2026-10-06 08:00:00", "2026-10-06 12:00:00", 14400, 2))],
  }));
  assert.equal(person(v, "丁").days[0], "leave-half");
  assert.equal(person(v, "戊").days[1], "leave-half-nofield");
  // 丁：10/05 半天假＋成本單 0.5、10/06 成本單 1；戊：10/05 成本單 1、10/06 半天假無成本單
  assert.deepEqual([v.summary.field, v.summary.expected, v.summary.present, v.summary.leave], [2.5, 2.5, 2.5, 1]);
});

test("外業人員整天請假、出差、外出：從分母扣除，不算外業出勤", () => {
  const v = buildAttendanceView(base2({
    fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recD"], crewIds: [] }, { date: "2026-10-06", leaderIds: ["recD"], crewIds: [] }, { date: "2026-10-07", leaderIds: ["recD"], crewIds: [] }]),
    approvals: [
      { user_id: "emp_D", leaves: [leave("L1", "2026-10-05 00:00:00", "2026-10-06 00:00:00", 86400)], trips: [{ approval_id: "T1", start_time: "2026-10-06", end_time: "2026-10-06", reason: "x" }], outs: [out("O1", "2026-10-07 09:00:00", "2026-10-07 18:00:00", 32400)] },
    ],
  }));
  assert.deepEqual(person(v, "丁").days.slice(0, 3), ["leave", "trip", "out"]);
  assert.deepEqual([v.summary.expected, v.summary.leave, v.summary.trip, v.summary.out, v.summary.field], [0, 1, 1, 1, 0]);
});

test("考勤組成員出差、外出：分母扣除並各計 1 天", () => {
  const v = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261005, [rec()]), task("emp_A", 20261006, [rec()]), task("emp_A", 20261007, [rec()])],
    approvals: [{ user_id: "emp_A", trips: [{ approval_id: "T1", start_time: "2026-10-06", end_time: "2026-10-06", reason: "x" }], outs: [out("O1", "2026-10-07 09:00:00", "2026-10-07 10:00:00", 3600)] }],
  }));
  assert.deepEqual(person(v, "甲").days.slice(0, 3), ["ok", "trip", "out"]);
  assert.deepEqual([v.summary.expected, v.summary.trip, v.summary.out], [1, 1, 1]);
});

test("白名單輸出（含外業與半天假）：不含 id、record_id", () => {
  const v = buildAttendanceView(base2({
    fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recD"], crewIds: ["recE", "recNOPE"] }]),
    tasks: [task("emp_A", 20261006, [rec()])],
    approvals: [lv("emp_A", leave("LSECRET", "2026-10-06 08:00:00", "2026-10-06 12:00:00", 14400, 2))],
  }));
  assertNoLeak(v, ["emp_D", "emp_E", "ou_d", "ou_e", "recA", "recB", "recC", "recD", "recE", "recNOPE", "LSECRET"]);
});

// ---- R04 審查修正：半天假依時刻判斷、今天缺卡、外業資料源 ----
test("多日假兩端都是半天：10/05 下午、10/06 上午各 0.5，請假合計 1", () => {
  const v = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261005, [rec()]), task("emp_A", 20261006, [rec()])],
    approvals: [lv("emp_A", leave("L1", "2026-10-05 12:30:00", "2026-10-06 12:30:00", 86400))],
  }));
  assert.deepEqual(person(v, "甲").days.slice(0, 2), ["leave-half", "leave-half"]);
  assert.deepEqual([v.summary.leave, v.summary.expected, v.summary.present], [1, 1, 1]);
});

test("跨週末帶半天：週五 12:30→下週一 12:30，週五與週一各 0.5、週末不計", () => {
  const l = lv("emp_A", leave("L1", "2026-10-02 12:30:00", "2026-10-05 12:30:00", 259200));
  const prev = buildAttendanceView(base2({
    weekStart: WEEK - 7 * 86400000,
    tasks: [task("emp_A", 20261002, [rec()]), task("emp_A", 20261003, [rec("NoNeedCheck", "NoNeedCheck")]), task("emp_A", 20261004, [rec("NoNeedCheck", "NoNeedCheck")])],
    approvals: [l],
  }));
  assert.deepEqual(person(prev, "甲").days.slice(4), ["leave-half", "off", "off"]);
  assert.equal(prev.summary.leave, 0.5);
  const cur = buildAttendanceView(base2({ tasks: [task("emp_A", 20261005, [rec()])], approvals: [l] }));
  assert.equal(person(cur, "甲").days[0], "leave-half");
  assert.equal(cur.summary.leave, 0.5);
});

test("同日上午兩張 2 小時假：聯集仍是上午半＝0.5（不加成整天）", () => {
  const v = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261006, [rec()])],
    approvals: [{ user_id: "emp_A", leaves: [leave("L1", "2026-10-06 09:00:00", "2026-10-06 11:00:00", 7200, 2), leave("L2", "2026-10-06 10:00:00", "2026-10-06 12:00:00", 7200, 2)] }],
  }));
  assert.equal(person(v, "甲").days[1], "leave-half");
  assert.deepEqual([v.summary.leave, v.summary.expected], [0.5, 0.5]);
});

test("同日上午＋下午兩張假：聯集＝整天 1", () => {
  const v = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261006, [rec()])],
    approvals: [{ user_id: "emp_A", leaves: [leave("L1", "2026-10-06 08:00:00", "2026-10-06 12:00:00", 14400, 2), leave("L2", "2026-10-06 13:00:00", "2026-10-06 18:00:00", 18000, 2)] }],
  }));
  assert.equal(person(v, "甲").days[1], "leave");
  assert.deepEqual([v.summary.leave, v.summary.expected], [1, 0]);
});

test("只請午休 12:00–13:00 不算請假", () => {
  const v = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261006, [rec()])],
    approvals: [lv("emp_A", leave("L1", "2026-10-06 12:00:00", "2026-10-06 13:00:00", 3600, 2))],
  }));
  assert.equal(person(v, "甲").days[1], "ok");
  assert.deepEqual([v.summary.leave, v.summary.expected], [0, 1]);
});

test("上午假：Lack 落在請假那半邊（check_in Lack）→ 半天假、到班 0.5，不是缺卡", () => {
  const v = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261006, [rec("Lack", "Normal")])],
    approvals: [lv("emp_A", leave("L1", "2026-10-06 08:00:00", "2026-10-06 12:00:00", 14400, 2))],
  }));
  assert.equal(person(v, "甲").days[1], "leave-half");
  assert.deepEqual([v.summary.leave, v.summary.expected, v.summary.present, v.summary.lack], [0.5, 0.5, 0.5, 0]);
});

test("下午假：check_out Lack 被忽略（半天假 12:30 到隔日 00:00 是真實形狀）", () => {
  const v = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261005, [rec("Normal", "Lack")]), task("emp_A", 20261006, [rec("Lack", "Normal", "CardReplacement")])],
    approvals: [{ user_id: "emp_A", leaves: [leave("L1", "2026-10-05 12:30:00", "2026-10-06 00:00:00", 43200), leave("L2", "2026-10-06 13:00:00", "2026-10-07 00:00:00", 43200)] }],
  }));
  assert.deepEqual(person(v, "甲").days.slice(0, 2), ["leave-half", "leave-half"]);
  assert.deepEqual([v.summary.present, v.summary.lack], [1, 0]);
});

test("兩邊都是 Leave／NoNeedCheck 的半天假沒打卡 → 不給到班，但請假 0.5 照計（格子 leave-half-open）", () => {
  const v = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261006, [rec("NoNeedCheck", "NoNeedCheck", "Leave", "Leave")])],
    approvals: [lv("emp_A", leave("L1", "2026-10-06 08:00:00", "2026-10-06 12:00:00", 14400, 2))],
  }));
  assert.equal(person(v, "甲").days[1], "leave-half-open");
  assert.deepEqual([v.summary.present, v.summary.expected, v.summary.leave], [0, 0, 0.5]);
});

test("只有日期、沒有時刻的單日假：interval=43200 → 0.5（不知上下午，用 Leave supplement 判斷），否則 1", () => {
  const half = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261006, [rec("NoNeedCheck", "Normal", "Leave", "None")])],
    approvals: [lv("emp_A", leave("L1", "2026-10-06", "2026-10-06", 43200))],
  }));
  assert.equal(person(half, "甲").days[1], "leave-half");
  assert.deepEqual([half.summary.leave, half.summary.expected, half.summary.present], [0.5, 0.5, 0.5]);
  const hours = buildAttendanceView(base2({ tasks: [task("emp_A", 20261006, [rec()])], approvals: [lv("emp_A", leave("L1", "2026-10-06", "2026-10-06", 14400, 2))] }));
  assert.equal(hours.summary.leave, 0.5);
  const full = buildAttendanceView(base2({ tasks: [task("emp_A", 20261006, [rec()])], approvals: [lv("emp_A", leave("L1", "2026-10-06", "2026-10-06", 86400))] }));
  assert.equal(person(full, "甲").days[1], "leave");
  assert.equal(full.summary.leave, 1);
});

test("今天只打上班卡、下班 Lack（還沒下班）→ 不算缺卡；今天上班 Lack → 缺卡；昨天下班沒打＝缺卡", () => {
  const v = buildAttendanceView(base2({
    tasks: [
      task("emp_A", 20261007, [rec("Normal", "Lack")]),
      task("emp_B", 20261007, [rec("Lack", "Lack")]),
      task("emp_A", 20261006, [rec("Normal", "Lack")]),
    ],
  }));
  assert.deepEqual(person(v, "甲").days.slice(1, 3), ["lack", "ok"]);
  assert.equal(person(v, "乙").days[2], "lack");
  const late = buildAttendanceView(base2({ tasks: [task("emp_A", 20261007, [rec("Late", "Lack")])] }));
  assert.equal(person(late, "甲").days[2], "late");
  assert.equal(late.summary.lack, 0);
});

test("外業沒 employee_id（Lark帳號換不到）：照成本單算出勤，不能查審批", () => {
  const r = [...roster2, { name: "己", group: "外業B", openId: "ou_f", recordId: "recF" }];
  const v = buildAttendanceView(base2({ roster: r, fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recF"], crewIds: [] }]) }));
  assert.deepEqual(person(v, "己").days.slice(0, 2), ["field", "nofield"]);
  assert.deepEqual([v.summary.expected, v.summary.present, v.summary.field], [1, 1, 1]);
  assert.equal(v.notes.fieldPeople, 1);
  assert.equal(v.notes.fieldNoApproval, 1);
  assert.equal(v.notes.unmapped, 1);
  assert.ok(!person(buildAttendanceView(base2({ roster: r })), "己"));
});

test("外業沒有 Lark帳號：用 noAccountPeople 的 record_id 對成本單", () => {
  const v = buildAttendanceView(base2({
    noAccountPeople: [{ name: "庚", group: "外業B", recordId: "recG" }],
    fieldCost: fc([{ date: "2026-10-06", leaderIds: [], crewIds: ["recG", "recD"] }]),
  }));
  assert.deepEqual(person(v, "庚").days.slice(0, 2), ["nofield", "field"]);
  assert.deepEqual([v.summary.expected, v.summary.field], [2, 2]);
  assert.equal(v.notes.fieldNoApproval, 1);
  assert.equal(v.notes.fieldUnmatched, 0);
  assertNoLeak(v, ["recG"]);
});

test("成本單筆數與 link 全空的計數；0 筆／link 全空／欄位缺失會有警示", () => {
  const rows = [
    { date: "2026-10-05", leaderIds: ["recD"], crewIds: [] },
    { date: "2026-10-06", leaderIds: [], crewIds: [] }, // 有日期但 link 都空
    { date: "2026-10-09", leaderIds: ["recD"], crewIds: [] }, // 未來日不算
    { date: "", leaderIds: [], crewIds: [] }, // 日期空白
  ];
  const v = buildAttendanceView(base2({ fieldCost: fc(rows) }));
  assert.deepEqual([v.notes.fieldSheets, v.notes.fieldEmptyLinks, v.notes.fieldNoDate], [2, 1, 1]);
  assert.match(fieldCostWarning(v), /外業成本單可能沒讀完整/);
  assert.match(fieldCostWarning(v), /1 筆/);
  const okv = buildAttendanceView(base2({ fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recD"], crewIds: [] }]) }));
  assert.equal(fieldCostWarning(okv), null);
  // 過去的週 0 筆＝警示；本週 0 筆（可能還沒人填）不警示
  const past = buildAttendanceView(base2({ weekStart: WEEK - 7 * 86400000, fieldCost: fc([]) }));
  assert.match(fieldCostWarning(past), /0 筆/);
  assert.equal(fieldCostWarning(buildAttendanceView(base2({ fieldCost: fc([]) }))), null);
  const err = buildAttendanceView(base2({ fieldCost: fc([], { error: "讀不到外業成本單（1254302）" }) }));
  assert.match(fieldCostWarning(err), /1254302/);
  assert.equal(fieldCostWarning(buildAttendanceView(base2())), null); // 沒提供外業資料源＝不警示
});

test("parseFieldCost：優先用 field id（欄名被改也讀得到），找不到 id 才用欄名", () => {
  const d = Date.UTC(2026, 9, 5, 2, 0); // 台北 10/05 10:00
  const renamed = parseFieldCost({
    fields: [{ id: "fldQh6cdMp", name: "日期X" }, { id: "fldmg63eFl", name: "領隊" }, { id: "flddpaUr6b", name: "出工X" }],
    records: [{ fields: { 日期X: d }, links: { 領隊: ["recD"], 出工X: ["recE", "recF"] } }],
  }, weekDates(WEEK));
  assert.deepEqual(renamed.rows, [{ date: "2026-10-05", leaderIds: ["recD"], crewIds: ["recE", "recF"] }]);
  assert.equal(renamed.error, undefined);
  const byName = parseFieldCost({
    fields: [{ id: "a", name: "工作日期" }, { id: "b", name: "組長" }, { id: "c", name: "組員" }],
    records: [{ fields: { 工作日期: d }, links: { 組長: ["recD"], 組員: ["recE"] } }],
  }, weekDates(WEEK));
  assert.deepEqual(byName.rows[0].crewIds, ["recE"]);
  assert.equal(byName.error, undefined);
});

test("parseFieldCost：找不到實際出工人欄＝可見警示；缺日期／組長欄＝讀不到；日期空白與其他週", () => {
  const d = Date.UTC(2026, 9, 5, 2, 0);
  const noCrew = parseFieldCost({
    fields: [{ id: "fldQh6cdMp", name: "工作日期" }, { id: "fldmg63eFl", name: "組長" }],
    records: [{ fields: { 工作日期: d }, links: { 組長: ["recD"] } }],
  }, weekDates(WEEK));
  assert.equal(noCrew.rows.length, 1);
  assert.match(noCrew.error, /實際出工人/);
  assert.match(fieldCostWarning(buildAttendanceView(base2({ fieldCost: noCrew }))), /實際出工人/);
  const bad = parseFieldCost({ fields: [{ id: "x", name: "別的" }], records: [] }, weekDates(WEEK));
  assert.deepEqual(bad.rows, []);
  assert.ok(bad.error);
  const mixed = parseFieldCost({
    fields: [{ id: "fldQh6cdMp", name: "工作日期" }, { id: "fldmg63eFl", name: "組長" }, { id: "flddpaUr6b", name: "實際出工人" }],
    records: [{ fields: { 工作日期: null }, links: { 組長: ["recD"] } }, { fields: { 工作日期: Date.UTC(2026, 8, 1) }, links: { 組長: ["recD"] } }, { fields: { 工作日期: d } }],
  }, weekDates(WEEK));
  assert.deepEqual(mixed.rows.map((r) => r.date), ["", "2026-10-05"]); // 其他週不留；空白日期留給計數
});

test("fieldError 是固定文案＋錯誤碼，不含 API 路徑、token、table id、原始訊息", () => {
  const e = Object.assign(new Error("GET /open-apis/bitable/v1/apps/Sdw1bG1djaHsVGsRPvmjyVWipgg/tables/tblQCy3eU0wsUj1I/records failed: RolePermNotAllow tenant_access_token=t-xyz"), { code: 1254302, larkMsg: "role perm not allow t-xyz", violations: [] });
  const msg = fieldCostError(e);
  assert.equal(msg, "讀不到外業成本單（1254302）");
  assert.equal(fieldCostError(new Error("fetch failed https://open.larksuite.com/x")), "讀不到外業成本單（未知）");
  assertNoLeak({ msg }, ["tenant_access_token", "t-xyz", "RolePermNotAllow", "open-apis"]);
});

test("名冊依 recordId 去重（同 record_id 只留一列）", () => {
  const mk = (id, name, oid) => ({ id, fields: { [PEOPLE_NAME]: name, [PEOPLE_GROUP]: "外業A", [PEOPLE_ACTIVE]: true }, people: oid ? { [PEOPLE_ACCOUNT]: [{ id: oid, name }] } : undefined });
  const r = buildRoster([mk("recA", "甲", "ou_a"), mk("recA", "甲", "ou_a"), mk("recB", "乙", null), mk("recB", "乙", null)], { name: PEOPLE_NAME, group: PEOPLE_GROUP, active: PEOPLE_ACTIVE, account: PEOPLE_ACCOUNT });
  assert.equal(r.people.length, 1);
  assert.equal(r.inService, 2);
  assert.equal(r.noAccount, 1);
  assert.equal(r.noAccountPeople.length, 1);
});

test("示範資料輸出：走同一套口徑、新欄位齊全、白名單乾淨", async () => {
  const { demoAttendance } = await import("../lib/demoAttendance.ts");
  const v = demoAttendance(WEEK, NOW);
  assert.equal(v.status, "ok");
  assert.equal(v.source, "demo");
  assert.ok(v.summary.field > 0);
  for (const k of ["fieldPeople", "fieldUnmatched", "fieldNoApproval", "fieldSheets", "fieldEmptyLinks", "fieldNoDate"]) assert.equal(typeof v.notes[k], "number", k);
  assert.equal(v.notes.fieldError, undefined);
  assert.equal(fieldCostWarning(v), null);
  assertNoLeak(v);
});

// ======== R04 第二輪審查修正 ========
const NOW10 = Date.UTC(2026, 9, 7, 2, 0); // 台北 10/07 10:00
const amLeave = (uid, day) => [{ user_id: uid, leaves: [leave("LA", `${day} 00:00:00`, `${day} 12:30:00`, 43200)] }];
const pmLeave = (uid, day) => [{ user_id: uid, leaves: [leave("LP", `${day} 12:30:00`, `${day} 23:59:00`, 43200)] }];
const sumOf = (v, ...ks) => ks.map((k) => v.summary[k]);

test("今天＋上午假：上班側沒有效打卡、下班 Lack（下午還沒結束）→ 只計請假 0.5，不入應到、不算缺卡", () => {
  const v = buildAttendanceView(base2({ approvals: amLeave("emp_A", "2026-10-07"), tasks: [task("emp_A", 20261007, [rec("NoNeedCheck", "Lack", "Leave", "None")])] }));
  assert.equal(person(v, "甲").days[2], "leave-half-open");
  assert.deepEqual(sumOf(v, "leave", "expected", "present", "lack"), [0.5, 0, 0, 0]);
  // 上班 Lack＋下班 Lack、上班 Normal 但標 Leave（屬請假那半邊）也一樣沒有下午的證據
  for (const r of [rec("Lack", "Lack"), rec("Normal", "Lack", "Leave", "None"), rec("NoNeedCheck", "Lack")]) {
    const w = buildAttendanceView(base2({ approvals: amLeave("emp_A", "2026-10-07"), tasks: [task("emp_A", 20261007, [r])] }));
    assert.equal(person(w, "甲").days[2], "leave-half-open", JSON.stringify(r));
    assert.deepEqual(sumOf(w, "leave", "expected", "lack"), [0.5, 0, 0], JSON.stringify(r));
  }
});

test("今天＋上午假：上班側有有效打卡（Normal／Late／補卡救回）、下班 Lack → 到班 0.5", () => {
  for (const r of [rec("Normal", "Lack"), rec("Late", "Lack"), rec("Lack", "Lack", "CardReplacement", "None")]) {
    const v = buildAttendanceView(base2({ approvals: amLeave("emp_A", "2026-10-07"), tasks: [task("emp_A", 20261007, [r])] }));
    assert.equal(person(v, "甲").days[2], "leave-half", JSON.stringify(r));
    assert.deepEqual(sumOf(v, "leave", "expected", "present", "lack"), [0.5, 0.5, 0.5, 0], JSON.stringify(r));
  }
  // 下班也打了＝照下班那邊判斷
  const early = buildAttendanceView(base2({ approvals: amLeave("emp_A", "2026-10-07"), tasks: [task("emp_A", 20261007, [rec("Normal", "Early")])] }));
  assert.equal(person(early, "甲").days[2], "leave-half-early");
});

test("今天＋下午假：上班側照今天規則（上班 Lack＝缺卡 0.5；有打卡＝到班 0.5）", () => {
  const lack = buildAttendanceView(base2({ now: NOW10, approvals: pmLeave("emp_A", "2026-10-07"), tasks: [task("emp_A", 20261007, [rec("Lack", "Lack")])] }));
  assert.equal(person(lack, "甲").days[2], "leave-half-lack");
  assert.deepEqual(sumOf(lack, "leave", "expected", "present", "lack"), [0.5, 0.5, 0, 0.5]);
  const ok = buildAttendanceView(base2({ now: NOW10, approvals: pmLeave("emp_A", "2026-10-07"), tasks: [task("emp_A", 20261007, [rec("Normal", "Lack")])] }));
  assert.equal(person(ok, "甲").days[2], "leave-half");
  assert.deepEqual(sumOf(ok, "leave", "expected", "present", "lack"), [0.5, 0.5, 0.5, 0]);
});

test("同樣的上午假資料在過去日照舊：另半天 Lack＝缺卡 0.5", () => {
  const v = buildAttendanceView(base2({ approvals: amLeave("emp_A", "2026-10-06"), tasks: [task("emp_A", 20261006, [rec("NoNeedCheck", "Lack", "Leave", "None")])] }));
  assert.equal(person(v, "甲").days[1], "leave-half-lack");
  assert.deepEqual(sumOf(v, "leave", "expected", "present", "lack"), [0.5, 0.5, 0, 0.5]);
  const ok = buildAttendanceView(base2({ approvals: amLeave("emp_A", "2026-10-06"), tasks: [task("emp_A", 20261006, [rec("Normal", "Normal")])] }));
  assert.deepEqual(sumOf(ok, "leave", "expected", "present", "lack"), [0.5, 0.5, 0.5, 0]);
});

test("半天假另半天遲到／早退：格子標籤依實際（遲到、早退各自一種）", () => {
  const v = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261005, [rec("Late", "Normal")]), task("emp_A", 20261006, [rec("Normal", "Early")])],
    approvals: [{ user_id: "emp_A", leaves: [leave("L1", "2026-10-05 13:00:00", "2026-10-05 18:00:00", 18000, 2), leave("L2", "2026-10-06 08:00:00", "2026-10-06 12:00:00", 14400, 2)] }],
  }));
  assert.deepEqual(person(v, "甲").days.slice(0, 2), ["leave-half-late", "leave-half-early"]);
  assert.deepEqual(sumOf(v, "late", "early"), [1, 1]);
});

test("平日半天假不因 Lark 兩側都標 Leave 或當天沒有 task 紀錄而讓請假 0.5 消失", () => {
  const both = buildAttendanceView(base2({
    tasks: [task("emp_A", 20261006, [rec("NoNeedCheck", "NoNeedCheck", "Leave", "Leave")])],
    approvals: [lv("emp_A", leave("L1", "2026-10-06 08:00:00", "2026-10-06 12:00:00", 14400, 2))],
  }));
  assert.equal(person(both, "甲").days[1], "leave-half-open");
  assert.deepEqual(sumOf(both, "leave", "expected", "present"), [0.5, 0, 0]);
  const none = buildAttendanceView(base2({ approvals: amLeave("emp_A", "2026-10-06") }));
  assert.equal(person(none, "甲").days[1], "leave-half-open");
  assert.deepEqual(sumOf(none, "leave", "expected", "present"), [0.5, 0, 0]);
  // 週末純免打卡（NoNeedCheck 且沒標 Leave）、週末沒紀錄：不計請假
  const wk = buildAttendanceView(base2({
    now: Date.UTC(2026, 9, 11, 6, 0),
    tasks: [task("emp_A", 20261010, [rec("NoNeedCheck", "NoNeedCheck")])],
    approvals: [{ user_id: "emp_A", leaves: [leave("L1", "2026-10-10 08:00:00", "2026-10-10 12:00:00", 14400, 2), leave("L2", "2026-10-11 08:00:00", "2026-10-11 12:00:00", 14400, 2)] }],
  }));
  assert.deepEqual(person(wk, "甲").days.slice(5), ["off", "none"]);
  assert.equal(wk.summary.leave, 0);
});

// 每個格子代碼只有一種意思：由格子就能推回摘要的到班／缺卡／請假（同一代碼不可時而含到班 0.5、時而不含）
const CELL_W = {
  ok: [1, 0, 0], late: [1, 0, 0], early: [1, 0, 0], "late-early": [1, 0, 0], field: [1, 0, 0], lack: [0, 1, 0], leave: [0, 0, 1],
  "leave-half": [0.5, 0, 0.5], "leave-half-late": [0.5, 0, 0.5], "leave-half-early": [0.5, 0, 0.5], "leave-half-late-early": [0.5, 0, 0.5],
  "leave-half-lack": [0, 0.5, 0.5], "leave-half-nofield": [0, 0, 0.5], "leave-half-open": [0, 0, 0.5],
};
const gridTotals = (v) => v.people.flatMap((p) => p.days).reduce((t, c) => t.map((x, i) => x + (CELL_W[c]?.[i] ?? 0)), [0, 0, 0]);
test("格子推回摘要：半天假另半天沒有證據時用 leave-half-open，不與「另半天到班」的 leave-half 混用", () => {
  const scenarios = [
    base2({ tasks: [task("emp_A", 20261006, [rec("NoNeedCheck", "NoNeedCheck", "Leave", "Leave")])], approvals: [lv("emp_A", leave("L1", "2026-10-06 08:00:00", "2026-10-06 12:00:00", 14400, 2))] }),
    base2({ approvals: amLeave("emp_A", "2026-10-06") }),
    base2({ tasks: [task("emp_A", 20261006, [rec("Normal", "Normal")])], approvals: amLeave("emp_A", "2026-10-06") }),
    base2({ fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recD"], crewIds: [] }]), approvals: [lv("emp_D", leave("L1", "2026-10-06 08:00:00", "2026-10-06 12:00:00", 14400, 2))] }),
  ];
  for (const s of scenarios) {
    const v = buildAttendanceView(s);
    assert.deepEqual(gridTotals(v), [v.summary.present, v.summary.lack, v.summary.leave], JSON.stringify(v.people.map((p) => p.days)));
  }
  const open = buildAttendanceView(scenarios[1]);
  assert.equal(person(open, "甲").days[1], "leave-half-open");
});

test("外業半天假沒有成本單：格子是 leave-half-nofield，有成本單才是 leave-half", () => {
  const v = buildAttendanceView(base2({
    fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recD"], crewIds: ["recE"] }, { date: "2026-10-06", leaderIds: ["recD"], crewIds: [] }]),
    approvals: [lv("emp_D", leave("L1", "2026-10-05 08:00:00", "2026-10-05 12:00:00", 14400, 2)), lv("emp_E", leave("L2", "2026-10-06 08:00:00", "2026-10-06 12:00:00", 14400, 2))],
  }));
  assert.equal(person(v, "丁").days[0], "leave-half");
  assert.equal(person(v, "戊").days[1], "leave-half-nofield");
  const w = buildAttendanceView(base2({
    fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recD"], crewIds: [] }]),
    approvals: [lv("emp_D", leave("L1", "2026-10-06 08:00:00", "2026-10-06 12:00:00", 14400, 2))],
  }));
  assert.equal(person(w, "丁").days[1], "leave-half-nofield");
  assert.deepEqual(sumOf(w, "leave", "expected", "field"), [0.5, 1, 1]);
});

test("成本單全空列（整張表）數量與警示門檻：基線 6，超過基線＋20 才警示", () => {
  assert.equal(FIELD_ALL_EMPTY_BASELINE, 6);
  assert.equal(FIELD_ALL_EMPTY_LIMIT, 26);
  const blank = (n) => Array.from({ length: n }, () => ({ date: "", leaderIds: [], crewIds: [] }));
  const good = [{ date: "2026-10-05", leaderIds: ["recD"], crewIds: [] }];
  const normal = buildAttendanceView(base2({ fieldCost: fc([...good, ...blank(6)]) }));
  assert.deepEqual([normal.notes.fieldAllEmpty, normal.notes.fieldNoDate], [6, 6]);
  assert.equal(fieldCostWarning(normal), null);
  assert.equal(fieldCostWarning(buildAttendanceView(base2({ fieldCost: fc([...good, ...blank(26)]) }))), null);
  const page = buildAttendanceView(base2({ fieldCost: fc([...good, ...blank(27)]) }));
  assert.equal(page.notes.fieldAllEmpty, 27);
  assert.match(fieldCostWarning(page), /整列都是空的/);
  assert.match(fieldCostWarning(page), /27 筆/);
  // 有日期但 link 空、日期空但有 link，都不算全空列
  const partial = buildAttendanceView(base2({ fieldCost: fc([{ date: "", leaderIds: ["recD"], crewIds: [] }, { date: "2026-10-05", leaderIds: [], crewIds: [] }]) }));
  assert.equal(partial.notes.fieldAllEmpty, 0);
});

test("成本單的人全部對不到名冊：有成本單、對到名冊 0 人、對不到 > 0 → 警示（只放計數）", () => {
  const v = buildAttendanceView(base2({ fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recX1"], crewIds: ["recX2", "recX3"] }]) }));
  assert.equal(v.notes.fieldMatched, 0);
  assert.equal(v.notes.fieldUnmatched, 3);
  const w = fieldCostWarning(v);
  assert.match(w, /全部對不到在職名冊/);
  assert.ok(!w.includes("recX"));
  // 有一個對到就不警示；考勤組成員被對到也算「對到名冊」
  assert.equal(fieldCostWarning(buildAttendanceView(base2({ fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recD", "recX1"], crewIds: [] }]) }))), null);
  assert.equal(fieldCostWarning(buildAttendanceView(base2({ fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recA", "recX1"], crewIds: [] }]) }))), null);
});

test("名冊：同一 Lark帳號（open_id）多列只算一個人（考勤組不重複計）；成本單接到第二列的 record_id 也對得上", () => {
  const mk = (id, name, oid) => ({ id, fields: { [PEOPLE_NAME]: name, [PEOPLE_GROUP]: "外業A", [PEOPLE_ACTIVE]: true }, people: { [PEOPLE_ACCOUNT]: [{ id: oid, name }] } });
  const r = buildRoster([mk("recA", "甲", "ou_a"), mk("recA2", "甲", "ou_a"), mk("recB", "乙", "ou_b")], { name: PEOPLE_NAME, group: PEOPLE_GROUP, active: PEOPLE_ACTIVE, account: PEOPLE_ACCOUNT });
  assert.equal(r.people.length, 2);
  assert.equal(r.inService, 2);
  const v = buildAttendanceView(base({ roster: r.people, tasks: [task("emp_A", 20261005, [rec()])], fieldCost: fc([{ date: "2026-10-05", leaderIds: ["recA2"], crewIds: [] }]) }));
  assert.equal(v.people.filter((p) => p.name === "甲").length, 1);
  assert.equal(v.summary.expected, 1);
  assert.equal(v.notes.fieldUnmatched, 0);
  // 不同 record_id、不同 open_id 但換出同一個 employee_id：也只算一人
  const dup = buildAttendanceView(base({ roster: [{ name: "甲", group: "x", openId: "ou_a", recordId: "r1" }, { name: "甲", group: "x", openId: "ou_a2", recordId: "r2" }], employeeIds: new Map([["ou_a", "emp_A"], ["ou_a2", "emp_A"]]), tasks: [task("emp_A", 20261005, [rec()])] }));
  assert.equal(dup.people.length, 1);
  assert.equal(dup.summary.expected, 1);
});

test("一般錯誤訊息只留固定文案＋錯誤碼（不含 API 路徑、base token、原始訊息）", () => {
  const e = Object.assign(new Error("GET /open-apis/bitable/v1/apps/Sdw1bG1djaHsVGsRPvmjyVWipgg/tables failed tenant_access_token=t-xyz"), { code: 1254302 });
  assert.equal(attendanceErrorText(e), "讀取出勤資料失敗（1254302）");
  assert.equal(attendanceErrorText(new Error("fetch failed https://open.larksuite.com/x")), "讀取出勤資料失敗（未知）");
  assert.equal(attendanceErrorText("boom"), "讀取出勤資料失敗（未知）");
  assertNoLeak({ m: attendanceErrorText(e) }, ["tenant_access_token", "open-apis"]);
});

// ---- 釘住變異存活點 ----
test("parseFieldCost：field id 優先於欄名（id 欄被改名、另一欄剛好叫舊名時仍用 id 那欄）", () => {
  const d = Date.UTC(2026, 9, 5, 2, 0);
  const r = parseFieldCost({
    fields: [{ id: "fldQh6cdMp", name: "日期X" }, { id: "zzz1", name: "工作日期" }, { id: "fldmg63eFl", name: "領隊" }, { id: "zzz2", name: "組長" }, { id: "flddpaUr6b", name: "出工X" }, { id: "zzz3", name: "實際出工人" }],
    records: [{ fields: { 日期X: d, 工作日期: Date.UTC(2026, 8, 1) }, links: { 領隊: ["recD"], 組長: ["recZ"], 出工X: ["recE"], 實際出工人: ["recY"] } }],
  }, weekDates(WEEK));
  assert.deepEqual(r.rows, [{ date: "2026-10-05", leaderIds: ["recD"], crewIds: ["recE"] }]);
});

test("外業週末不套審批：週六有成本單＋整天假／出差覆蓋 → 仍是外業出勤", () => {
  const v = buildAttendanceView(base2({
    now: Date.UTC(2026, 9, 11, 6, 0),
    fieldCost: fc([{ date: "2026-10-10", leaderIds: ["recD"], crewIds: [] }, { date: "2026-10-11", leaderIds: ["recD"], crewIds: [] }]),
    approvals: [{ user_id: "emp_D", leaves: [leave("L1", "2026-10-10 00:00:00", "2026-10-11 00:00:00", 86400)], trips: [{ approval_id: "T1", start_time: "2026-10-11", end_time: "2026-10-11", reason: "x" }] }],
  }));
  assert.deepEqual(person(v, "丁").days.slice(5), ["field", "field"]);
  assert.equal(v.summary.leave, 0);
  const half = buildAttendanceView(base2({
    now: Date.UTC(2026, 9, 11, 6, 0),
    fieldCost: fc([{ date: "2026-10-10", leaderIds: ["recD"], crewIds: [] }]),
    approvals: [lv("emp_D", leave("L1", "2026-10-10 08:00:00", "2026-10-10 12:00:00", 14400, 2))],
  }));
  assert.equal(person(half, "丁").days[5], "field");
});

test("上午／下午邊界：08:00、12:00、13:00、18:00 剛好壓線不算涵蓋", () => {
  const cov = (s, e) => {
    const sm = Number(s.slice(0, 2)) * 60 + Number(s.slice(3)), em = Number(e.slice(0, 2)) * 60 + Number(e.slice(3));
    const m = leaveCoverage({ start: "2026-10-06", end: "2026-10-06", covered: new Set(["2026-10-06"]), startMin: sm, endMin: em, interval: null, unit: null }).get("2026-10-06");
    return m ? `${m.am ? "am" : ""}${m.pm ? "pm" : ""}` : "";
  };
  assert.equal(cov("07:00", "08:00"), ""); // 結束＝上班時刻
  assert.equal(cov("07:00", "08:01"), "am");
  assert.equal(cov("12:00", "13:00"), ""); // 午休
  assert.equal(cov("11:59", "13:00"), "am");
  assert.equal(cov("12:00", "13:01"), "pm");
  assert.equal(cov("17:59", "19:00"), "pm");
  assert.equal(cov("18:00", "19:00"), ""); // 開始＝下班時刻
  assert.equal(cov("08:00", "18:00"), "ampm");
});

test("只有日期的假：小時制 4 小時以內＝半天、超過 4 小時＝整天；天制 12 小時以內＝半天", () => {
  const run = (interval, unit) => buildAttendanceView(base2({ tasks: [task("emp_A", 20261006, [rec()])], approvals: [lv("emp_A", leave("L1", "2026-10-06", "2026-10-06", interval, unit))] })).summary.leave;
  assert.equal(run(14400, 2), 0.5);
  assert.equal(run(14401, 2), 1);
  assert.equal(run(43200, 3), 0.5);
  assert.equal(run(43201, 3), 1);
  assert.equal(run(14400, 4), 0.5);
});

test("未知上下午（只有日期）：忽略標 Leave 的那一側，只看另一側", () => {
  const lv0 = [lv("emp_A", leave("L1", "2026-10-06", "2026-10-06", 43200))];
  const a = buildAttendanceView(base2({ approvals: lv0, tasks: [task("emp_A", 20261006, [rec("Lack", "NoNeedCheck", "None", "Leave")])] }));
  assert.equal(person(a, "甲").days[1], "leave-half-lack"); // 下班標 Leave → 忽略；上班 Lack 照算
  const b = buildAttendanceView(base2({ approvals: lv0, tasks: [task("emp_A", 20261006, [rec("Normal", "Lack", "None", "Leave")])] }));
  assert.equal(person(b, "甲").days[1], "leave-half"); // 下班標 Leave 的 Lack 被忽略
  assert.deepEqual(sumOf(b, "leave", "expected", "present", "lack"), [0.5, 0.5, 0.5, 0]);
  const c = buildAttendanceView(base2({ approvals: lv0, tasks: [task("emp_A", 20261006, [rec("NoNeedCheck", "Lack", "Leave", "None")])] }));
  assert.equal(person(c, "甲").days[1], "leave-half-lack");
});

test("半天假＋同日外出／出差：外出、出差整天照扣分母（請假不重複計），考勤組與外業各一", () => {
  const ap = (uid, extra) => [{ user_id: uid, leaves: [leave("L1", "2026-10-06 08:00:00", "2026-10-06 12:00:00", 14400, 2)], ...extra }];
  const goOut = { outs: [out("O1", "2026-10-06 13:00:00", "2026-10-06 15:00:00", 7200)] };
  const trip = { trips: [{ approval_id: "T1", start_time: "2026-10-06", end_time: "2026-10-06", reason: "x" }] };
  for (const [extra, code, key] of [[goOut, "out", "out"], [trip, "trip", "trip"]]) {
    const m = buildAttendanceView(base2({ tasks: [task("emp_A", 20261006, [rec()])], approvals: ap("emp_A", extra) }));
    assert.equal(person(m, "甲").days[1], code);
    assert.deepEqual(sumOf(m, "leave", key, "expected"), [0, 1, 0]);
    const f = buildAttendanceView(base2({ fieldCost: fc([{ date: "2026-10-06", leaderIds: ["recD"], crewIds: [] }]), approvals: ap("emp_D", extra) }));
    assert.equal(person(f, "丁").days[1], code);
    assert.deepEqual(sumOf(f, "leave", key, "expected", "field"), [0, 1, 0, 0]);
  }
});
