"use client";
import { useMemo, useState } from "react";
import type { CellValue, FieldMeta, TableData } from "@/lib/types";
import { formatDate } from "@/lib/week";

const PAGE = 30;

function display(v: CellValue, f: FieldMeta): string {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.join("、");
  if (f.kind === "date" && typeof v === "number") return formatDate(v);
  if (typeof v === "boolean") return v ? "✓" : "";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return String(v);
}

// Mobile view: one card per record with the key columns; tap to see every field.
export default function RecordCards({ fields, allFields, records, query }: { fields: FieldMeta[]; allFields: FieldMeta[]; records: TableData["records"]; query: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const rows = useMemo(() => {
    if (!query) return records;
    const needle = query.toLowerCase();
    return records.filter((r) => allFields.some((f) => display(r.fields[f.name], f).toLowerCase().includes(needle)));
  }, [records, allFields, query]);

  const [title, ...rest] = fields;
  return (
    <div className="cards">
      {rows.slice(0, limit).map((r) => {
        const expanded = open === r.id;
        const shown = expanded ? allFields.filter((f) => f !== title && display(r.fields[f.name], f)) : rest.slice(0, 6);
        return (
          <button key={r.id} className={`rec ${expanded ? "open" : ""}`} onClick={() => setOpen(expanded ? null : r.id)} aria-expanded={expanded}>
            <div className="rec-title">{title ? display(r.fields[title.name], title) || "（未命名）" : r.id}</div>
            <dl>
              {shown.map((f) => (
                <div key={f.id}>
                  <dt>{f.name}</dt>
                  <dd>{display(r.fields[f.name], f) || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="rec-more">{expanded ? "收合" : "點開看全部欄位"}</div>
          </button>
        );
      })}
      <div className="table-foot">
        {query ? `搜尋結果 ${rows.length} 筆` : `共 ${rows.length} 筆`}
        {rows.length > limit && (
          <button className="btn ghost small" onClick={() => setLimit((l) => l + PAGE)}>
            再顯示 {Math.min(PAGE, rows.length - limit)} 筆
          </button>
        )}
      </div>
    </div>
  );
}
