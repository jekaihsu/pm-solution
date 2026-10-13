// R07 儀器管理系統口徑的純函式測試（lib/equipment.ts），不連 Lark。
// Usage: node --test scripts/test-equipment.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingStats, inventoryStatus, loanItemLabel, outstandingLoans, recordLog, vehicleReminders } from "../lib/equipment.ts";

const DAY = 86400000;
const TZ = 8 * 3600000;
const weekStart = Date.UTC(2026, 9, 5) - TZ; // Mon 2026-10-05 00:00 Taipei
const weekEnd = weekStart + 7 * DAY;
const now = weekStart + 2 * DAY + 10 * 3600000; // Wed 10/07 10:00
const rec = (fields) => ({ id: "r", fields });
const dayAt = (offset) => Date.UTC(2026, 9, 7 + offset); // Lark date: UTC midnight of that day

test("儀器清單：以總表 ID 為主，狀態來自日租＋月租（互斥、以編號 join），對不上的分開計", () => {
  const s = inventoryStatus(
    [
      rec({ ID: "A1", 設備: "經緯儀 A1", 設備類別: "經緯儀", rent_type: "月租型", 狀態: "可借用" }),
      rec({ ID: "B2", 設備: "GPS B2", 設備類別: "GPS", rent_type: "日租型", 狀態: "已借出" }),
      rec({ ID: "C3", 設備: "封存 C3", rent_type: "月租型", 狀態: "可借用", 系統封存: true }),
      rec({ ID: "D4", 設備: "稜鏡 D4", rent_type: "月租型", 狀態: "可借用", 系統封存: false }),
    ],
    [rec({ ID: "B2", 狀態: "異常" }), rec({}), rec({ 狀態: null })], // 兩列空白占位
    [rec({ ID: "A1", 狀態: "可借用" }), rec({ ID: "Z9", 狀態: "保養中" }), rec({ ID: "C3", 狀態: "可借用" })],
  );
  assert.equal(s.masterTotal, 4);
  assert.equal(s.archived, 1);
  assert.equal(s.active, 3);
  assert.deepEqual(s.counts, { 可借用: 1, 異常: 1, 保養中: 0 }); // A1 可借用、B2 異常；Z9 不在總表、C3 已封存都不算
  assert.equal(s.dailyBlank, 2);
  assert.equal(s.monthlyBlank, 0);
  assert.equal(s.dailyReal, 1);
  assert.equal(s.monthlyReal, 3);
  assert.deepEqual(s.unmatched, { daily: 0, monthly: 1 }); // Z9
  assert.equal(s.noStatusRow, 1); // D4 日租／月租都沒有
  assert.equal(s.overlap, 0);
  assert.equal(s.masterBorrowed, 1); // B2 總表狀態＝已借出
  const by = Object.fromEntries(s.rows.map((r) => [r.id, r]));
  assert.equal(s.rows.length, 3);
  assert.equal(by.B2.status, "異常");
  assert.equal(by.B2.source, "daily");
  assert.equal(by.B2.masterStatus, "已借出");
  assert.equal(by.A1.source, "monthly");
  assert.equal(by.D4.status, null);
  assert.equal(by.D4.source, null);
});

test("儀器清單：同一編號同時出現在日租與月租 → 記為重疊、不重複計數", () => {
  const s = inventoryStatus([rec({ ID: "A1", 狀態: "可借用" })], [rec({ ID: "A1", 狀態: "異常" })], [rec({ ID: "A1", 狀態: "可借用" })]);
  assert.equal(s.overlap, 1);
  assert.equal(s.counts["可借用"] + s.counts["異常"] + s.counts["保養中"], 0); // 兩表說法不同＝衝突，不猜
  assert.equal(s.rows[0].status, "（兩表不一致）");
  const same = inventoryStatus([rec({ ID: "A1" })], [rec({ ID: "A1", 狀態: "可借用" })], [rec({ ID: "A1", 狀態: "可借用" })]);
  assert.equal(same.counts["可借用"], 1);
  assert.equal(same.overlap, 1);
});

test("車輛：保養／保險 30 天內黃、已過紅、封存不列、沒填日期不猜", () => {
  const v = vehicleReminders(
    [
      rec({ 車牌: "A", next_maintenance: dayAt(10), insurance_date: dayAt(100) }),
      rec({ 車牌: "B", next_maintenance: dayAt(-1), insurance_date: dayAt(30) }),
      rec({ 車牌: "C", next_maintenance: dayAt(31) }),
      rec({ 車牌: "D", 系統封存: true, next_maintenance: dayAt(-5) }),
      rec({ 車牌: "E", next_maintenance: dayAt(0) }),
    ],
    now,
  );
  assert.equal(v.rows.length, 4);
  const by = Object.fromEntries(v.rows.map((r) => [r.plate, r]));
  assert.equal(by.A.maintenance.state, "soon");
  assert.equal(by.A.maintenance.days, 10);
  assert.equal(by.A.insurance.state, "ok");
  assert.equal(by.B.maintenance.state, "overdue");
  assert.equal(by.B.insurance.state, "soon"); // 剛好 30 天內含
  assert.equal(by.C.maintenance.state, "ok");
  assert.equal(by.C.insurance.state, "none");
  assert.equal(by.E.maintenance.state, "soon");
  assert.equal(by.E.maintenance.days, 0);
  assert.equal(v.maintenanceAlerts, 3); // A、B、E
  assert.equal(v.insuranceAlerts, 1); // B
});

test("預約與歸還：只算已通過、依日期落在所選週；撤回另計", () => {
  const b = bookingStats(
    [
      rec({ 申请状态: "已通过", 借出日期: dayAt(0), 設備類別: "車輛" }),
      rec({ 申请状态: "已通过", 借出日期: dayAt(-10), 設備類別: "日租型儀器" }),
      rec({ 申请状态: "已撤回", 借出日期: dayAt(0), 設備類別: "車輛" }),
      rec({ 申请状态: "已通过", 設備類別: "車輛" }), // 沒借出日期
    ],
    [
      rec({ 申请状态: "已通过", 歸還日期: dayAt(1) }),
      rec({ 申请状态: "已通过", 歸還日期: dayAt(8) }), // 下週
      rec({ 申请状态: "已撤回", 歸還日期: dayAt(1) }),
    ],
    weekStart,
    weekEnd,
  );
  assert.equal(b.lent, 1);
  assert.equal(b.returned, 1);
  assert.equal(b.lentWithdrawn, 1);
  assert.equal(b.returnedWithdrawn, 1);
  assert.equal(b.lentNoDate, 1);
  assert.deepEqual(b.lentByCategory, { 車輛: 1 });
});

test("借出未歸還：借單明細的識別欄 vs 已通過歸還單的「借出儀器/車輛」（歸還值＝申請人＋設備類別＋編號，以結尾比對）", () => {
  const longKey = "某人 2026/08/18 GPS S901    202608180012";
  const o = outstandingLoans(
    [
      rec({ 日租ID: "AAA組大稜鏡(2)", 借出日期: dayAt(-5), 所屬組別: "水深A", 設備類別: ["日租型儀器"] }), // 只有被撤回的歸還單 → 未歸還
      rec({ 車牌: "BDK-1301", 借出日期: dayAt(-4) }), // 已通過歸還
      rec({ 日租ID: "S901", 借出日期: dayAt(-3) }), // 結尾比對成功
      rec({ 月租ID: "XX鋼柱(4)", 借出日期: dayAt(-2), 所屬組別: "地形E" }), // 沒有任何歸還
      rec({}), // 空白列：沒有識別欄
      rec({ "借出儀器/車輛": longKey, 借出日期: dayAt(-1) }), // 完全相同
      rec({ 日租ID: "S90", 借出日期: dayAt(-1) }), // 歸還值 '甲S901' 結尾不是 S90 → 未歸還
      rec({ 日租ID: "T1", 借出日期: dayAt(-1) }), // 歸還值 '甲XT1'：前一字是英數字 → 不算同一個編號
    ],
    [
      rec({ 申请状态: "已通过", "借出儀器/車輛": "甲BDK-1301" }),
      rec({ 申请状态: "已撤回", "借出儀器/車輛": "乙大稜鏡AAA組大稜鏡(2)" }),
      rec({ 申请状态: "已通过", "借出儀器/車輛": ["丙S901"] }),
      rec({ 申请状态: "已通过", "借出儀器/車輛": longKey }),
      rec({ 申请状态: "已通过", "借出儀器/車輛": "甲XT1" }),
    ],
    now,
  );
  assert.equal(o.loanTotal, 8);
  assert.equal(o.noKey, 1);
  assert.equal(o.matched, 3); // BDK-1301、S901、完全相同那筆
  assert.deepEqual(o.rows.map((r) => r.item).sort(), ["AAA組大稜鏡(2)", "S90", "T1", "XX鋼柱(4)"].sort());
  assert.equal(loanItemLabel(rec({ "借出儀器/車輛": longKey })), "GPS S901"); // 顯示時去掉申請人與申請編號
  assert.equal(o.rows[0].item, "AAA組大稜鏡(2)"); // 天數最多排最前
  assert.equal(o.rows[0].days, 5);
  assert.equal(o.rows[0].group, "水深A");
  assert.equal(o.rows[1].item, "XX鋼柱(4)");
  assert.equal(o.rows[1].days, 2);
  assert.equal(o.rows[1].group, "地形E");
  assert.ok(o.rows.every((r) => !("applicant" in r)));
});

test("借出未歸還：沒借出日期的天數不猜；撤回的歸還單不算", () => {
  const o = outstandingLoans([rec({ 日租ID: "Q1" })], [rec({ 申请状态: "已撤回", "借出儀器/車輛": "甲Q1" })], now);
  assert.equal(o.rows.length, 1);
  assert.equal(o.rows[0].days, null);
  assert.equal(o.rows[0].lentAt, null);
});

test("維護／TAF 紀錄：每個對象最近一次、筆數、空白列、關聯名稱未解析、有效期限（若有）", () => {
  const l = recordLog(
    [
      rec({ 設備類別: ["甲儀器"], 日期: dayAt(-40), 費用: 20000 }),
      rec({ 設備類別: ["甲儀器"], 日期: dayAt(-3), 有效期限: dayAt(10) }),
      rec({ 設備類別: ["乙儀器"] }), // 有關聯但沒日期
      rec({}), // 空白列
      rec({ 設備類別: ["recAbCdEfGhIjKl"], 日期: dayAt(-1) }), // 關聯表沒開放 → 讀到的是 record id
    ],
    { target: "設備類別", date: "日期", cost: "費用", due: "有效期限" },
    now,
  );
  assert.equal(l.total, 5);
  assert.equal(l.empty, 1);
  assert.equal(l.dated, 3);
  assert.equal(l.latestAt, dayAt(-1));
  assert.equal(l.unresolved, 1);
  assert.equal(l.rows.length, 3);
  assert.equal(l.rows[0].target, "（關聯名稱未解析）"); // 最近日期排最前
  assert.equal(l.rows[1].target, "甲儀器");
  assert.equal(l.rows[1].count, 2);
  assert.equal(l.rows[1].lastAt, dayAt(-3));
  assert.equal(l.rows[1].daysSince, 3);
  assert.equal(l.rows[1].due.state, "soon");
  assert.equal(l.rows[2].target, "乙儀器");
  assert.equal(l.rows[2].lastAt, null);
  assert.equal(l.rows[2].due.state, "none");
});

test("維護／TAF 紀錄：沒有有效期限欄 → 到期一律「none」（無資料）；全空表不報錯", () => {
  const l = recordLog([rec({ 設備類別: ["甲"], 日期: dayAt(-1) })], { target: "設備類別", date: "日期" }, now);
  assert.equal(l.rows[0].due.state, "none");
  const e = recordLog([], { target: "設備類別", date: "日期" }, now);
  assert.equal(e.total, 0);
  assert.equal(e.latestAt, null);
  assert.deepEqual(e.rows, []);
});

// 2026-10-13 實測：歸還單值可能是「申請人 日期 設備類別 編號    申請編號」，結尾多一串 12 碼申請編號，且編號與類別之間靠空白分隔。
test("借出未歸還：歸還值結尾帶申請編號（含空白分隔）也要對得上；T1 仍不能對到 XT1／申請編號不可誤吞編號", () => {
  const o = outstandingLoans(
    [
      rec({ 日租ID: "S901", 借出日期: dayAt(-3) }), // 歸還值「某 2026/08/18 GPS S901    202608180025」
      rec({ 日租ID: "901", 借出日期: dayAt(-3) }), // 前一字是 S（空白在 S 後）→ 不是同一個編號
      rec({ 日租ID: "T1", 借出日期: dayAt(-3) }), // 歸還值「某 2026/08/18 XT1    202608180026」→ 不可對到
      rec({ 日租ID: "TM60(892768)", 借出日期: dayAt(-3) }), // 編號本身以括號數字結尾，不可被當申請編號誤剝
      rec({ 日租ID: "AAA組大稜鏡(2)", 借出日期: dayAt(-3) }), // 歸還值緊貼姓名＋類別＋編號（舊格式）
    ],
    [
      rec({ 申请状态: "已通过", "借出儀器/車輛": "某 2026/08/18 GPS S901    202608180025" }),
      rec({ 申请状态: "已通过", "借出儀器/車輛": "某 2026/08/18 XT1    202608180026" }),
      rec({ 申请状态: "已通过", "借出儀器/車輛": "某全站儀TM60(892768)" }),
      rec({ 申请状态: "已通过", "借出儀器/車輛": "某大稜鏡AAA組大稜鏡(2)" }),
    ],
    now,
  );
  assert.equal(o.matched, 3); // S901、TM60、大稜鏡
  assert.deepEqual(o.rows.map((r) => r.item).sort(), ["901", "T1"]);
});

test("借出未歸還：歸還要發生在借出日（含當天）之後；舊的歸還單不能抵新的借單，缺日期則退回只比對識別", () => {
  const ret = (offset, extra = {}) => rec({ 申请状态: "已通过", "借出儀器/車輛": "甲Q1", 歸還日期: dayAt(offset), ...extra });
  const o = outstandingLoans(
    [
      rec({ 日租ID: "Q1", 借出日期: dayAt(-10) }), // 已被 -8 的歸還單歸還
      rec({ 日租ID: "Q1", 借出日期: dayAt(-3) }), // 再借一次，-8 的歸還單比它早 → 未歸還
      rec({ 日租ID: "Q1", 借出日期: dayAt(-1) }), // 再借，沒有更晚的歸還 → 未歸還
      rec({ 日租ID: "Q1" }), // 沒借出日期 → 退回識別比對，算已歸還
    ],
    [ret(-8), rec({ 申请状态: "已撤回", "借出儀器/車輛": "甲Q1", 歸還日期: dayAt(0) })],
    now,
  );
  assert.equal(o.matched, 2);
  assert.deepEqual(o.rows.map((r) => r.days).sort(), [1, 3]);
  // 借出當天歸還算已歸還；歸還單沒填歸還日期 → 無法判斷先後，視為已歸還
  const same = outstandingLoans([rec({ 日租ID: "Q1", 借出日期: dayAt(-2) })], [ret(-2)], now);
  assert.equal(same.matched, 1);
  const noDate = outstandingLoans([rec({ 日租ID: "Q1", 借出日期: dayAt(-2) })], [rec({ 申请状态: "已通过", "借出儀器/車輛": "甲Q1" })], now);
  assert.equal(noDate.matched, 1);
});
