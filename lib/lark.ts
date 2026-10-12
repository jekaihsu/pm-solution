// Server-only helpers for the Lark / Feishu Base (Bitable) Open API.
import "server-only";
import type { FieldMeta, FieldKind, TableData, TableMeta, CellValue } from "./types";

const API_BASE = (process.env.LARK_API_BASE || "https://open.larksuite.com").replace(/\/$/, "");
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_SECONDS ?? 30) * 1000;

export function isLarkConfigured(): boolean {
  return Boolean(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET && process.env.LARK_BASE_APP_TOKEN);
}

function appToken(): string {
  const token = process.env.LARK_BASE_APP_TOKEN;
  if (!token) throw new Error("LARK_BASE_APP_TOKEN is not set");
  return token;
}

// ---------- auth ----------

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getTenantAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const res = await fetch(`${API_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
    cache: "no-store",
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`Lark auth failed: ${json.code} ${json.msg}`);

  // Refresh 5 minutes before the token actually expires.
  cachedToken = { value: json.tenant_access_token, expiresAt: Date.now() + (json.expire - 300) * 1000 };
  return cachedToken.value;
}

async function larkFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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
  const json = await res.json();
  if (json.code !== 0) throw new Error(`Lark API ${path} failed: ${json.code} ${json.msg}`);
  return json.data as T;
}

// ---------- simple in-memory cache ----------

const cache = new Map<string, { value: unknown; expiresAt: number }>();

async function cached<T>(key: string, fn: () => Promise<T>, force = false): Promise<T> {
  const hit = cache.get(key);
  if (!force && hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await fn();
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

// ---------- tables & fields ----------

export async function listTables(force = false): Promise<TableMeta[]> {
  return cached(
    "tables",
    async () => {
      const tables: TableMeta[] = [];
      let pageToken: string | undefined;
      do {
        const qs = new URLSearchParams({ page_size: "100" });
        if (pageToken) qs.set("page_token", pageToken);
        const data = await larkFetch<{ items?: { table_id: string; name: string }[]; has_more: boolean; page_token?: string }>(
          `/bitable/v1/apps/${appToken()}/tables?${qs}`,
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
      return uiType === "Number" || uiType === "Currency" || uiType === "Progress" ? "number" : "text";
    default:
      return "text";
  }
}

async function listFields(tableId: string): Promise<FieldMeta[]> {
  const fields: FieldMeta[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ page_size: "100" });
    if (pageToken) qs.set("page_token", pageToken);
    const data = await larkFetch<{
      items?: { field_id: string; field_name: string; type: number; ui_type?: string; is_primary?: boolean }[];
      has_more: boolean;
      page_token?: string;
    }>(`/bitable/v1/apps/${appToken()}/tables/${tableId}/fields?${qs}`);
    for (const f of data.items ?? []) {
      fields.push({ id: f.field_id, name: f.field_name, kind: fieldKind(f.type, f.ui_type), primary: Boolean(f.is_primary) });
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

export async function getTableData(tableId: string, force = false): Promise<TableData> {
  return cached(
    `table:${tableId}`,
    async () => {
      const [tables, fields] = await Promise.all([listTables(), listFields(tableId)]);
      const records: TableData["records"] = [];
      let pageToken: string | undefined;
      do {
        const qs = new URLSearchParams({ page_size: "500" });
        if (pageToken) qs.set("page_token", pageToken);
        const data = await larkFetch<{
          items?: { record_id: string; fields: Record<string, unknown> }[];
          has_more: boolean;
          page_token?: string;
        }>(`/bitable/v1/apps/${appToken()}/tables/${tableId}/records/search?${qs}`, {
          method: "POST",
          body: JSON.stringify({ automatic_fields: true }),
        });
        for (const item of data.items ?? []) {
          const row: Record<string, CellValue> = {};
          for (const f of fields) row[f.name] = normalizeValue(item.fields[f.name], f.kind);
          records.push({ id: item.record_id, fields: row });
        }
        pageToken = data.has_more ? data.page_token : undefined;
      } while (pageToken && records.length < MAX_RECORDS);

      return {
        table: tables.find((t) => t.id === tableId) ?? { id: tableId, name: tableId },
        fields,
        records,
        fetchedAt: Date.now(),
        source: "lark",
      };
    },
    force,
  );
}
