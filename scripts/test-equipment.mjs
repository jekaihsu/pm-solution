// R07 儀器管理系統口徑的純函式測試（lib/equipment.ts），不連 Lark。
// Usage: node --test scripts/test-equipment.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingStats, summarizeInventory, summarizeRates, vehicleReminders } from "../lib/equipment.ts";

const DAY = 86400000;
const TZ = 8 * 3600000;
const weekStart = Date.UTC(2026, 9, 5) - TZ; // Mon 2026-10-05 00:00 Taipei
const weekEnd = weekStart + 7 * DAY;
const now = weekStart + 2 * DAY + 10 * 3600000; // Wed 10/07 10:00
const rec = (fields) => ({ id: "r", fields });
const dayAt = (offset) => Date.UTC(2026, 9, 7 + offset); // Lark date: UTC midnight of that day

test("儀器總表：封存的不算在用，月租／日租分開數", () => {
  const s = summarizeInventory([
    rec({ 狀態: "可借用", rent_type: "月租型" }),
    rec({ 狀態: "已借出", rent_type: "日租型" }),
    rec({ 狀態: "可借用", rent_type: "月租型", 系統封存: true }),
    rec({ 狀態: "可借用", rent_type: "月租型", 系統封存: false }),
  ]);
  assert.equal(s.total, 4);
  assert.equal(s.archived, 1);
  assert.equal(s.active, 3);
  assert.equal(s.monthly, 2);
  assert.equal(s.daily, 1);
  assert.deepEqual(s.byStatus, { 可借用: 2, 已借出: 1 });
});

test("資料表：啟用且狀態不是送修／出險才算可用", () => {
  const s = summarizeRates([
    rec({ 狀態: "正常", 啟用: true, 日租金: 100 }),
    rec({ 狀態: "送修-損壞", 啟用: true }),
    rec({ 狀態: "出險", 啟用: true }),
    rec({ 狀態: "正常", 啟用: false }),
  ]);
  assert.equal(s.total, 4);
  assert.equal(s.enabled, 3);
  assert.equal(s.usable, 1);
  assert.equal(s.repair, 2);
  assert.equal(s.withRate, 1);
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

test("預約與歸還：只算已通過、依日期落在所選週；撤回另計；借出未歸還待定義", () => {
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
  assert.equal(b.outstanding, null); // 兩張單沒有明確對應鍵 → 待定義，不猜
});
