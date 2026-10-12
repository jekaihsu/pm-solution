// Read-only check of the Lark Bases this app uses: lists every table in each Base,
// then the fields (name + type) and record count of each table.
// Usage: LARK_APP_ID=... LARK_APP_SECRET=... node scripts/inspect-lark.mjs [baseToken ...]
const API = (process.env.LARK_API_BASE || "https://open.larksuite.com").replace(/\/$/, "");
const BASES = process.argv.slice(2).length ? process.argv.slice(2) : ["Sdw1bG1djaHsVGsRPvmjyVWipgg", "H7W6b0PFWaVF1BsgqXJj3pQ9pXb", "JoOqbggsVar0ATsVgbcjh6IIp1g"];

const TYPES = { 1: "文字", 2: "數字", 3: "單選", 4: "多選", 5: "日期", 7: "核取", 11: "人員", 13: "電話", 15: "超連結", 17: "附件", 18: "單向關聯", 19: "查找引用", 20: "公式", 21: "雙向關聯", 22: "地理位置", 23: "群組", 1001: "建立時間", 1002: "修改時間", 1003: "建立人", 1004: "修改人", 1005: "自動編號" };

async function call(path, token, init = {}) {
  const res = await fetch(`${API}/open-apis${path}`, { ...init, headers: { "Content-Type": "application/json; charset=utf-8", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const j = await res.json();
  if (j.code !== 0) throw new Error(`${path} → ${j.code} ${j.msg}`);
  return j;
}

async function pages(path, token) {
  const out = [];
  let pt;
  do {
    const j = await call(`${path}${path.includes("?") ? "&" : "?"}page_size=100${pt ? `&page_token=${pt}` : ""}`, token);
    out.push(...(j.data.items ?? []));
    pt = j.data.has_more ? j.data.page_token : undefined;
  } while (pt);
  return out;
}

const auth = await call("/auth/v3/tenant_access_token/internal", null, { method: "POST", body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }) });
const token = auth.tenant_access_token;
console.log(`✓ 取得 tenant_access_token（${API}）\n`);

for (const base of BASES) {
  console.log(`══ Base ${base}`);
  let tables;
  try {
    tables = await pages(`/bitable/v1/apps/${base}/tables`, token);
  } catch (e) {
    console.log(`  ✗ 無法讀取：${e.message}\n    （確認應用已加入此 Base 並開通 bitable:app:readonly）\n`);
    continue;
  }
  for (const t of tables) {
    try {
      const fields = await pages(`/bitable/v1/apps/${base}/tables/${t.table_id}/fields`, token);
      const s = await call(`/bitable/v1/apps/${base}/tables/${t.table_id}/records/search?page_size=1`, token, { method: "POST", body: "{}" });
      console.log(`  ▸ ${t.name}  [${t.table_id}]  ${s.data.total ?? "?"} 筆`);
      console.log(`    ${fields.map((f) => `${f.field_name}(${TYPES[f.type] ?? f.type}${f.ui_type && f.type >= 19 ? `→${f.ui_type}` : ""})`).join("、")}`);
    } catch (e) {
      console.log(`  ▸ ${t.name}  [${t.table_id}]  ✗ ${e.message}`);
    }
  }
  console.log();
}
