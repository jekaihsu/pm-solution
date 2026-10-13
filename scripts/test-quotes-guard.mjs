// 報價總表只讀必要欄位（業主 2026-10-13 裁示）：金額、毛利、成本、預算、可請款、實收、紅利一律不讀。
import { test } from "node:test";
import assert from "node:assert/strict";
import { quotesField, SOURCES } from "../lib/reports.ts";

test("quotesField：金額類 false、期限／確認單營業額 true", () => {
  for (const n of ["契約價格(未稅)", "契約價格(含稅)", "案件毛利", "確認單成本", "報價實收營業額", "報價紅利", "預算", "可請款金額"]) assert.equal(quotesField(n), false, n);
  for (const n of ["外業期限", "控制確認單營業額", "案件編號", "PM", "內業期限(圖)", "外業負責組別"]) assert.equal(quotesField(n), true, n);
});

test("quotes 來源掛上 allowField", () => {
  const q = SOURCES.find((s) => s.key === "quotes");
  assert.ok(q?.allowField);
  assert.equal(q.allowField("契約價格(未稅)"), false);
});
