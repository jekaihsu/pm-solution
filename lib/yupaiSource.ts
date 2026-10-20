import type { CellValue, FieldMeta, TableData } from "./types";
import { normalizeWorkDate } from "./workDate";

export const YUPAI_PROFILE_VERSION = "v2";
type Column = { id?: string; name: string; date?: boolean; link?: boolean; checkbox?: boolean };
export interface YupaiProfile { key: string; tableId: string; name: string; columns: Column[] }
export const YUPAI_PROFILES: YupaiProfile[] = [
  { key: "people", tableId: "tblmlpA6nG5Ou7NQ", name: "人員名單", columns: [{ name: "姓名" }, { name: "在職", checkbox: true }, { name: "所屬組別", id: "fld02jclwv" }] },
  { key: "schedule", tableId: "tblN8c3WN44233aG", name: "工作預排", columns: [
    { name: "開始日期", id: "fldMXOggGP", date: true }, { name: "結束日期", id: "fldjWv1xST", date: true },
    { name: "人員", id: "fld7KNCsVe", link: true }, { name: "條類型", id: "fld78OmLVn" },
    { name: "組別", id: "fldNDUy2XP" }, { name: "業別", id: "fldrENe4H6" },
  ] },
  { key: "field-work", tableId: "tbl97f1uXqi7Qz0k", name: "外業工作單", columns: [{ name: "工作日期-薪資", date: true }, { name: "此單出工人" }] },
  { key: "internal-work", tableId: "tblTP5Naz52FBpFg", name: "內業工作單", columns: [{ name: "工作日期-營業額明細", date: true }, { name: "姓名" }] },
  { key: "admin-work", tableId: "tbl2c5CLgwPZ3Pl2", name: "行政工作單", columns: [{ name: "工作日期-營業額明細", date: true }, { name: "營業額人員-明細" }] },
  { key: "pm-cost", tableId: "tblYCWD6SbbRdqXQ", name: "業務PM成本單", columns: [{ name: "工作日期", id: "fldqWTRVWC", date: true }, { name: "填表人", id: "fldjgerj5e", link: true }] },
  { key: "internal-cost", tableId: "tbl8JdWLLwlPFuoF", name: "內業成本單", columns: [{ name: "工作日期", id: "fldNI9iVge", date: true }, { name: "填報人", id: "fldWnwDWp0", link: true }] },
];
export const yupaiProfile = (key: string) => YUPAI_PROFILES.find((p) => `yupai-v3-${p.key}` === key);
export function resolveYupaiFields(profile: YupaiProfile, fields: FieldMeta[]) {
  return profile.columns.map((column) => {
    const field = fields.find((f) => f.id === column.id) ?? fields.find((f) => f.name === column.name);
    if (!field) throw new Error("YUPAI_REQUIRED_FIELD");
    return { column, field };
  });
}
const unwrap = (v: unknown): unknown => v && typeof v === "object" && !Array.isArray(v) && "value" in v ? unwrap((v as { value: unknown }).value) : v;
function cellText(raw: unknown): string {
  const v = unwrap(raw);
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(cellText).join("");
  if (typeof v === "object") return cellText((v as { text?: unknown; name?: unknown }).text ?? (v as { name?: unknown }).name);
  return String(v);
}
function ids(raw: unknown): string[] {
  const v = unwrap(raw);
  if (!v) return [];
  if (Array.isArray(v)) return v.flatMap(ids);
  if (typeof v === "string") return [v];
  if (typeof v !== "object") throw new Error("YUPAI_LINK_SHAPE");
  const o = v as { link_record_ids?: unknown; record_ids?: unknown; record_id?: string; id?: string };
  if (o.link_record_ids || o.record_ids) return ids(o.link_record_ids ?? o.record_ids);
  if (o.record_id || o.id) return [String(o.record_id ?? o.id)];
  throw new Error("YUPAI_LINK_SHAPE");
}
export interface YupaiPage {
  items?: { record_id: string; fields: Record<string, unknown> }[];
  has_more: boolean;
  page_token?: string;
  total?: number;
}
// Isolated reader: all pages must succeed. No title lookups, automatic fields, or stale fallback.
export async function readYupaiTable(profile: YupaiProfile, all: FieldMeta[], fetchPage: (fieldNames: string[], token?: string) => Promise<YupaiPage>, maxRecords = 20000): Promise<TableData> {
  const resolved = resolveYupaiFields(profile, all);
  const records: TableData["records"] = [];
  const tokens = new Set<string>(), seen = new Set<string>();
  let token: string | undefined, total: number | undefined;
  do {
    const page = await fetchPage(resolved.map((r) => r.field.name), token);
    if (typeof page.has_more !== "boolean") throw new Error("YUPAI_PAGE_SHAPE");
    const items = page.items ?? [];
    if (page.total !== undefined) {
      if (!Number.isInteger(page.total) || page.total < 0 || (total !== undefined && total !== page.total)) throw new Error("YUPAI_TOTAL_CHANGED");
      total = page.total;
    }
    for (const item of items) {
      if (!item.record_id || seen.has(item.record_id)) throw new Error("YUPAI_DUPLICATE_RECORD");
      seen.add(item.record_id);
      const fields: Record<string, CellValue> = {}, links: Record<string, string[]> = {};
      for (const { column: c, field: f } of resolved) {
        const raw = item.fields[f.name];
        if (c.link) { links[c.name] = ids(raw); fields[c.name] = links[c.name]; }
        else fields[c.name] = c.date ? normalizeWorkDate(unwrap(raw)) : c.checkbox ? raw === true : cellText(raw);
      }
      records.push({ id: item.record_id, fields, ...(Object.keys(links).length ? { links } : {}) });
    }
    if (records.length > maxRecords || (page.has_more && records.length >= maxRecords)) throw new Error("YUPAI_RECORD_LIMIT");
    if (page.has_more && (!items.length || !page.page_token || tokens.has(page.page_token))) throw new Error("YUPAI_INCOMPLETE_PAGE");
    token = page.has_more ? page.page_token : undefined;
    if (token) tokens.add(token);
  } while (token);
  if (total !== undefined && total !== records.length) throw new Error("YUPAI_TOTAL_MISMATCH");
  return {
    table: { id: profile.tableId, name: profile.name },
    fields: resolved.map(({ column: c, field: f }) => ({ ...f, name: c.name, kind: c.date ? "text" : c.checkbox ? "checkbox" : f.kind })),
    records, complete: true, total: records.length, sourceTotal: total ?? records.length, source: "lark", fetchedAt: Date.now(),
  };
}
