// R04 出勤／出差示範資料（全部虛構）。放在 demo.ts 之外，讓 node 直接載入 demo.ts 的測試
// 不必解析 attendanceCore（Next 以外不補 .ts 副檔名）。
import { buildAttendanceView, weekDates, ymdInt, type AttendanceResponse, type LarkUserApprovals, type LarkUserTask } from "./attendanceCore";
import { demoOpenId, otPeople, otPeopleGroups } from "./demo";

// R04 出勤／出差示範：假的 Lark 假勤回應 → 走同一套 buildAttendanceView。全部虛構。
export function demoAttendance(weekStart: number, now: number): AttendanceResponse {
  const dates = weekDates(weekStart);
  const roster = otPeople.map((name, i) => ({ name, group: otPeopleGroups[i], openId: demoOpenId(name) }));
  const employeeIds = new Map(roster.map((p) => [p.openId, `demo_emp_${p.name}`]));
  const R = (i: string, o: string, si = "None", so = "None") => ({ check_in_result: i, check_out_result: o, check_in_result_supplement: si, check_out_result_supplement: so });
  const tasks: LarkUserTask[] = [];
  roster.forEach((p, pi) => {
    dates.forEach((d, di) => {
      const uid = employeeIds.get(p.openId)!;
      const rec = di >= 5 ? R("NoNeedCheck", "NoNeedCheck") : pi === 1 && di === 1 ? R("NoNeedCheck", "NoNeedCheck", "Leave", "Leave") : pi === 2 && di === 2 ? R("Late", "Normal") : pi === 3 && di === 3 ? R("Normal", "Early") : pi === 4 && di === 0 ? R("Lack", "Normal") : pi === 5 && di === 4 ? R("NoNeedCheck", "NoNeedCheck", "GoOut", "None") : R("Normal", "Normal");
      tasks.push({ user_id: uid, day: ymdInt(d), records: [rec] });
    });
  });
  const approvals: LarkUserApprovals[] = [
    { user_id: employeeIds.get(roster[0].openId), trips: [{ approval_id: "demo_trip_1", start_time: `${dates[2]} 09:00:00`, end_time: `${dates[3]} 18:00:00`, reason: "（示範）赴外縣市辦理控制測量查核" }] },
  ];
  tasks.forEach((t) => {
    if (t.user_id === employeeIds.get(roster[0].openId) && (t.day === ymdInt(dates[2]) || t.day === ymdInt(dates[3]))) t.records = [R("NoNeedCheck", "NoNeedCheck", "Travel", "Travel")];
  });
  return buildAttendanceView({
    weekStart, now, roster, employeeIds, members: new Set(employeeIds.values()), tasks, approvals, source: "demo",
    notes: { rosterInService: roster.length + 1, noAccount: 1, groupCount: 1, invalidIds: 0 },
  });
}
