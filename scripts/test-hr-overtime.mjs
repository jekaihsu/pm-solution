// R04 加班（詠翔加班）口徑測試：只計已通過、依月彙總、白名單排除金額欄。不連 Lark。
// Usage: node --test scripts/test-hr-overtime.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeOvertime } from "../lib/overtime.ts";
import { SOURCES, salaryField } from "../lib/reports.ts";

const TZ = 8 * 3600000;
const at = (y, m, d, h = 9) => Date.UTC(y, m - 1, d, h) - TZ;
const rec = (o) => ({
  id: "r",
  fields: { 加班人: "甲", "发起人部门": "圖報A", "开始时间": at(2026, 9, 3), "加班类型": "平日", "申请状态": "已通过", "薪資計算加班時數": 2, ...o },
});

test("只計已通過：審批中／已撤回／已拒絕／已刪除不算，並記錄排除筆數", () => {
  const s = summarizeOvertime([
    rec({}),
    rec({ "申请状态": "已通過" }),
    rec({ "申请状态": "已撤回" }),
    rec({ "申请状态": "已拒绝" }),
    rec({ "申请状态": "审批中" }),
    rec({ "申请状态": "已删除" }),
    rec({ "申请状态": null }),
  ]);
  assert.equal(s.counted, 2);
  assert.equal(s.excludedStatus, 5);
  assert.equal(s.byMonth.get("2026-09").total, 4);
});

test("依月彙總：以開始時間的台北月份分月，跨月邊界用台北時區", () => {
  const s = summarizeOvertime([
    rec({ "开始时间": at(2026, 9, 30, 23) }),
    rec({ "开始时间": at(2026, 10, 1, 0) }),
    rec({ "开始时间": at(2026, 10, 1, 8), "薪資計算加班時數": 1.5 }),
  ]);
  assert.deepEqual(s.months, ["2026-10", "2026-09"]);
  assert.equal(s.byMonth.get("2026-09").total, 2);
  assert.equal(s.byMonth.get("2026-10").total, 3.5);
});

test("每人平日／假日分開、各組合計；類型空白不猜", () => {
  const s = summarizeOvertime([
    rec({}),
    rec({ "加班类型": "休息日(六)", "薪資計算加班時數": 4 }),
    rec({ "加班类型": "國定假日", "薪資計算加班時數": 8 }),
    rec({ "加班类型": null, "薪資計算加班時數": 1 }),
    rec({ 加班人: "乙", "发起人部门": "圖報B", "薪資計算加班時數": 3 }),
  ]);
  const m = s.byMonth.get("2026-09");
  const a = m.people.find((p) => p.name === "甲");
  assert.deepEqual([a.weekday, a.holiday, a.other, a.total], [2, 12, 1, 15]);
  assert.deepEqual(m.groups, [{ group: "圖報A", hours: 15 }, { group: "圖報B", hours: 3 }]);
});

test("時數：公式欄優先，缺時退回原始時數；兩者皆空不算 0", () => {
  const s = summarizeOvertime([
    rec({ "薪資計算加班時數": null, "加班时长（小时）": 5 }),
    rec({ "薪資計算加班時數": null }),
  ]);
  assert.equal(s.byMonth.get("2026-09").total, 5);
  assert.equal(s.noHours, 1);
});

test("白名單：金額、薪資、身分等欄一律不讀（精確比對）", () => {
  for (const ok of ["加班人", "发起人部门", "开始时间", "加班类型", "申请状态", "薪資計算加班時數", "加班时长（小时）"]) {
    
    assert.equal(salaryField(ok), true, ok);
  }
  for (const bad of ["加班費", "加班費金額", "底薪", "薪資", "每月薪資", "實領金額", "手動補正時數", "發起人", "加班事由", "加班明細", "銀行帳號", "身分證字號", "電話", "地址", "工程編號", "報價編號", "当前处理人", "加班時數費用"]) {
    
    assert.equal(salaryField(bad), false, bad);
  }
});

test("salary-overtime 來源直接指定詠翔加班的 tableId，不再用表名正規式", () => {
  const s = SOURCES.find((x) => x.key === "salary-overtime");
  assert.equal(s.tableId, "tblomH0DXCzXgenE");
  assert.equal(s.tableName, undefined);
  assert.equal(s.name, "薪水計算：詠翔加班");
  assert.equal(s.restricted, "hr");
});

test("overtime.ts 的欄名常數都在 reports.ts 白名單內（防兩邊漂移）", async () => {
  const o = await import("../lib/overtime.ts");
  for (const k of ["OT_NAME", "OT_DEPT", "OT_START", "OT_TYPE", "OT_STATUS", "OT_HOURS", "OT_HOURS_RAW"]) assert.equal(salaryField(o[k]), true, k);
});
