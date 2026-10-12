import type { CellValue, FieldMeta } from "./types";
import { formatDate } from "./week";

function cell(v: CellValue, f: FieldMeta): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join("、");
  if (f.kind === "date" && typeof v === "number") return formatDate(v);
  return String(v);
}

// Quote, and neutralise spreadsheet formula injection (=, +, -, @ prefixes).
function escape(s: string): string {
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(fields: FieldMeta[], records: { id: string; fields: Record<string, CellValue> }[], meta: string[]): string {
  const lines = meta.map((m) => escape(`# ${m}`));
  lines.push(["record_id", ...fields.map((f) => f.name)].map(escape).join(","));
  for (const r of records) lines.push([r.id, ...fields.map((f) => cell(r.fields[f.name], f))].map(escape).join(","));
  return "﻿" + lines.join("\r\n");
}

export function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
