import type { CellValue, TableData } from "./types";

type RecordRow = TableData["records"][number];
const value = (v: CellValue | undefined) => Array.isArray(v) ? v.join("、") : String(v ?? "").trim();
// Keep this normalization aligned with buildInternalScheduleExecution's engineering keys.
const codeOf = (s: string) => {
  const match = s.trim().match(/([A-Z]\d{6}|\b1\d{5}\b)/i);
  return match ? (match[1].toUpperCase() === "C000000" ? "" : match[1].toUpperCase()) : s.trim();
};
const scheduleFields = ["案件", "案件編號", "工程編號", "備註"];
const workFields = ["所屬案件", "案件編號", "工程編號", "可能的確認單工編(若暫無確認單才需填寫)", "備註工編淨", "原所屬案件", "對應合約明細"];

/** Resolve case links against the matching version's case table; ambiguous names stay blank. */
export function prepareR02Cases(cases: TableData | undefined, schedule: RecordRow[], work: RecordRow[], window?: { start: number; end: number; startField: string; endField: string }) {
  const byId = new Map<string, { code: string; name: string }>();
  const names = new Map<string, Set<string>>();
  for (const row of cases?.records ?? []) {
    const f = row.fields;
    const code = codeOf(value(f["工程編號"]) || value(f["案件編號"]) || value(f["工編淨"]) || value(f["工程確認單編號"]));
    const name = value(f["工程名稱"]) || value(f["案件名稱"]);
    if (!code) continue;
    byId.set(row.id, { code, name });
    if (name) { const set = names.get(code) ?? new Set<string>(); set.add(name); names.set(code, set); }
  }
  const caseNameByCode = new Map<string, string>();
  for (const [code, set] of names) caseNameByCode.set(code, set.size === 1 ? [...set][0] : "");
  const linkedScheduleNames = new Map<string, Set<string>>();
  const normalize = (row: RecordRow, fields: string[], isSchedule = false) => {
    for (const field of fields) {
      if (row.fields[field] == null || value(row.fields[field]) === "") continue;
      const ids = row.links?.[field] ?? [];
      const linked = ids.length === 1 ? byId.get(ids[0]) : undefined;
      const raw = value(row.fields[field]);
      const code = linked?.code || codeOf(raw);
      if (!caseNameByCode.has(code)) caseNameByCode.set(code, "");
      const start = window ? Number(row.fields[window.startField]) : NaN;
      const end = window ? Number(row.fields[window.endField]) || start : NaN;
      if (isSchedule && linked?.name && (!window || (start < window.end && end >= window.start))) {
        const set = linkedScheduleNames.get(code) ?? new Set<string>(); set.add(linked.name); linkedScheduleNames.set(code, set);
      }
      return linked ? { ...row, fields: { ...row.fields, [field]: linked.code } } : row;
    }
    return row;
  };
  const normalizedSchedule = schedule.map(r => normalize(r, scheduleFields, true));
  const normalizedWork = work.map(r => normalize(r, workFields));
  for (const [code, set] of linkedScheduleNames) caseNameByCode.set(code, [...set].join("、"));
  return { schedule: normalizedSchedule, work: normalizedWork, caseNameByCode };
}
