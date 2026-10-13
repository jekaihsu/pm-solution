// R04 加班（詠翔加班）口徑測試：只計已通過、依月彙總、組別依 V3 人員名單（公司組織架構）、白名單排除金額欄。不連 Lark。
// Usage: node --test scripts/test-hr-overtime.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeOvertime, UNMAPPED_GROUP } from "../lib/overtime.ts";
import { buildPeopleDirectory, personRefs } from "../lib/people.ts";
import { SOURCES, salaryField, peopleField } from "../lib/reports.ts";

const TZ = 8 * 3600000;
const at = (y, m, d, h = 9) => Date.UTC(y, m - 1, d, h) - TZ;

// V3 人員名單的一列：Lark帳號是人員欄（有 open_id）；openId 給 null＝帳號欄空白。
const person = (name, openId, group, active = true) => ({
  id: "p_" + name + (openId ?? ""),
  fields: { 姓名: name, "Lark帳號": openId ? [name] : null, 所屬組別: group, 在職: active },
  ...(openId ? { people: { "Lark帳號": [{ id: openId, name }] } } : {}),
});
const DIR = buildPeopleDirectory([person("甲", "ou_a", "圖報A"), person("乙", "ou_b", "圖報B"), person("丙", null, "水深A")]);

// 一張加班單。who＝加班人（人員欄：id 是 open_id）；id 省略＝讀不到 open_id（只有名字）。
const rec = (o = {}, who = [{ id: "ou_a", name: "甲" }]) => ({
  id: "r",
  fields: { 加班人: who.map((w) => w.name), "开始时间": at(2026, 9, 3), "加班类型": "平日", "申请状态": "已通过", "薪資計算加班時數": 2, ...o },
  ...(who.some((w) => w.id) ? { people: { 加班人: who.map((w) => ({ id: w.id ?? "", name: w.name })) } } : {}),
});
const by = (name, o) => rec(o, [{ id: undefined, name }]); // 只有名字
const ids = (id, name, o) => rec(o, [{ id, name }]);
const sum = (records, dir = DIR) => summarizeOvertime(records, dir);

test("只計已通過：審批中／已撤回／已拒絕／已刪除不算，並記錄排除筆數", () => {
  const s = sum([
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
  const s = sum([
    rec({ "开始时间": at(2026, 9, 30, 23) }),
    rec({ "开始时间": at(2026, 10, 1, 0) }),
    rec({ "开始时间": at(2026, 10, 1, 8), "薪資計算加班時數": 1.5 }),
  ]);
  assert.deepEqual(s.months, ["2026-10", "2026-09"]);
  assert.equal(s.byMonth.get("2026-09").total, 2);
  assert.equal(s.byMonth.get("2026-10").total, 3.5);
});

test("每人平日／假日分開、各組合計；類型空白不猜", () => {
  const s = sum([
    rec({}),
    rec({ "加班类型": "休息日(六)", "薪資計算加班時數": 4 }),
    rec({ "加班类型": "國定假日", "薪資計算加班時數": 8 }),
    rec({ "加班类型": null, "薪資計算加班時數": 1 }),
    ids("ou_b", "乙", { "薪資計算加班時數": 3 }),
  ]);
  const m = s.byMonth.get("2026-09");
  const a = m.people.find((p) => p.name === "甲");
  assert.deepEqual([a.weekday, a.holiday, a.other, a.total], [2, 12, 1, 15]);
  assert.deepEqual(m.groups, [{ group: "圖報A", hours: 15 }, { group: "圖報B", hours: 3 }]);
});

test("時數：公式欄優先，缺時退回原始時數；兩者皆空不算 0", () => {
  const s = sum([
    rec({ "薪資計算加班時數": null, "加班时长（小时）": 5 }),
    rec({ "薪資計算加班時數": null }),
  ]);
  assert.equal(s.byMonth.get("2026-09").total, 5);
  assert.equal(s.noHours, 1);
});

test("白名單：金額、薪資、身分等欄一律不讀（精確比對）", () => {
  for (const ok of ["加班人", "开始时间", "加班类型", "申请状态", "薪資計算加班時數", "加班时长（小时）"]) {
    
    assert.equal(salaryField(ok), true, ok);
  }
  for (const bad of ["加班費", "加班費金額", "底薪", "薪資", "每月薪資", "實領金額", "手動補正時數", "發起人", "加班事由", "加班明細", "銀行帳號", "身分證字號", "電話", "地址", "工程編號", "報價編號", "当前处理人", "加班時數費用", "发起人部门"]) {
    
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
  for (const k of ["OT_NAME", "OT_START", "OT_TYPE", "OT_STATUS", "OT_HOURS", "OT_HOURS_RAW"]) assert.equal(salaryField(o[k]), true, k);
});

// ───────── 組別依 V3 人員名單的「所屬組別」（公司組織架構）─────────

const groupOf = (s, name, month = "2026-09") => s.byMonth.get(month).people.find((p) => p.name === name)?.group;

test("組別：加班人的 open_id 對到人員名單「Lark帳號」→「所屬組別」（顯示名字不同也以 open_id 為準）", () => {
  const s = sum([ids("ou_a", "甲（改過顯示名）"), ids("ou_b", "乙")]);
  assert.equal(groupOf(s, "甲（改過顯示名）"), "圖報A");
  assert.equal(groupOf(s, "乙"), "圖報B");
  assert.equal(s.unmapped, 0);
});

test("組別：open_id 以 id 對，同名的另一個人（不同 open_id）不會被名字帶偏", () => {
  const dir = buildPeopleDirectory([person("甲", "ou_a", "圖報A"), person("甲", "ou_a2", "水深B")]);
  const s = sum([ids("ou_a2", "甲"), ids("ou_a", "甲")], dir);
  const gs = s.byMonth.get("2026-09").people.map((p) => p.group).sort();
  assert.deepEqual(gs, ["圖報A", "水深B"]);
});

test("組別：讀不到 open_id（只有名字）或 open_id 不在名單 → 以姓名完全相同備援", () => {
  const s = sum([by("丙"), ids("ou_unknown", "乙")]);
  assert.equal(groupOf(s, "丙"), "水深A"); // 名單裡丙沒有 Lark帳號，只能靠姓名
  assert.equal(groupOf(s, "乙"), "圖報B"); // open_id 對不到，姓名對得到
  assert.equal(s.unmapped, 0);
});

test("組別：姓名備援只認完全相同，不做包含或近似比對", () => {
  const s = sum([by("甲乙"), by("甲 乙"), by("")]);
  const m = s.byMonth.get("2026-09");
  assert.ok(m.people.every((p) => p.group === UNMAPPED_GROUP));
});

test("組別：open_id、姓名都對不到 → 「未對應組別」，並統計張數（全部、當月）", () => {
  const s = sum([
    ids("ou_x", "不在名單的人"),
    by("不在名單的人", { "开始时间": at(2026, 10, 2) }),
    ids("ou_a", "甲"),
  ]);
  assert.equal(UNMAPPED_GROUP, "未對應組別");
  assert.equal(groupOf(s, "不在名單的人"), "未對應組別");
  assert.equal(s.unmapped, 2);
  assert.equal(s.byMonth.get("2026-09").unmapped, 1);
  assert.equal(s.byMonth.get("2026-10").unmapped, 1);
  // 未對應組別的時數仍計入合計，且排在組別列表最後
  const g = s.byMonth.get("2026-09").groups;
  assert.deepEqual(g, [{ group: "圖報A", hours: 2 }, { group: "未對應組別", hours: 2 }]);
  assert.equal(s.byMonth.get("2026-09").total, 4);
});

test("組別：未對應組別即使時數最多也排最後", () => {
  const s = sum([ids("ou_x", "外人", { "薪資計算加班時數": 9 }), ids("ou_a", "甲", { "薪資計算加班時數": 1 })]);
  assert.deepEqual(s.byMonth.get("2026-09").groups.map((g) => g.group), ["圖報A", "未對應組別"]);
});

test("組別：人員名單有這個人但「所屬組別」空白 → 未對應組別（不猜）", () => {
  const dir = buildPeopleDirectory([person("丁", "ou_d", "")]);
  const s = sum([ids("ou_d", "丁"), by("丁")], dir);
  assert.equal(groupOf(s, "丁"), "未對應組別");
  assert.equal(s.unmapped, 2);
});

test("組別：離職的人過去的加班，仍歸他名單上的所屬組別", () => {
  const dir = buildPeopleDirectory([person("戊", "ou_e", "地形E", false)]);
  assert.equal(groupOf(sum([ids("ou_e", "戊")], dir), "戊"), "地形E");
});

test("組別：姓名備援遇到同名多人——只有一位在職就用在職那位；組別不同又無法判斷就歸未對應", () => {
  const dir = buildPeopleDirectory([person("己", null, "控制", false), person("己", null, "PM", true), person("庚", null, "圖報A"), person("庚", null, "圖報B")]);
  const s = sum([by("己"), by("庚")], dir);
  assert.equal(groupOf(s, "己"), "PM");
  assert.equal(groupOf(s, "庚"), "未對應組別");
  // 同名但組別相同 → 無歧義
  const dir2 = buildPeopleDirectory([person("辛", null, "控制"), person("辛", null, "控制", false)]);
  assert.equal(groupOf(sum([by("辛")], dir2), "辛"), "控制");
});

test("組別：加班人填多人——整張算一列；全部同組歸該組，跨組或有人對不到歸未對應組別", () => {
  const two = (a, b) => rec({}, [a, b]);
  const s = sum([
    two({ id: "ou_a", name: "甲" }, { id: undefined, name: "甲" }), // 同一組
    two({ id: "ou_a", name: "甲" }, { id: "ou_b", name: "乙" }), // 跨組
    two({ id: "ou_a", name: "甲" }, { id: "ou_x", name: "外人" }), // 有人對不到
  ]);
  const m = s.byMonth.get("2026-09");
  assert.equal(m.total, 6); // 每張只算一次時數
  assert.deepEqual(m.groups, [{ group: "圖報A", hours: 2 }, { group: "未對應組別", hours: 4 }]);
  assert.equal(s.multiPerson, 3);
  assert.equal(s.unmapped, 2);
});

test("組別：只計已通過——未通過的單既不計時數也不影響未對應張數", () => {
  const s = sum([ids("ou_x", "外人", { "申请状态": "审批中" }), ids("ou_a", "甲"), ids("ou_x", "外人", { "申请状态": "已撤回" })]);
  assert.equal(s.counted, 1);
  assert.equal(s.excludedStatus, 2);
  assert.equal(s.unmapped, 0);
  assert.deepEqual(s.byMonth.get("2026-09").groups, [{ group: "圖報A", hours: 2 }]);
});

test("組別：人員名單讀不到（null）→ 不亂歸組，組別一律「—」，也不算未對應", () => {
  const s = summarizeOvertime([ids("ou_a", "甲"), ids("ou_x", "外人")], null);
  const m = s.byMonth.get("2026-09");
  assert.ok(m.people.every((p) => p.group === "—"));
  assert.equal(s.unmapped, 0);
  assert.equal(s.hasDirectory, false);
  assert.equal(summarizeOvertime([], DIR).hasDirectory, true);
});

test("人員名單目錄：沒有姓名也沒有 open_id 的空列不進目錄；Lark帳號可多人", () => {
  const dir = buildPeopleDirectory([
    { id: "e1", fields: { 姓名: null, 所屬組別: "PM", 在職: true } },
    { id: "m1", fields: { 姓名: "壬", 所屬組別: "業務", 在職: true }, people: { "Lark帳號": [{ id: "ou_m1", name: "壬" }, { id: "ou_m2", name: "壬" }] } },
  ]);
  assert.equal(groupOf(sum([ids("ou_m2", "別名")], dir), "別名"), "業務");
  assert.equal(groupOf(sum([by("")], dir), "—"), "未對應組別");
});

// ───────── 人員名單來源與讀取（reports.ts 白名單、lark 人員欄 → id）─────────

test("v3-people 來源：直接指定人員名單 tableId、限 HR、只讀 姓名／Lark帳號／所屬組別／在職", () => {
  const s = SOURCES.find((x) => x.key === "v3-people");
  assert.equal(s.tableId, "tblmlpA6nG5Ou7NQ");
  assert.equal(s.baseToken, "Sdw1bG1djaHsVGsRPvmjyVWipgg");
  assert.equal(s.restricted, "hr");
  assert.equal(typeof s.allowField, "function");
  for (const ok of ["姓名", "Lark帳號", "所屬組別", "在職"]) assert.equal(s.allowField(ok), true, ok);
  assert.equal(peopleField("在職"), true);
});

test("v3-people 白名單：電話、身分、帳戶、薪資、職級、備註、成本單連結、OpenID 同步欄一律不讀", () => {
  for (const bad of ["職級", "備註", "PM負責案件", "組長成本單", "組員成本單", "行政成本單", "行政結算", "顧問成本單1-填表人", "組長", "同步_OpenID", "通訊錄同步時間", "電話", "手機", "身分證字號", "銀行帳號", "薪資", "底薪", "Email", "地址", "出生日期", "到職日", "姓名 "]) {
    assert.equal(peopleField(bad), false, bad);
  }
});

test("overtime／people 的欄名常數都在 reports.ts 白名單內（防兩邊漂移）", async () => {
  const p = await import("../lib/people.ts");
  for (const k of ["PEOPLE_NAME", "PEOPLE_ACCOUNT", "PEOPLE_GROUP", "PEOPLE_ACTIVE"]) assert.equal(peopleField(p[k]), true, k);
  const s = SOURCES.find((x) => x.key === "salary-overtime");
  assert.equal(s.allowField("发起人部门"), false); // 組別改取人員名單，不再讀發起人部門
});

test("R04 把人員名單列為來源", async () => {
  const { REPORTS } = await import("../lib/reports.ts");
  assert.ok(REPORTS.find((r) => r.id === "R04").sources.includes("v3-people"));
});

test("personRefs：Lark 人員欄 [{id,name,en_name,email}] → 只留 {id,name}，不帶 email", () => {
  const refs = personRefs([{ id: "ou_a", name: "甲", en_name: "A", email: "a@example.com" }, { id: "ou_b", en_name: "B" }]);
  assert.deepEqual(refs, [{ id: "ou_a", name: "甲" }, { id: "ou_b", name: "B" }]);
  assert.equal(personRefs(null), null);
  assert.equal(personRefs([]), null);
  assert.equal(personRefs("文字"), null);
  assert.equal(personRefs([{ name: "沒有id" }]), null); // 一個 open_id 都沒有＝沒東西可留
  assert.deepEqual(personRefs({ id: "ou_c", name: "單一物件" }), [{ id: "ou_c", name: "單一物件" }]);
  // 有人缺 id 時仍與名字陣列逐項對齊（缺的給空字串）
  assert.deepEqual(personRefs([{ id: "ou_a", name: "甲" }, { name: "無id" }]), [{ id: "ou_a", name: "甲" }, { id: "", name: "無id" }]);
});
