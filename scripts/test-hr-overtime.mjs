// R04 加班（詠翔加班）口徑測試：只計已通過、依月彙總、組別依 V3 人員名單（公司組織架構）、白名單排除金額欄。不連 Lark。
// Usage: node --test scripts/test-hr-overtime.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeOvertime, teamSummary, teamSections, mondayOf, UNMAPPED_GROUP } from "../lib/overtime.ts";
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

// 一張加班單。who＝發起人（人員欄：id 是 open_id）；id 省略＝讀不到 open_id（只有名字）。
// 真實資料：發起人 126/126 有填、加班人 126/126 空白，所以預設只填發起人；加班人用 withOvertimer 另加。
const personCell = (who) => ({ names: who.map((w) => w.name), refs: who.map((w) => ({ id: w.id ?? "", name: w.name })) });
const rec = (o = {}, who = [{ id: "ou_a", name: "甲" }]) => ({
  id: "r",
  fields: { 發起人: personCell(who).names, "开始时间": at(2026, 9, 3), "加班类型": "平日", "申请状态": "已通过", "薪資計算加班時數": 2, ...o },
  ...(who.some((w) => w.id) ? { people: { 發起人: personCell(who).refs } } : {}),
});
// 另外填「加班人」欄（備援欄；真實資料全空）。
const withOvertimer = (r, who) => ({
  ...r,
  fields: { ...r.fields, 加班人: personCell(who).names },
  ...(who.some((w) => w.id) ? { people: { ...(r.people ?? {}), 加班人: personCell(who).refs } } : {}),
});
const by = (name, o) => rec(o, [{ id: undefined, name }]); // 只有名字
const ids = (id, name, o) => rec(o, [{ id, name }]);
const sum = (records, dir = DIR) => summarizeOvertime(records, dir);
const gh = (m) => m.teams.map((t) => ({ group: t.group, hours: t.total })); // 組別→合計時數（依顯示順序）

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
  assert.deepEqual(gh(m), [{ group: "圖報A", hours: 15 }, { group: "圖報B", hours: 3 }]);
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
  for (const ok of ["發起人", "加班人", "开始时间", "加班类型", "申请状态", "薪資計算加班時數", "加班时长（小时）"]) {
    assert.equal(salaryField(ok), true, ok);
  }
  for (const bad of ["加班費", "加班費金額", "底薪", "薪資", "每月薪資", "實領金額", "手動補正時數", "加班事由", "加班明細", "銀行帳號", "身分證字號", "電話", "地址", "工程編號", "報價編號", "当前处理人", "加班時數費用", "发起人部门", "发起人", "發起人部門", "發起人 "]) {
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
  for (const k of ["OT_APPLICANT", "OT_NAME", "OT_START", "OT_TYPE", "OT_STATUS", "OT_HOURS", "OT_HOURS_RAW"]) assert.equal(salaryField(o[k]), true, k);
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
  const g = gh(s.byMonth.get("2026-09"));
  assert.deepEqual(g, [{ group: "圖報A", hours: 2 }, { group: "未對應組別", hours: 2 }]);
  assert.equal(s.byMonth.get("2026-09").total, 4);
});

test("組別：未對應組別即使時數最多也排最後", () => {
  const s = sum([ids("ou_x", "外人", { "薪資計算加班時數": 9 }), ids("ou_a", "甲", { "薪資計算加班時數": 1 })]);
  assert.deepEqual(gh(s.byMonth.get("2026-09")).map((g) => g.group), ["圖報A", "未對應組別"]);
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
  assert.deepEqual(gh(m), [{ group: "圖報A", hours: 2 }, { group: "未對應組別", hours: 4 }]);
  assert.equal(s.multiPerson, 3);
  assert.equal(s.unmapped, 2);
});

test("組別：只計已通過——未通過的單既不計時數也不影響未對應張數", () => {
  const s = sum([ids("ou_x", "外人", { "申请状态": "审批中" }), ids("ou_a", "甲"), ids("ou_x", "外人", { "申请状态": "已撤回" })]);
  assert.equal(s.counted, 1);
  assert.equal(s.excludedStatus, 2);
  assert.equal(s.unmapped, 0);
  assert.deepEqual(gh(s.byMonth.get("2026-09")), [{ group: "圖報A", hours: 2 }]);
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

// ───────── 人＝「發起人」（加班人欄真實資料全空，只當備援）─────────

// 把一張單的發起人拿掉（模擬發起人空白）。
const noApplicant = (r) => {
  const { 發起人: _f, ...fields } = r.fields;
  const { 發起人: _p, ...people } = r.people ?? {};
  return { ...r, fields: { ...fields, 發起人: null }, people };
};

test("發起人：加班人空白、發起人有值 → 以發起人計人與組別（真實資料形狀）", () => {
  const r = ids("ou_a", "甲");
  assert.equal(r.fields["加班人"], undefined); // 加班人欄根本沒有值
  const s = sum([r, ids("ou_b", "乙")]);
  assert.equal(groupOf(s, "甲"), "圖報A");
  assert.equal(groupOf(s, "乙"), "圖報B");
  assert.equal(s.unmapped, 0);
  assert.equal(s.fallbackToOvertimer, 0);
});

test("發起人：加班人欄是空陣列／空字串也算空白，仍以發起人為準", () => {
  const s = sum([{ ...ids("ou_a", "甲"), fields: { ...ids("ou_a", "甲").fields, 加班人: [] } }, { ...ids("ou_b", "乙"), fields: { ...ids("ou_b", "乙").fields, 加班人: "" } }]);
  assert.equal(groupOf(s, "甲"), "圖報A");
  assert.equal(groupOf(s, "乙"), "圖報B");
});

test("發起人：兩者都有 → 以發起人為準（加班人另屬別組也不理）", () => {
  const r = withOvertimer(ids("ou_a", "甲"), [{ id: "ou_b", name: "乙" }]);
  const s = sum([r]);
  const m = s.byMonth.get("2026-09");
  assert.deepEqual(m.people.map((p) => [p.name, p.group]), [["甲", "圖報A"]]);
  assert.equal(s.fallbackToOvertimer, 0);
  // 加班人填多位也不影響：發起人單人，不算 multiPerson
  const s2 = sum([withOvertimer(ids("ou_a", "甲"), [{ id: "ou_b", name: "乙" }, { id: "ou_x", name: "外人" }])]);
  assert.equal(s2.multiPerson, 0);
  assert.equal(s2.unmapped, 0);
  assert.equal(groupOf(s2, "甲"), "圖報A");
});

test("發起人：發起人空白才用加班人（備援），並統計張數", () => {
  const r = noApplicant(withOvertimer(ids("ou_a", "甲"), [{ id: "ou_b", name: "乙" }]));
  const s = sum([r, ids("ou_a", "甲")]);
  assert.equal(groupOf(s, "乙"), "圖報B");
  assert.equal(groupOf(s, "甲"), "圖報A");
  assert.equal(s.fallbackToOvertimer, 1);
});

test("發起人：兩者都空白 → 仍計時數，人顯示「—」並歸未對應組別", () => {
  const r = noApplicant(withOvertimer(ids("ou_a", "甲"), []));
  const s = sum([r]);
  assert.equal(s.counted, 1);
  assert.equal(s.unmapped, 1);
  assert.deepEqual(s.byMonth.get("2026-09").people.map((p) => [p.name, p.group]), [["—", "未對應組別"]]);
});

test("發起人：open_id 在名單用 open_id，對不到才以姓名備援，仍對不到＝未對應", () => {
  const s = sum([ids("ou_unknown", "乙"), ids("ou_unknown2", "外人"), by("丙")]);
  assert.equal(groupOf(s, "乙"), "圖報B");
  assert.equal(groupOf(s, "丙"), "水深A");
  assert.equal(groupOf(s, "外人"), "未對應組別");
  assert.equal(s.unmapped, 1);
});

test("被排除的筆數：依申請狀態分別列出（空白另列），依筆數多到少", () => {
  const s = sum([
    rec({}),
    rec({ "申请状态": "已撤回" }),
    rec({ "申请状态": "已拒绝" }),
    rec({ "申请状态": "已撤回" }),
    rec({ "申请状态": "审批中" }),
    rec({ "申请状态": null }),
  ]);
  assert.equal(s.excludedStatus, 5);
  assert.deepEqual(s.excludedBy, [
    { status: "已撤回", count: 2 },
    { status: "已拒绝", count: 1 },
    { status: "审批中", count: 1 },
    { status: "（空白）", count: 1 },
  ]);
});

// ───────── 組別總結與依組分段（純函式）─────────

test("組別總結：每組一列＝人數、平日、假日、合計、張數；全部合計；未對應組別排最後（即使最多）", () => {
  const s = sum([
    ids("ou_a", "甲"), // 圖報A 平日 2
    ids("ou_a", "甲"), // 圖報A 平日 2
    ids("ou_a", "甲", { "加班类型": "休息日(六)", "薪資計算加班時數": 4 }), // 圖報A 假日 4
    ids("ou_b", "乙", { "薪資計算加班時數": 3 }), // 圖報B 平日 3
    ids("ou_x", "外人", { "薪資計算加班時數": 9 }), // 未對應 平日 9
  ]);
  const m = s.byMonth.get("2026-09");
  const sm = teamSummary(m.people);
  assert.deepEqual(sm.lines.map((l) => l.group), ["圖報A", "圖報B", "未對應組別"]);
  const [a, b, u] = sm.lines;
  assert.deepEqual([a.people, a.weekday, a.holiday, a.other, a.total, a.count], [1, 4, 4, 0, 8, 3]);
  assert.deepEqual([b.people, b.weekday, b.holiday, b.total, b.count], [1, 3, 0, 3, 1]);
  assert.deepEqual([u.people, u.weekday, u.holiday, u.total, u.count], [1, 9, 0, 9, 1]);
  assert.deepEqual([sm.all.people, sm.all.weekday, sm.all.holiday, sm.all.total, sm.all.count], [3, 16, 4, 20, 5]);
  assert.equal(sm.all.group, "全部合計");
  // OtMonth 上已經帶著同樣的結果
  assert.deepEqual(m.teams, sm.lines);
  assert.deepEqual(m.all, sm.all);
  assert.equal(m.total, 20);
});

test("組別總結：人數去重——同一人（同 open_id、顯示名不同）只算一人；跨組的同一人在全部合計只算一次", () => {
  const s = sum([ids("ou_a", "甲"), ids("ou_a", "甲（改名）"), ids("ou_b", "乙")]);
  const m = s.byMonth.get("2026-09");
  assert.equal(m.people.length, 2); // 甲兩張單併成一列
  assert.equal(m.people.find((p) => p.group === "圖報A").count, 2);
  assert.equal(m.teams.find((l) => l.group === "圖報A").people, 1);
  assert.equal(m.all.people, 2);
  // 手工構造：同一人（uid 相同）出現在兩組 → 各組算 1，全部合計去重算 1；同名但不同 uid 是兩個人
  const P = (uid, name, group, weekday, holiday, count) => ({ uid, name, group, weekday, holiday, other: 0, total: weekday + holiday, count });
  const sm = teamSummary([P("id:1", "甲", "A", 1, 0, 1), P("id:1", "甲", "B", 2, 0, 1), P("id:2", "甲", "B", 1, 1, 2)]);
  assert.deepEqual(sm.lines.map((l) => [l.group, l.people]), [["B", 2], ["A", 1]]);
  assert.equal(sm.all.people, 2);
  assert.equal(sm.all.total, 5);
  assert.equal(sm.all.count, 4);
});

test("組別總結：同名不同人（open_id 不同）算兩人", () => {
  const dir = buildPeopleDirectory([person("甲", "ou_a", "圖報A"), person("甲", "ou_a2", "水深B")]);
  const s = sum([ids("ou_a", "甲"), ids("ou_a2", "甲")], dir);
  assert.equal(s.byMonth.get("2026-09").all.people, 2);
});

test("組別總結：同組時數相同時依組名排，順序固定（切月份按鈕不跳）", () => {
  const s = sum([ids("ou_b", "乙"), ids("ou_a", "甲")]);
  assert.deepEqual(s.byMonth.get("2026-09").teams.map((l) => l.group), ["圖報A", "圖報B"]);
});

test("組別總結：人員名單讀不到（null）→ 只有一列「—」，不算未對應", () => {
  const s = summarizeOvertime([ids("ou_a", "甲"), ids("ou_x", "外人")], null);
  const m = s.byMonth.get("2026-09");
  assert.deepEqual(m.teams.map((l) => [l.group, l.people, l.total]), [["—", 2, 4]]);
  assert.equal(m.all.people, 2);
});

test("依組分段：順序同組別總結（未對應最後）、每段小計＝該組各人加總、組內時數大到小", () => {
  const s = sum([
    ids("ou_a", "甲", { "薪資計算加班時數": 1 }),
    ids("ou_x", "外人", { "薪資計算加班時數": 9 }),
    ids("ou_a2", "甲二", { "薪資計算加班時數": 5 }), // open_id 不在名單 → 姓名也對不到
    by("丙", { "薪資計算加班時數": 2 }), // 水深A（姓名備援）
  ]);
  const m = s.byMonth.get("2026-09");
  const secs = teamSections(m.people);
  assert.deepEqual(secs.map((x) => x.group), m.teams.map((l) => l.group));
  assert.equal(secs.at(-1).group, "未對應組別");
  for (const sec of secs) {
    assert.equal(sec.line.total, sec.people.reduce((a, p) => a + p.total, 0));
    assert.equal(sec.line.people, sec.people.length);
    assert.deepEqual(sec.line, m.teams.find((l) => l.group === sec.group));
    assert.deepEqual(sec.people.map((p) => p.total), [...sec.people.map((p) => p.total)].sort((x, y) => y - x));
  }
  const un = secs.at(-1);
  assert.deepEqual(un.people.map((p) => p.name), ["外人", "甲二"]); // 9 先、5 後
  assert.equal(secs.reduce((a, x) => a + x.line.total, 0), m.all.total);
});

test("示範資料：salary-overtime 用發起人（加班人空白），能對到人員名單，也有對不到的", async () => {
  const { demoSourceData } = await import("../lib/demo.ts");
  const ot = demoSourceData(SOURCES.find((x) => x.key === "salary-overtime"));
  const pp = demoSourceData(SOURCES.find((x) => x.key === "v3-people"));
  assert.ok(ot.fields.some((f) => f.name === "發起人" && f.kind === "person"));
  assert.ok(ot.records.every((r) => Array.isArray(r.fields["發起人"]) && r.fields["發起人"].length === 1 && r.people["發起人"][0].id));
  assert.ok(ot.records.every((r) => !r.fields["加班人"]));
  const s = summarizeOvertime(ot.records, buildPeopleDirectory(pp.records));
  assert.ok(s.counted > 0);
  assert.ok(s.unmapped > 0 && s.unmapped < s.counted);
  const months = [...s.byMonth.values()];
  assert.ok(months.some((m) => m.teams.some((l) => l.group === "未對應組別")));
  for (const m of months) if (m.teams.some((l) => l.group === "未對應組別")) assert.equal(m.teams.at(-1).group, "未對應組別");
});

// ───────── 按「週」彙總（byWeek）：與月口徑相同，只是以台北週一分桶 ─────────

test("mondayOf：台北週一 YYYY-MM-DD；跨週邊界用台北時區；非時間值歸（未填週）", () => {
  assert.equal(mondayOf(at(2026, 10, 7, 15)), "2026-10-05"); // 週三 → 當週週一
  assert.equal(mondayOf(at(2026, 10, 12, 0)), "2026-10-12"); // 週一 00:00（台北）
  assert.equal(mondayOf(at(2026, 10, 11, 23)), "2026-10-05"); // 週日深夜仍屬該週
  assert.equal(mondayOf(null), "（未填週）");
  assert.equal(mondayOf("文字"), "（未填週）");
});

test("byWeek：依台北週（週一）分桶，weeks 由新到舊；跨週以台北時區切", () => {
  const s = sum([
    ids("ou_a", "甲", { "开始时间": at(2026, 10, 11, 23) }), // 週日深夜 → 週一 2026-10-05（時數 2）
    ids("ou_a", "甲", { "开始时间": at(2026, 10, 12, 0), "薪資計算加班時數": 3 }), // 隔週週一 → 2026-10-12
    ids("ou_b", "乙", { "开始时间": at(2026, 10, 5, 9), "薪資計算加班時數": 1 }), // 同屬 2026-10-05 週
  ]);
  assert.deepEqual(s.weeks, ["2026-10-12", "2026-10-05"]);
  assert.equal(s.byWeek.get("2026-10-05").total, 3); // 甲 2 + 乙 1
  assert.equal(s.byWeek.get("2026-10-12").total, 3); // 甲 3
  assert.equal(s.byWeek.get("2026-10-05").all.people, 2); // 甲、乙
  assert.equal(s.byWeek.get("2026-10-12").all.people, 1); // 只有甲
});

test("byWeek：桶結構與 byMonth 完全相同（組別總結、全部合計、未對應排最後）", () => {
  const s = sum([
    ids("ou_a", "甲"), // 2026-09-03（週四）→ 週一 2026-08-31、月 2026-09
    ids("ou_a", "甲", { "加班类型": "休息日(六)", "薪資計算加班時數": 4 }),
    ids("ou_b", "乙", { "薪資計算加班時數": 3 }),
    ids("ou_x", "外人", { "薪資計算加班時數": 9 }),
  ]);
  assert.deepEqual(s.weeks, ["2026-08-31"]);
  const w = s.byWeek.get("2026-08-31");
  const m = s.byMonth.get("2026-09");
  assert.deepEqual(w.teams, m.teams);
  assert.deepEqual(w.all, m.all);
  assert.equal(w.total, m.total);
  assert.equal(w.unmapped, m.unmapped);
  assert.equal(w.teams.at(-1).group, "未對應組別");
});

test("byWeek：只計已通過，未通過不進任何週桶；週桶時數總和＝月桶總和", () => {
  const s = sum([
    ids("ou_a", "甲", { "开始时间": at(2026, 10, 6), "薪資計算加班時數": 2 }), // 週二 → 2026-10-05
    ids("ou_b", "乙", { "开始时间": at(2026, 10, 6), "申请状态": "审批中" }), // 不計
    ids("ou_a", "甲", { "开始时间": at(2026, 10, 13), "薪資計算加班時數": 5 }), // 週二 → 2026-10-12
  ]);
  assert.deepEqual(s.weeks, ["2026-10-12", "2026-10-05"]);
  assert.equal(s.byWeek.get("2026-10-05").all.people, 1);
  assert.equal(s.byWeek.get("2026-10-05").total, 2);
  assert.equal(s.byWeek.get("2026-10-12").total, 5);
  const weekTotal = [...s.byWeek.values()].reduce((a, w) => a + w.total, 0);
  const monthTotal = [...s.byMonth.values()].reduce((a, m) => a + m.total, 0);
  assert.equal(weekTotal, 7);
  assert.equal(weekTotal, monthTotal);
});

test("byWeek：讀不到人員名單（null）時，週桶組別一律「—」、不算未對應", () => {
  const s = summarizeOvertime([ids("ou_a", "甲", { "开始时间": at(2026, 10, 6) }), ids("ou_x", "外人", { "开始时间": at(2026, 10, 6) })], null);
  const w = s.byWeek.get("2026-10-05");
  assert.ok(w.people.every((p) => p.group === "—"));
  assert.equal(w.unmapped, 0);
  assert.equal(w.all.people, 2);
});
