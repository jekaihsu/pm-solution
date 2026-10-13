// Server-only helpers for the Lark / Feishu Base (Bitable) Open API.
import "server-only";
import type { FieldMeta, FieldKind, TableData, TableMeta, CellValue } from "./types";
import type { SourceDef } from "./reports";
import { personRefs } from "./people";

const API_BASE = (process.env.LARK_API_BASE || "https://open.larksuite.com").replace(/\/$/, "");
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_SECONDS ?? 60) * 1000;

export function isLarkConfigured(): boolean {
  return Boolean(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET);
}

// ---------- auth ----------

// Next.js bundles the startup hook (instrumentation) and the API routes as separate
// module copies, so shared state lives on globalThis — otherwise the startup warm-up
// would fill a cache the pages never read.
const shared = globalThis as typeof globalThis & {
  __pmLark?: {
    token: { value: string; expiresAt: number } | null;
    cache: Map<string, { value: unknown; expiresAt: number }>;
    inflight: Map<string, Promise<unknown>>;
  };
};
const store = (shared.__pmLark ??= { token: null, cache: new Map(), inflight: new Map() });

async function getTenantAccessToken(): Promise<string> {
  if (store.token && store.token.expiresAt > Date.now()) return store.token.value;

  const res = await fetch(`${API_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
    cache: "no-store",
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`Lark auth failed: ${json.code} ${json.msg}`);

  // Refresh 5 minutes before the token actually expires.
  store.token = { value: json.tenant_access_token, expiresAt: Date.now() + (json.expire - 300) * 1000 };
  return store.token.value;
}

// Plain-language explanations for the errors people actually hit.
const HINTS: Record<number, string> = {
  1254302: "此 Base 開啟了進階權限，PM週報應用尚未被加入可閱讀此資料表的角色",
  91402: "找不到此 Base 或資料表",
  1254040: "找不到此 Base（app_token 錯誤或已刪除）",
  1254041: "找不到此資料表",
  99991672: "應用缺少所需權限（多維表格／假勤／通訊錄），請在 PM週報 後台開通並發布新版本",
  41050: "通訊錄權限範圍不足，請在 PM週報 後台把通訊錄權限範圍設為全部成員",
  40004: "通訊錄權限範圍不足，請在 PM週報 後台把通訊錄權限範圍設為全部成員",
  91403: "應用沒有此 Base 的存取權，請在 Base 的「新增文件應用」加入 PM週報",
};

// Lark answers 99991400 when too many requests arrive at once (the startup warm-up
// loads every source together); waiting and retrying keeps link titles from falling
// back to raw record ids.
// 99991400＝開放平台頻率限制；1254290＝多維表格 TooManyRequest（2026-10-13 預熱時 link 標題查詢實際遇到）。
const RATE_LIMITED = new Set([99991400, 1254290]);
const RETRY_DELAYS_MS = [500, 1500, 3000, 6000];

// Carries the Lark error code so callers can tell "missing permission" from other failures.
export class LarkApiError extends Error {
  code: number;
  larkMsg: string;
  violations: string[];
  constructor(message: string, code: number, larkMsg: string, violations: string[]) {
    super(message);
    this.name = "LarkApiError";
    this.code = code;
    this.larkMsg = larkMsg;
    this.violations = violations;
  }
}

async function larkFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let json: { code: number; msg: string; data?: unknown; error?: { permission_violations?: { subject?: string }[] } };
  for (let attempt = 0; ; attempt++) {
    const token = await getTenantAccessToken();
    const res = await fetch(`${API_BASE}/open-apis${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
        ...init.headers,
      },
      cache: "no-store",
    });
    json = await res.json();
    if (!RATE_LIMITED.has(json.code) || attempt >= RETRY_DELAYS_MS.length) break;
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] + Math.random() * 300));
  }
  if (json.code !== 0) {
    const violations = (json.error?.permission_violations ?? []).map((v) => v.subject ?? "").filter(Boolean);
    throw new LarkApiError(`${HINTS[json.code] ? `${HINTS[json.code]}｜` : ""}Lark API ${path.split("?")[0]} failed: ${json.code} ${json.msg}`, json.code, String(json.msg ?? ""), violations);
  }
  return json.data as T;
}

// 唯讀白名單：網站只讀 Lark。要多讀一種 API，在這裡明確加一行（方法＋路徑），不開放任意路徑。
const READ_ONLY_CALLS: [method: "GET" | "POST", path: RegExp][] = [
  ["GET", /^\/attendance\/v1\/groups(\/[^/?]+)?$/],
  ["POST", /^\/attendance\/v1\/user_tasks\/query$/],
  ["POST", /^\/attendance\/v1\/user_approvals\/query$/],
  ["GET", /^\/contact\/v3\/users\/batch$/],
  ["GET", /^\/contact\/v3\/users\/find_by_department$/],
  ["GET", /^\/contact\/v3\/departments\/[^/?]+\/children$/],
];

// 通用唯讀 tenant API 呼叫（假勤、通訊錄的查詢）：沿用限流重試與 HINTS；陣列參數會重複帶 key。
export async function larkReadApi<T>(method: "GET" | "POST", path: string, opts: { query?: Record<string, string | number | string[]>; body?: unknown } = {}): Promise<T> {
  if (!READ_ONLY_CALLS.some(([m, re]) => m === method && re.test(path))) throw new Error(`不在唯讀白名單：${method} ${path}`);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) for (const x of Array.isArray(v) ? v : [v]) qs.append(k, String(x));
  const q = qs.toString();
  return larkFetch<T>(`${path}${q ? `?${q}` : ""}`, { method, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
}

// ---------- simple in-memory cache ----------

const cache = store.cache;

const inflight = store.inflight;

// Fresh hit → served. Stale hit → served immediately while one background refresh
// runs (stale-while-revalidate). No hit or force → waits for the fetch. Concurrent
// callers for the same key share one fetch.
async function cached<T>(key: string, fn: () => Promise<T>, force = false, ttl = CACHE_TTL_MS): Promise<T> {
  const hit = cache.get(key);
  if (!force && hit && hit.expiresAt > Date.now()) return hit.value as T;
  const run = () => {
    let p = inflight.get(key) as Promise<T> | undefined;
    if (!p) {
      p = fn()
        .then((value) => {
          cache.set(key, { value, expiresAt: Date.now() + ttl });
          return value;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    return p;
  };
  if (!force && hit) {
    run().catch((err) => console.error(`[refresh ${key}]`, (err as Error).message));
    return hit.value as T;
  }
  return run();
}

// Runs async jobs with at most `limit` in flight.
async function pool<T>(items: T[], limit: number, job: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await job(items[next++]);
    }),
  );
}

// Last successful value for a key, kept after expiry so a failed refresh can
// fall back to it (marked stale) instead of showing nothing.
export function lastGood<T>(key: string): T | undefined {
  return cache.get(key)?.value as T | undefined;
}

export const sourceCacheKey = (src: SourceDef) => `source:${src.baseToken}:${src.tableId ?? src.key}:${src.viewId ?? ""}`;

async function resolveTableId(src: SourceDef): Promise<string> {
  if (src.tableId) return src.tableId;
  if (!src.baseToken || !src.tableName) throw new Error(`Source ${src.key} has no Base/table configured`);
  const tables = await listTables(src.baseToken);
  const t = tables.find((x) => src.tableName!.test(x.name));
  if (!t) throw new Error(`在這個 Base 找不到名稱符合「${src.tableName.source}」的資料表（共 ${tables.length} 張表）`);
  return t.id;
}

// ---------- tables & fields ----------

// Diagnostics: which tables in a Base have a field whose name matches (names only).
export async function findFields(baseToken: string, re: RegExp): Promise<{ table: string; tableId: string; field: string; type: number }[]> {
  return cached(`find:${baseToken}:${re.source}`, async () => {
    const out: { table: string; tableId: string; field: string; type: number }[] = [];
    const tables = await listTables(baseToken);
    await pool(tables, 3, async (t) => {
      const fields = await listFields(baseToken, t.id).catch(() => []);
      for (const f of fields) if (re.test(f.name)) out.push({ table: t.name, tableId: t.id, field: f.name, type: f.rawType ?? 0 });
    });
    return out;
  }, false, 10 * 60 * 1000);
}

export async function listTables(baseToken: string, force = false): Promise<TableMeta[]> {
  return cached(
    `tables:${baseToken}`,
    async () => {
      const tables: TableMeta[] = [];
      let pageToken: string | undefined;
      do {
        const qs = new URLSearchParams({ page_size: "100" });
        if (pageToken) qs.set("page_token", pageToken);
        const data = await larkFetch<{ items?: { table_id: string; name: string }[]; has_more: boolean; page_token?: string }>(
          `/bitable/v1/apps/${baseToken}/tables?${qs}`,
        );
        for (const t of data.items ?? []) tables.push({ id: t.table_id, name: t.name });
        pageToken = data.has_more ? data.page_token : undefined;
      } while (pageToken);
      return tables;
    },
    force,
  );
}

// Lark field type codes → our coarse kinds.
// https://open.larksuite.com/document/server-docs/docs/bitable-v1/app-table-field/guide
function fieldKind(type: number, uiType?: string): FieldKind {
  switch (type) {
    case 2: // number (also currency, progress, rating)
      return "number";
    case 3:
      return "select";
    case 4:
      return "multiselect";
    case 5: // date
    case 1001: // created time
    case 1002: // modified time
      return "date";
    case 7:
      return "checkbox";
    case 11: // person
    case 1003: // created by
    case 1004: // modified by
      return "person";
    case 20: // formula
    case 19: // lookup
      if (uiType === "Number" || uiType === "Currency" || uiType === "Progress") return "number";
      if (uiType === "DateTime" || uiType === "CreatedTime" || uiType === "ModifiedTime") return "date";
      return "text";
    default:
      return "text";
  }
}

export async function listFields(baseToken: string, tableId: string): Promise<FieldMeta[]> {
  const fields: FieldMeta[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ page_size: "100" });
    if (pageToken) qs.set("page_token", pageToken);
    const data = await larkFetch<{
      items?: { field_id: string; field_name: string; type: number; ui_type?: string; is_primary?: boolean; property?: { table_id?: string } | null }[];
      has_more: boolean;
      page_token?: string;
    }>(`/bitable/v1/apps/${baseToken}/tables/${tableId}/fields?${qs}`);
    for (const f of data.items ?? []) {
      const isLink = f.type === 18 || f.type === 21;
      fields.push({
        id: f.field_id,
        name: f.field_name,
        // Links are resolved to the linked records' titles and behave like tags.
        kind: isLink ? "multiselect" : fieldKind(f.type, f.ui_type),
        primary: Boolean(f.is_primary),
        rawType: f.type,
        linkTable: isLink ? (f.property?.table_id ?? tableId) : undefined,
      });
    }
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);
  return fields;
}

// ---------- records ----------

// Flattens the many shapes Lark uses for cell values into something chartable.
function normalizeValue(raw: unknown, kind: FieldKind): CellValue {
  if (raw === null || raw === undefined) return null;

  // Formula / lookup wrap their result: { type, value: [...] }
  if (typeof raw === "object" && !Array.isArray(raw) && "value" in (raw as object)) {
    return normalizeValue((raw as { value: unknown }).value, kind);
  }

  if (kind === "number") {
    const v = Array.isArray(raw) ? raw[0] : raw;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (kind === "date") {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === "number" ? v : null;
  }
  if (kind === "checkbox") return Boolean(raw);
  if (kind === "multiselect") return Array.isArray(raw) ? raw.map(String) : [String(raw)];
  if (kind === "person") {
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map((p) => (p && typeof p === "object" ? String((p as { name?: string; en_name?: string }).name ?? (p as { en_name?: string }).en_name ?? "") : String(p)));
  }

  // text, select, url, link, attachment...
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    return raw
      .map((seg) => {
        if (seg && typeof seg === "object") {
          const s = seg as { text?: string; name?: string; link?: string };
          return s.text ?? s.name ?? s.link ?? "";
        }
        return String(seg);
      })
      .join("");
  }
  if (typeof raw === "object") {
    const o = raw as { text?: string; link?: string; link_record_ids?: string[] };
    if (o.text) return o.text;
    if (o.link) return o.link;
    if (o.link_record_ids) return o.link_record_ids.join(", ");
  }
  return JSON.stringify(raw);
}

const MAX_RECORDS = 20000;

// Link cells come back as { link_record_ids } or [{ record_ids, text? }]; keep the ids.
function linkIds(raw: unknown): string[] | null {
  if (!raw) return null;
  const ids: string[] = [];
  const visit = (v: unknown) => {
    if (!v) return;
    if (typeof v === "string") ids.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (typeof v === "object") {
      const o = v as { link_record_ids?: string[]; record_ids?: string[]; value?: unknown };
      if (o.link_record_ids) ids.push(...o.link_record_ids);
      else if (o.record_ids) ids.push(...o.record_ids);
      else if (o.value) visit(o.value);
    }
  };
  visit(raw);
  return ids.length ? ids : null;
}

// Lookup/formula fields whose ui_type didn't reveal the result type: if every value is
// an epoch-millisecond timestamp treat the field as a date, if every value is numeric
// treat it as a number.
function inferLookupKinds(fields: FieldMeta[], records: TableData["records"]) {
  for (const f of fields) {
    if (f.kind !== "text" || (f.rawType !== 19 && f.rawType !== 20)) continue;
    const vals = records.map((r) => r.fields[f.name]).filter((v) => v !== null && v !== "");
    if (!vals.length) continue;
    const allNum = vals.every((v) => typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v));
    if (!allNum) continue;
    const allMs = vals.every((v) => /^\d{13}$/.test(v as string) && Number(v) > 946684800000 && Number(v) < 4102444800000);
    f.kind = allMs ? "date" : "number";
    for (const r of records) {
      const v = r.fields[f.name];
      r.fields[f.name] = v === null || v === "" ? null : Number(v);
    }
  }
}

// Replaces linked record ids with the linked records' primary-field text.
async function resolveLinks(baseToken: string, fields: FieldMeta[], records: TableData["records"]) {
  await pool(fields.filter((x) => x.linkTable), 4, async (f) => {
    const ids = [...new Set(records.flatMap((r) => (r.fields[f.name] as string[] | null) ?? []))];
    if (!ids.length) return;
    try {
      const names = await linkTitles(baseToken, f.linkTable!, ids);
      for (const r of records) {
        const v = r.fields[f.name] as string[] | null;
        if (v) r.fields[f.name] = v.map((id) => names.get(id) ?? id);
      }
    } catch (err) {
      console.error(`[link ${f.name}]`, (err as Error).message); // keep ids if the linked table can't be read
    }
  });
}

async function linkTitles(baseToken: string, tableId: string, ids: string[]): Promise<Map<string, string>> {
  const key = `titles:${baseToken}:${tableId}`;
  const known = (cache.get(key)?.value as Map<string, string> | undefined) ?? new Map<string, string>();
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length) {
    const tFields = await cached(`fields:${baseToken}:${tableId}`, () => listFields(baseToken, tableId), false, 30 * 60 * 1000);
    const primary = tFields.find((x) => x.primary) ?? tFields[0];
    const batches: string[][] = [];
    for (let i = 0; i < missing.length; i += 100) batches.push(missing.slice(i, i + 100));
    await pool(batches, 4, async (batch) => {
      const data = await larkFetch<{ records?: { record_id: string; fields: Record<string, unknown> }[] }>(
        `/bitable/v1/apps/${baseToken}/tables/${tableId}/records/batch_get`,
        { method: "POST", body: JSON.stringify({ record_ids: batch }) },
      );
      for (const rec of data.records ?? []) {
        const v = normalizeValue(rec.fields[primary.name], primary.kind === "number" ? "number" : "text");
        known.set(rec.record_id, v === null || v === "" ? rec.record_id : String(v));
      }
    });
    cache.set(key, { value: known, expiresAt: Date.now() + 10 * 60 * 1000 });
  }
  return known;
}

export async function getSourceData(src: SourceDef, force = false): Promise<TableData> {
  const { baseToken, viewId } = src;
  if (!baseToken || !(src.tableId || src.tableName)) throw new Error(`Source ${src.key} has no Base/table configured`);
  return cached(
    sourceCacheKey(src),
    async () => {
      const tableId = await resolveTableId(src);
      const all = await listFields(baseToken, tableId);
      const fields = src.allowField ? all.filter((f) => src.allowField!(f.name)) : all;
      if (src.allowField && !fields.length) throw new Error(`資料表沒有可讀取的欄位（${all.length} 個欄位都不在允許清單內）`);
      const records: TableData["records"] = [];
      let total: number | undefined;
      let excluded = 0;
      let pageToken: string | undefined;
      do {
        const qs = new URLSearchParams({ page_size: "500" });
        if (pageToken) qs.set("page_token", pageToken);
        const data = await larkFetch<{
          items?: { record_id: string; fields: Record<string, unknown>; created_time?: number }[];
          has_more: boolean;
          page_token?: string;
          total?: number;
        }>(`/bitable/v1/apps/${baseToken}/tables/${tableId}/records/search?${qs}`, {
          method: "POST",
          body: JSON.stringify({
            automatic_fields: true,
            ...(viewId ? { view_id: viewId } : {}),
            // Sensitive tables: ask Lark for the allowed fields only.
            ...(src.allowField ? { field_names: fields.map((f) => f.name) } : {}),
          }),
        });
        total = data.total ?? total;
        for (const item of data.items ?? []) {
          if (src.createdAfter !== undefined && !(typeof item.created_time === "number" && item.created_time >= src.createdAfter)) {
            excluded++;
            continue;
          }
          const row: Record<string, CellValue> = {};
          const links: Record<string, string[]> = {}; // record_ids of link cells, kept before resolveLinks swaps them for titles
          const people: Record<string, { id: string; name: string }[]> = {}; // open_id + name of person cells (normalizeValue keeps names only)
          for (const f of fields) {
            if (f.linkTable) {
              const ids = linkIds(item.fields[f.name]);
              row[f.name] = ids;
              if (ids) links[f.name] = [...ids];
            } else {
              row[f.name] = normalizeValue(item.fields[f.name], f.kind);
              if (f.kind === "person") {
                const refs = personRefs(item.fields[f.name]);
                if (refs) people[f.name] = refs;
              }
            }
          }
          records.push({ id: item.record_id, fields: row, ...(Object.keys(links).length ? { links } : {}), ...(Object.keys(people).length ? { people } : {}) });
        }
        pageToken = data.has_more ? data.page_token : undefined;
      } while (pageToken && records.length < MAX_RECORDS);

      inferLookupKinds(fields, records);
      await resolveLinks(baseToken, fields, records);

      return {
        table: { id: tableId, name: src.name },
        fields,
        records,
        fetchedAt: Date.now(),
        source: "lark",
        complete: !pageToken,
        total: records.length,
        sourceTotal: total ?? records.length + excluded,
        excluded,
      };
    },
    force,
  );
}
