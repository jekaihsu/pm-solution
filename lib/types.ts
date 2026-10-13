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
  // links: link 欄位 → 被關聯記錄的 record_id（fields 裡是轉成主欄位文字後的名稱）。
  // 只在 /api/sources?links=1 時回傳，且只含被投影的欄位。
  records: { id: string; fields: Record<string, CellValue>; links?: Record<string, string[]> }[];
  fetchedAt: number;
  source: "lark" | "demo";
  complete: boolean; // false when paging stopped early
  total: number; // records served (after any inclusion rule)
  sourceTotal?: number; // records in the Lark table/view before the inclusion rule
  excluded?: number; // records dropped by the inclusion rule
  stale?: boolean; // served from the last good snapshot after a failed refresh
  error?: string;
}
