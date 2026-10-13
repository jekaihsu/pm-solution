// Read-only probe: can the PM週報 app read the comment threads (聊天串) on Base
// records, and can each comment be tied to a record? Prints structure and counts
// only — no comment text — so the result can be pasted safely.
// Usage: node --env-file=.env.local scripts/probe-comments.mjs [baseToken] [tableId]
const API = (process.env.LARK_API_BASE || "https://open.larksuite.com").replace(/\/$/, "");
const BASE = process.argv[2] || "Sdw1bG1djaHsVGsRPvmjyVWipgg"; // V3
const TABLE = process.argv[3] || "tbl97f1uXqi7Qz0k"; // V3 外業工作單

async function call(path, token) {
  const res = await fetch(`${API}/open-apis${path}`, {
    method: token ? "GET" : "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(token ? {} : { body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }) }),
  });
  return res.json();
}

const shape = (v, depth = 0) => {
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1)] : [];
  if (v && typeof v === "object" && depth < 4) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x, depth + 1)]));
  return typeof v;
};

const auth = await call("/auth/v3/tenant_access_token/internal");
if (auth.code !== 0) throw new Error(`token: ${auth.code} ${auth.msg}`);
const token = auth.tenant_access_token;

for (const fileType of ["bitable", "base"]) {
  for (const extra of ["", `&table_id=${TABLE}`]) {
    const path = `/drive/v1/files/${BASE}/comments?file_type=${fileType}&page_size=5${extra}`;
    const j = await call(path, token);
    console.log(`\n=== ${path}`);
    console.log(`code=${j.code} msg=${j.msg}`);
    if (j.code === 0) {
      const items = j.data?.items ?? [];
      console.log(`items=${items.length} has_more=${j.data?.has_more}`);
      if (items[0]) console.log("item shape:", JSON.stringify(shape(items[0]), null, 1));
    }
  }
}
console.log("\n判讀：code=0 且 item 裡有能對應記錄的欄位（例如 record_id / table_id / quote）才可以接進網站。");
