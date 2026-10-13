export type FieldKind = "text" | "number" | "select" | "multiselect" | "date" | "checkbox" | "person";

export type CellValue = string | number | boolean | string[] | null;

export interface FieldMeta {
  id: string;
  name: string;
  kind: FieldKind;
  primary: boolean;
  rawType?: number; // Lark field type code
  linkTable?: string; // target table for link fields
}

export interface TableMeta {
  id: string;
  name: string;
}

export interface TableData {
  table: TableMeta;
  fields: FieldMeta[];
  // `links`: for link fields only, the linked records' record_ids, index-aligned with the
  // titles that `fields[name]` holds after resolveLinks (R02 以人為單位 needs the ids to join
  // on 人員 record_id). Optional, absent when the table has no link cells or in demo data.
  // Returned by /api/sources only with links=1, and only for the projected fields.
  // `people`: for person (人員) fields only, the {id (open_id), name} pairs, index-aligned with the
  // names that `fields[name]` holds. R04 加班 needs the open_id to map 發起人 (fallback 加班人) → 人員名單 → 所屬組別.
  // Returned by /api/sources only with people=1 and only for HR-restricted sources; absent otherwise.
  records: { id: string; fields: Record<string, CellValue>; links?: Record<string, string[]>; people?: Record<string, { id: string; name: string }[]> }[];
  fetchedAt: number;
  source: "lark" | "demo";
  complete: boolean; // false when paging stopped early
  total: number; // records served (after any inclusion rule)
  sourceTotal?: number; // records in the Lark table/view before the inclusion rule
  excluded?: number; // records dropped by the inclusion rule
  noCreatedTime?: number; // rows returned without a creation time
  newestCreated?: number; // newest creation time seen (epoch ms)
  stale?: boolean; // served from the last good snapshot after a failed refresh
  error?: string;
}
