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
} from "../lib/attendanceCore.ts";
import { PEOPLE_NAME, PEOPLE_ACCOUNT, PEOPLE_GROUP, PEOPLE_ACTIVE } from "../lib/people.ts";

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

test("今天的缺卡算進行中，不算缺卡", () => {
  assert.equal(classifyDay([rec("Normal", "Lack")], { isToday: true }), "pending");
  assert.equal(classifyDay([rec("Late", "Normal")], { isToday: true }), "late");
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
        task("emp_A", 20261007, [rec("Normal", "Lack")]), // 今天
        task("emp_A", 20261008, [rec("Lack", "Lack")]), // 未來（理論上 API 不會回，仍不可算缺卡）
        task("emp_B", 20261005, [rec("Lack", "Normal")]),
        task("emp_B", 20261006, [rec("NoNeedCheck", "NoNeedCheck", "Leave", "Leave")]),
        task("emp_B", 20261010, [rec("NoNeedCheck", "NoNeedCheck")]),
      ],
    }),
  );
  assert.equal(v.status, "ok");
  const a = v.people.find((p) => p.name === "甲");
  assert.deepEqual(a.days, ["ok", "late", "pending", "future", "future", "future", "future"]);
  const b = v.people.find((p) => p.name === "乙");
  assert.deepEqual(b.days, ["lack", "leave", "none", "future", "future", "future", "future"].map((x, i) => (i === 5 ? "future" : x)));
  assert.equal(v.people.length, 2); // 丙不在考勤組
  assert.deepEqual(v.summary, { expected: 3, present: 2, late: 1, early: 0, lack: 1, leave: 1, trip: 0, out: 0 });
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
  const s = JSON.stringify(v);
  for (const x of [...SECRET, "某工地", "longitude", "latitude", "photo", "check_time", "user_id", "employee_id", "open_id", "T1", "approval_id"]) assert.ok(!s.includes(x), x);
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
  assert.deepEqual(r.people, [
    { name: "甲", group: "圖報A", openId: "ou_a" },
    { name: "乙", group: "（未填組別）", openId: "ou_b" },
  ]);
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
