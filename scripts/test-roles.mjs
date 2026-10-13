// 權限判斷測試：HR_VIEWERS（人事頁）與 SOP_EDITORS（SOP 勾選）。不連 Lark。
// Usage: node --test scripts/test-roles.mjs
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { hrPermission, sopPermission } from "../lib/roles.ts";

const as = (openId) => ({ openId, name: "測試", exp: Math.floor(Date.now() / 1000) + 3600 });
const KEYS = ["AUTH_DISABLED", "HR_VIEWERS", "SOP_EDITORS"];
let saved;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test("HR_VIEWERS=*：任何登入者都能看人事頁", () => {
  process.env.HR_VIEWERS = "*";
  for (const id of ["ou_a", "ou_b", "ou_never_listed"]) assert.equal(hrPermission(as(id)).canView, true, id);
});

test("HR_VIEWERS=* 仍要登入：沒有 session 不能看", () => {
  process.env.HR_VIEWERS = "*";
  const r = hrPermission(null);
  assert.equal(r.canView, false);
  assert.match(r.reason, /登入/);
});

test("HR_VIEWERS 留空或未設定：沒有人能看（安全預設不變）", () => {
  for (const v of [undefined, "", "   ", ",", " , "]) {
    if (v === undefined) delete process.env.HR_VIEWERS;
    else process.env.HR_VIEWERS = v;
    for (const id of ["ou_a", "ou_b"]) {
      const r = hrPermission(as(id));
      assert.equal(r.canView, false, `${JSON.stringify(v)} ${id}`);
      assert.match(r.reason, /HR_VIEWERS/);
    }
  }
});

test("HR_VIEWERS 清單（逗號或空白分隔）：只有清單內的人能看", () => {
  for (const v of ["ou_a,ou_b", "ou_a ou_b", " ou_a , ou_b\n"]) {
    process.env.HR_VIEWERS = v;
    assert.equal(hrPermission(as("ou_a")).canView, true, v);
    assert.equal(hrPermission(as("ou_b")).canView, true, v);
    assert.equal(hrPermission(as("ou_c")).canView, false, v);
    assert.equal(hrPermission(as("ou")).canView, false, `${v}（不能用前綴比對）`);
  }
});

test("HR_VIEWERS 清單裡混 * 等同全員（和 SOP_EDITORS 的既有寫法一致）", () => {
  process.env.HR_VIEWERS = "ou_a,*";
  assert.equal(hrPermission(as("ou_zzz")).canView, true);
});

test("AUTH_DISABLED=1（只限本機）：免登入可看，與 HR_VIEWERS 無關", () => {
  process.env.AUTH_DISABLED = "1";
  assert.equal(hrPermission(null).canView, true);
  process.env.HR_VIEWERS = "ou_a";
  assert.equal(hrPermission(null).canView, true);
});

test("SOP_EDITORS：*／留空＝所有登入者可勾；清單＝只有清單內可勾；沒登入不行", () => {
  process.env.SOP_EDITORS = "*";
  assert.equal(sopPermission(as("ou_x")).canEdit, true);
  process.env.SOP_EDITORS = "";
  assert.equal(sopPermission(as("ou_x")).canEdit, true);
  process.env.SOP_EDITORS = "ou_a";
  assert.equal(sopPermission(as("ou_a")).canEdit, true);
  assert.equal(sopPermission(as("ou_x")).canEdit, false);
  assert.equal(sopPermission(null).canEdit, false);
});
