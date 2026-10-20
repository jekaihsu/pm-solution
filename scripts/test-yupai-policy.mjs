// JK 2026-10-20 policy fixtures; no network or Lark credentials.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXEMPT_NAMES, DEPARTED_NAMES, EXEMPT_REASON, normalizeName, classifyPerson,
} from "../lib/yupaiPolicy.ts";

test("唯一免填名單正好五人，離職名單獨立；預排和日誌一起豁免", () => {
  assert.deepEqual([...EXEMPT_NAMES], ["許茂坤", "鄭光瑞", "William Chiu", "許喆凱", "林育寬"]);
  assert.deepEqual([...DEPARTED_NAMES], ["陳星穎"]);
  assert.equal(EXEMPT_REASON, "JK 確認免填預排");
  for (const name of EXEMPT_NAMES) {
    const p = classifyPerson(name, "行政");
    assert.equal(p.requiresPlanning, false, name);
    assert.equal(p.requiresLog, false, name);
    assert.equal(p.exemptionReason, EXEMPT_REASON, name);
    assert.equal(Boolean(p.departedReason), false, name);
  }
});

test("指定簡繁及精確別名正規化、保留英文內部空白，不做姓名模糊比對", () => {
  for (const name of ["郑光睿", "鄭光睿", "郑光瑞", "鄭光瑞\n"]) {
    assert.equal(normalizeName(name), "鄭光瑞");
    assert.equal(classifyPerson(name, "外業").requiresLog, false);
  }
  for (const name of ["林育宽", " 林育寬\n"]) assert.equal(normalizeName(name), "林育寬");
  assert.equal(normalizeName("  William\t  Chiu\n"), "William\t  Chiu");
  assert.equal(normalizeName("Ｗｉｌｌｉａｍ　Ｃｈｉｕ"), "William Chiu");
  assert.equal(normalizeName("鄭秉彝"), "鄭秉彜");
  for (const name of ["WilliamChiu", "許茂坤甲", "鄭 光瑞", "一般員工"]) {
    assert.equal(classifyPerson(name, "內業").requiresPlanning, true, name);
    assert.equal(classifyPerson(name, "內業").requiresLog, true, name);
  }
});

test("陳星穎的離職優先於組別，與豁免理由分開", () => {
  for (const name of ["陳星穎", " 陳星穎\n"]) {
    const p = classifyPerson(name, "管理");
    assert.equal(p.requiresPlanning, false);
    assert.equal(p.requiresLog, false);
    assert.match(p.departedReason, /離職/);
    assert.equal(Boolean(p.exemptionReason), false);
  }
});

test("主管和所有非三大組均檢核兩項，保留原組別的內業分類", () => {
  for (const name of ["鍾智偉", "涂振邦", "張家彬", "吳柏頤", "吳科翰"]) {
    for (const group of ["經理", "PM", "行政", "IT", "控制", "圖報A", "圖報B", "顧問"]) {
      const p = classifyPerson(name, group);
      assert.equal(p.classification, "內業", `${name} ${group}`);
      assert.equal(p.requiresPlanning, true, `${name} ${group}`);
      assert.equal(p.requiresLog, true, `${name} ${group}`);
    }
  }
  for (const group of ["外業", "業務", "內業"]) {
    const p = classifyPerson("一般員工", group);
    assert.equal(p.classification, group);
    assert.equal(p.requiresPlanning, true);
    assert.equal(p.requiresLog, true);
  }
});

test("組別和姓名空白標示資料注意，仍檢核兩項", () => {
  const p = classifyPerson("張証崴", " \n");
  assert.equal(p.classification, "內業");
  assert.equal(p.requiresPlanning, true);
  assert.equal(p.requiresLog, true);
  assert.ok(p.dataAttentionReasons.some((r) => /未填組別/.test(r)));
  assert.ok(classifyPerson("", "內業").dataAttentionReasons.some((r) => /未填姓名/.test(r)));
});

test("未列別名不自行擴張，不全域替換睿", () => {
  for (const name of ["陳星影", "陈星颖", "林育寛", "王睿", "William  Chiu"]) assert.equal(normalizeName(name), name);
});
