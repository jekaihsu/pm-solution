// R04 出勤／出差示範資料（全部虛構）。放在 demo.ts 之外，讓 node 直接載入 demo.ts 的測試
// 不必解析 attendanceCore（Next 以外不補 .ts 副檔名）。
import { buildAttendanceView, weekDates, ymdInt, type AttendanceResponse, type LarkUserApprovals, type LarkUserTask } from "./attendanceCore";
import { demoOpenId, otPeople, otPeopleGroups } from "./demo";

// R04 出勤／出差示範：假的 Lark 假勤回應 → 走同一套 buildAttendanceView。全部虛構。
export function demoAttendance(weekStart: number, now: number): AttendanceResponse {
  const dates = weekDates(weekStart);
  const office = otPeople.map((name, i) => ({ name, group: otPeopleGroups[i], openId: demoOpenId(name), recordId: `demo_rec_${name}` }));
  // 外業（不在考勤組）：以外業成本單的日子當出勤
  const fieldFolks = ["外業示範甲", "外業示範乙"].map((name) => ({ name, group: "外業A", openId: demoOpenId(name), recordId: `demo_rec_${name}` }));
  const roster = [...office, ...fieldFolks];
  const employeeIds = new Map(roster.map((p) => [p.openId, `demo_emp_${p.name}`]));
  const R = (i: string, o: string, si = "None", so = "None") => ({ check_in_result: i, check_out_result: o, check_in_result_supplement: si, check_out_result_supplement: so });
  const tasks: LarkUserTask[] = [];
  office.forEach((p, pi) => {
    dates.forEach((d, di) => {
      const uid = employeeIds.get(p.openId)!;
      const rec = di >= 5 ? R("NoNeedCheck", "NoNeedCheck") : pi === 1 && di === 1 ? R("NoNeedCheck", "NoNeedCheck", "Leave", "Leave") : pi === 2 && di === 2 ? R("Late", "Normal") : pi === 3 && di === 3 ? R("Normal", "Early") : pi === 4 && di === 0 ? R("Lack", "Normal") : pi === 5 && di === 4 ? R("NoNeedCheck", "NoNeedCheck", "GoOut", "None") : R("Normal", "Normal");
      tasks.push({ user_id: uid, day: ymdInt(d), records: [rec] });
    });
  });
  const approvals: LarkUserApprovals[] = [
    { user_id: employeeIds.get(roster[0].openId), trips: [{ approval_id: "demo_trip_1", start_time: `${dates[2]} 09:00:00`, end_time: `${dates[3]} 18:00:00`, reason: "（示範）赴外縣市辦理控制測量查核" }] },
    { user_id: employeeIds.get(roster[5].openId), outs: [{ approval_id: "demo_out_1", start_time: `${dates[4]} 09:00:00`, end_time: `${dates[4]} 12:30:00`, interval: 12600, reason: "（示範）赴客戶處交付成果" }] },
    { user_id: employeeIds.get(roster[2].openId), outs: [{ approval_id: "demo_out_2", start_time: `${dates[1]} 13:30:00`, end_time: `${dates[1]} 17:00:00`, interval: 12600, reason: "（示範）現場會勘" }] },
  ];
  // 半天假（下午）：另半天正常打卡
  approvals.push({ user_id: employeeIds.get(roster[4].openId), leaves: [{ approval_id: "demo_leave_half", start_time: `${dates[2]} 12:30:00`, end_time: `${dates[3]} 00:00:00`, interval: 43200, unit: 3, reason: "（示範）半天假" }] });
  tasks.forEach((t) => {
    if (t.user_id === employeeIds.get(roster[0].openId) && (t.day === ymdInt(dates[2]) || t.day === ymdInt(dates[3]))) t.records = [R("NoNeedCheck", "NoNeedCheck", "Travel", "Travel")];
  });
  return buildAttendanceView({
    weekStart, now, roster, employeeIds, members: new Set(office.map((p) => employeeIds.get(p.openId)!)), tasks, approvals, source: "demo",
    notes: { rosterInService: roster.length + 1, noAccount: 1, groupCount: 1, invalidIds: 0 },
    fieldCost: {
      rows: dates.slice(0, 5).map((date, i) => ({ date, leaderIds: [fieldFolks[0].recordId], crewIds: i === 3 ? [] : [fieldFolks[1].recordId] })),
    },
  });
}
