import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readYupaiTable, resolveYupaiFields, YUPAI_PROFILES } from "../lib/yupaiSource.ts";
import { SOURCES } from "../lib/reports.ts";
// Only this worker replaces server-only. All fetch calls below are synthetic; unknown requests fail.
register("data:text/javascript," + encodeURIComponent('export async function resolve(s,c,n) { return s === "server-only" ? {url:"data:text/javascript,export {}",shortCircuit:true} : n(s,c); }'));
const p = YUPAI_PROFILES.find((p) => p.key === "pm-cost");
const fields = p.columns.map((c, i) => ({ id: c.id, name: `renamed${i}`, kind: "text", primary: false }));
const item = (id, day = 46302.66667, who = { link_record_ids: ["person"] }) => ({ record_id: id, fields: { renamed0: day, renamed1: who } });
const read = (pages, limit) => { let n = 0; return readYupaiTable(p, fields, async () => { if (n >= pages.length) throw new Error("unexpected page"); return pages[n++]; }, limit); };
test("七來源皆 HR、完整表、版本化 profile，只讀最小業務欄位", () => {
  const sources = SOURCES.filter((s) => s.readProfile);
  assert.equal(sources.length, 7);
  for (const s of sources) { assert.equal(s.restricted, "hr"); assert.equal(s.viewId, undefined); assert.ok(s.key.startsWith("yupai-v3-")); }
  assert.deepEqual(YUPAI_PROFILES.map((p) => p.columns.length), [3, 6, 2, 2, 2, 2, 2]);
  for (const profile of YUPAI_PROFILES) assert.ok(!profile.columns.some((c) => /金額|總薪資|底薪|加班費|建立時間|填寫時間/.test(c.name)));
  assert.throws(() => resolveYupaiFields(p, []), /REQUIRED_FIELD/);
});
test("field ID優先、向Lark最小投影、完整多頁、保留link、不以日期多值猜測", async () => {
  const calls = [];
  const t = await readYupaiTable(p, [...fields, { id: "other", name: "不應讀取", kind: "number" }], async (names, token) => {
    calls.push({ names, token });
    return token ? { items: [item("b", ["2026-10-19", "2026-10-20"])], has_more: false, total: 2 } : { items: [item("a", { type: 2, value: [46302.66667] })], has_more: true, page_token: "next", total: 2 };
  });
  assert.deepEqual(calls, [{ names: ["renamed0", "renamed1"], token: undefined }, { names: ["renamed0", "renamed1"], token: "next" }]);
  assert.equal(t.records[0].fields.工作日期, "2026-10-08"); assert.equal(t.records[1].fields.工作日期, null); assert.deepEqual(t.records[0].links.填表人, ["person"]); assert.equal(t.complete, true); assert.equal(t.total, 2);
});
for (const [label, pages, limit] of [
  ["缺token", [{ items: [item("a")], has_more: true }]],
  ["重複token", [{ items: [item("a")], has_more: true, page_token: "t" }, { items: [item("b")], has_more: true, page_token: "t" }]],
  ["空頁仍有下一頁", [{ items: [], has_more: true, page_token: "t" }]],
  ["達上限仍有下一頁", [{ items: [item("a")], has_more: true, page_token: "t" }], 1],
  ["超過上限", [{ items: [item("a"), item("b")], has_more: false }], 1],
  ["筆數不符", [{ items: [item("a")], has_more: false, total: 2 }]],
  ["total改變", [{ items: [item("a")], has_more: true, page_token: "t", total: 2 }, { items: [item("b")], has_more: false, total: 3 }]],
  ["重複record", [{ items: [item("a"), item("a")], has_more: false, total: 2 }]],
  ["無has_more", [{ items: [item("a")] }]],
]) test(`不完整讀取必失敗：${label}`, async () => { await assert.rejects(read(pages, limit), /YUPAI_/); });
test("空表合法成功；最後頁剛好上限合法；讀取中失敗不產生部分成功", async () => {
  assert.equal((await read([{ items: [], has_more: false, total: 0 }])).total, 0);
  assert.equal((await read([{ items: [item("a")], has_more: false, total: 1 }], 1)).total, 1);
  await assert.rejects(readYupaiTable(p, fields, async (_, token) => { if (token) throw new Error("offline"); return { items: [item("a")], has_more: true, page_token: "t" }; }), /offline/);
});
test("嚴格在職、原始日期驗證及 link形狀；不額外解析link標題", async () => {
  const people = YUPAI_PROFILES[0];
  const f = people.columns.map((c) => ({ id: c.id ?? c.name, name: c.name, kind: "text", primary: false }));
  const t = await readYupaiTable(people, f, async () => ({ items: [true, "true", 1, false].map((active, i) => ({ record_id: `p${i}`, fields: { 姓名: [{ text: "甲" }], 在職: active, 所屬組別: "控制" } })), has_more: false }));
  assert.deepEqual(t.records.map((r) => r.fields.在職), [true, false, false, false]);
  for (const who of [{ record_ids: ["person"] }, [{ id: "person" }], { value: [{ record_id: "person" }] }]) {
    const t = await read([{ items: [item("a", "2026-10-19", who)], has_more: false }]); assert.deepEqual(t.records[0].links.填表人, ["person"]);
  }
  await assert.rejects(read([{ items: [item("a", "2026-10-19", { unexpected: "person" })], has_more: false }]), /LINK_SHAPE/);
});
test("實際Lark讀取路徑：最小field_names、快取隔離、失敗不回舊成功、過期必等待新資料", async () => {
  const { getSourceData, sourceCacheKey } = await import("../lib/lark.ts");
  const originalFetch = globalThis.fetch;
  const originalId = process.env.LARK_APP_ID, originalSecret = process.env.LARK_APP_SECRET;
  process.env.LARK_APP_ID = "synthetic"; process.env.LARK_APP_SECRET = "synthetic";
  const src = SOURCES.find((s) => s.key === "yupai-v3-pm-cost");
  const ordinary = { ...src, readProfile: undefined, key: "other" };
  assert.notEqual(sourceCacheKey(src), sourceCacheKey(ordinary));
  assert.notEqual(sourceCacheKey(src), sourceCacheKey({ ...src, readProfile: "next-version" }));
  const calls = []; let fail = false, record = "a";
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname; calls.push({ path, init });
    if (path.endsWith("/tenant_access_token/internal")) return { json: async () => ({ code: 0, tenant_access_token: "synthetic", expire: 7200 }) };
    if (path.endsWith("/fields")) return { json: async () => ({ code: 0, data: { items: fields.map((f) => ({ field_id: f.id, field_name: f.name, type: 1 })), has_more: false } }) };
    if (path.endsWith("/records/search")) {
      assert.deepEqual(JSON.parse(init.body), { automatic_fields: false, field_names: ["renamed0", "renamed1"] });
      if (fail) throw new Error("synthetic unavailable");
      return { json: async () => ({ code: 0, data: { items: [item(record)], has_more: false, total: 1 } }) };
    }
    throw new Error("unexpected read");
  };
  try {
    assert.equal((await getSourceData(src, true)).records[0].id, "a");
    // Must not return an ordinary source cache entry with the same table.
    const store = globalThis.__pmLark;
    store.cache.set(sourceCacheKey(ordinary), { value: { incorrect: true }, expiresAt: Date.now() + 60000 });
    fail = true;
    await assert.rejects(getSourceData(src, true), /unavailable/);
    await assert.rejects(getSourceData(src), /unavailable/); // previous still-fresh success was invalidated
    assert.equal(store.cache.has(sourceCacheKey(src)), false);
    fail = false; record = "b";
    assert.equal((await getSourceData(src)).records[0].id, "b");
    store.cache.get(sourceCacheKey(src)).expiresAt = 0; record = "c";
    assert.equal((await getSourceData(src)).records[0].id, "c"); // not SWR "b"
    store.cache.get(sourceCacheKey(src)).expiresAt = 0; fail = true;
    await assert.rejects(getSourceData(src), /unavailable/);
    assert.ok(!calls.some((c) => c.path.includes("batch_get")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalId === undefined) delete process.env.LARK_APP_ID; else process.env.LARK_APP_ID = originalId;
    if (originalSecret === undefined) delete process.env.LARK_APP_SECRET; else process.env.LARK_APP_SECRET = originalSecret;
  }
});
