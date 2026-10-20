import type { TableData } from "./types";
import { yupaiProfile } from "./yupaiSource";
import { dateRange } from "./workDate";
export const YUPAI_DEMO_PEOPLE = [
  { id: "yupai_demo_a", name: "外業示範甲", group: "水深C" },
  { id: "yupai_demo_b", name: "外業示範乙", group: "水深C" },
  { id: "yupai_demo_c", name: "內業示範甲", group: "控制" },
  { id: "yupai_demo_d", name: "PM示範甲", group: "PM" },
  { id: "yupai_demo_admin", name: "劉芳君", group: "行政" },
];
export function yupaiDemo(key: string): TableData {
  const p = yupaiProfile(key)!;
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const before = new Date(Date.parse(today) - 35 * 86400000).toISOString().slice(0, 10);
  const after = new Date(Date.parse(today) + 35 * 86400000).toISOString().slice(0, 10);
  const records: TableData["records"] = [];
  const add = (fields: TableData["records"][number]["fields"], links?: Record<string, string[]>) => records.push({ id: `demo_${p.key}_${records.length}`, fields, ...(links ? { links } : {}) });
  if (p.key === "people") for (const person of YUPAI_DEMO_PEOPLE) records.push({ id: person.id, fields: { 姓名: person.name, 所屬組別: person.group, 在職: true } });
  else for (const day of dateRange(before, after)) {
    if ([0, 6].includes(new Date(day).getUTCDay())) continue;
    const i = new Date(day).getUTCDate();
    if (p.key === "schedule") {
      for (const who of YUPAI_DEMO_PEOPLE.slice(0, 4).filter((_, n) => n !== 1 && (n === 0 || i % 2 === 0))) add({ 開始日期: day, 結束日期: day, 人員: [who.id], 條類型: "", 組別: who.group, 業別: who.group === "水深C" ? "外業" : "內業" }, { 人員: [who.id] });
    } else if (p.key === "pm-cost") add({ 工作日期: day, 填表人: ["yupai_demo_d"] }, { 填表人: ["yupai_demo_d"] });
    else if (p.key === "internal-cost") add({ 工作日期: day, 填報人: ["yupai_demo_c"] }, { 填報人: ["yupai_demo_c"] });
    else if (p.key === "field-work" && i % 3 !== 0) add({ "工作日期-薪資": day, 此單出工人: "外業示範甲" });
    else if (p.key === "internal-work") add({ "工作日期-營業額明細": day, 姓名: "內業示範甲" });
    else if (p.key === "admin-work" && day <= today) add({ "工作日期-營業額明細": day, "營業額人員-明細": "劉芳君" });
  }
  return { table: { id: p.tableId, name: `${p.name}（示範）` }, fields: p.columns.map((c) => ({ id: c.id ?? c.name, name: c.name, kind: c.checkbox ? "checkbox" : "text", primary: false })), records, fetchedAt: Date.now(), source: "demo", complete: true, total: records.length };
}
