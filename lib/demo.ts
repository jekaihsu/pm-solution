// Fictional sample data, only served when the viewer explicitly switches to demo
// mode. Every record id is prefixed "demo_" and the payload is marked source="demo".
import type { CellValue, FieldKind, TableData } from "./types";
import type { SourceDef } from "./reports";

type Gen = (r: () => number, i: number) => CellValue;
type Spec = [name: string, kind: FieldKind, gen: Gen][];

const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)];
const day = 86400000;
const weekStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); // last Monday
  return d.getTime();
};
// Spread over the last ~8 weeks so trends and week-over-week deltas have data.
const inWeeks = (r: () => number) => weekStart() - 49 * day + Math.floor(r() * 63) * day;

const groups = ["外業一組", "外業二組", "外業三組", "外業四組"];
const projects = ["P-2601", "P-2602", "P-2603", "P-2604", "P-2605", "P-2606"];
const items = ["地形測量", "控制測量", "放樣", "地籍調查"];

const SPECS: Record<string, { n: number; spec: Spec }> = {
  "field-work": {
    n: 220,
    spec: [
      ["工作單號", "text", (_, i) => `W-${1000 + i}`],
      ["工程編號", "select", (r) => pick(r, projects)],
      ["組別", "select", (r) => pick(r, groups)],
      ["工作項目", "select", (r) => pick(r, items)],
      ["出工日", "date", (r) => inWeeks(r)],
      ["數量", "number", (r) => Math.round(r() * 20 * 10) / 10],
      ["點數", "number", (r) => Math.round(r() * 8 * 10) / 10],
      ["檢核狀態", "select", (r) => pick(r, ["已檢核", "已檢核", "待檢核", "退回"])],
    ],
  },
  schedule: {
    n: 30,
    spec: [
      ["工程編號", "select", (r) => pick(r, projects)],
      ["組別", "select", (r) => pick(r, groups)],
      ["工作項目", "select", (r) => pick(r, items)],
      ["預排開始日", "date", (r) => inWeeks(r)],
      ["預排點數", "number", (r) => Math.round(r() * 10 * 10) / 10],
    ],
  },
  receivables: {
    n: 12,
    spec: [
      ["工程編號", "select", (r) => pick(r, projects)],
      ["請款期別", "text", (r) => `第 ${1 + Math.floor(r() * 3)} 期`],
      ["請款日", "date", (r) => inWeeks(r)],
      ["請款金額", "number", (r) => Math.round(50000 + r() * 400000)],
      ["狀態", "select", (r) => pick(r, ["可請款", "已請款", "已入帳"])],
    ],
  },
  equipment: {
    n: 8,
    spec: [
      ["設備名稱", "text", (_, i) => `儀器 ${i + 1}`],
      ["種類", "select", (r) => pick(r, ["全站儀", "GNSS", "水準儀", "車輛"])],
      ["狀態", "select", (r) => pick(r, ["可用", "可用", "送修", "停用"])],
      ["日租金", "number", (r) => (r() > 0.3 ? Math.round(500 + r() * 3000) : null)],
    ],
  },
  quotes: {
    n: 15,
    spec: [
      ["報價編號", "text", (_, i) => `Q-${300 + i}`],
      ["案名", "text", (r) => `${pick(r, ["新北", "桃園", "台中"])}${pick(r, items)}案`],
      ["報價日", "date", (r) => inWeeks(r) - 30 * day],
      ["報價金額", "number", (r) => Math.round(80000 + r() * 900000)],
      ["狀態", "select", (r) => pick(r, ["報價中", "已回傳", "已成交", "未成交"])],
    ],
  },
  "owner-contacts": {
    n: 10,
    spec: [
      ["業主", "text", (_, i) => `業主 ${String.fromCharCode(65 + i)}`],
      ["工程編號", "select", (r) => pick(r, projects)],
      ["聯絡窗口職稱", "select", (r) => pick(r, ["承辦", "主任", "經理"])],
    ],
  },
};

const specKey = (key: string) => key.replace(/^v[34]-/, "");

export function hasDemo(key: string) {
  return specKey(key) in SPECS;
}

export function demoSourceData(src: SourceDef): TableData {
  const def = SPECS[specKey(src.key)];
  let seed = [...src.key].reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const records = Array.from({ length: def.n }, (_, i) => ({
    id: `demo_${src.key}_${i}`,
    fields: Object.fromEntries(def.spec.map(([name, , gen]) => [name, gen(r, i)])),
  }));
  return {
    table: { id: `demo_${src.key}`, name: `${src.name}（示範）` },
    fields: def.spec.map(([name, kind], i) => ({ id: `f${i}`, name, kind, primary: i === 0 })),
    records,
    fetchedAt: Date.now(),
    source: "demo",
    complete: true,
    total: records.length,
  };
}
