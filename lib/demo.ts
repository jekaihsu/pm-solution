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

const DEMO_GEAR: [string, string, string, string][] = [
  ["全站儀 TS-01", "EQ-001", "全站儀", "自有"],
  ["全站儀 TS-02", "EQ-002", "全站儀", "月租"],
  ["GNSS R10-A", "EQ-003", "GNSS", "月租"],
  ["GNSS R10-B", "EQ-004", "GNSS", "自有"],
  ["水準儀 DL-01", "EQ-005", "水準儀", "月租"],
  ["掃描儀 RTC-1", "EQ-006", "掃描儀", "月租"],
  ["全站儀 TS-03", "EQ-007", "全站儀", "自有"],
  ["GNSS R12", "EQ-008", "GNSS", "月租"],
  ["水準儀 DL-02", "EQ-009", "水準儀", "自有"],
  ["測距儀 LD-1", "EQ-010", "測距儀", "自有"],
  ["工程車 ABC-1234", "CAR-01", "車輛", "公司車"],
  ["工程車 BCD-2345", "CAR-02", "車輛", "公司車"],
  ["工程車 CDE-3456", "CAR-03", "車輛", "月租"],
  ["工程車 DEF-4567", "CAR-04", "車輛", "公司車"],
];
const groups = ["外業一組", "外業二組", "外業三組", "外業四組"];
const projects = ["P-2601", "P-2602", "P-2603", "P-2604", "P-2605", "P-2606"];
const items = ["地形測量", "控制測量", "放樣", "地籍調查"];
const innerGroups = ["圖資A", "圖資B", "報告組"];
const adminPeople = ["陳怡君", "林雅婷", "張雅惠", "黃淑芬"]; // 虛構
const adminItems = ["公文收發", "請款作業", "採購對帳", "文件歸檔", "出差申請"];
const innerItems = ["數值地形圖", "縱橫斷面", "成果報告", "點位清冊"];

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
      ["控制組檢核", "select", (r) => pick(r, ["通過", "通過", "通過", "不通過", null])],
      ["⚠營業額異常", "checkbox", (r) => r() > 0.92],
      ["出工人", "multiselect", (r) => [pick(r, ["王小明", "陳大文", "林志強", "張家豪", "李俊傑", "黃建宏"])]],
      ["修改後數量", "number", (r) => (r() > 0.88 ? Math.round(r() * 20 * 10) / 10 : null)],
      ["備註", "text", (r) => (r() > 0.6 ? pick(r, ["業主臨時追加點位", "下雨提早收工", "控制點遺失，重新補設", "儀器校正延誤 1 小時", "數量已與業主確認"]) : null)],
      ["退回原因", "text", (r) => (r() > 0.9 ? pick(r, ["數量與照片不符", "工項選錯"]) : null)],
      ["是否違反SOP", "select", (r) => (r() > 0.25 ? (r() > 0.88 ? "是" : "否") : null)],
      ["修改後營業額", "number", (r) => (r() > 0.9 ? Math.round(r() * 8 * 10) / 10 : null)],
    ],
  },
  schedule: {
    n: 120,
    spec: [
      ["工程編號", "select", (r) => pick(r, projects)],
      ["業別", "select", (_, i) => (i % 7 === 0 ? "行政" : i % 3 === 0 ? "內業" : "外業")],
      ["組別", "select", (r, i) => (i % 7 === 0 ? "行政" : pick(r, i % 3 === 0 ? innerGroups : groups))],
      ["人員", "multiselect", (r, i) => (i % 7 === 0 ? (r() > 0.7 ? [pick(r, adminPeople), pick(r, adminPeople)] : [pick(r, adminPeople)]) : null)],
      ["預估營業額點數", "number", () => null],
      ["工作項目", "select", (r) => pick(r, items)],
      ["開始日期", "date", (r) => inWeeks(r)],
      ["結束日期", "date", () => null],
      ["預排點數", "number", (r) => (r() > 0.5 ? Math.round(r() * 3 * 10) / 10 : null)],
    ],
  },
  "internal-cost": {
    n: 60,
    spec: [
      ["單號", "text", (_, i) => `IC-${i}`],
      ["工作日期", "date", (r) => inWeeks(r)],
      ["內業組別", "select", (r) => pick(r, innerGroups)],
      ["填報人", "select", (r) => pick(r, ["王小明", "李小華", "陳大文", "林美玲"])],
      ["是否加班", "checkbox", (r) => r() > 0.7],
      ["加班時數", "number", (r) => (r() > 0.5 ? Math.round(r() * 4 * 2) / 2 : null)],
      ["加班類型", "select", (r) => pick(r, ["平日加班", "假日加班", null])],
    ],
  },
  "field-cost": {
    n: 80,
    spec: [
      ["單號", "text", (_, i) => `FC-${i}`],
      ["工作日期", "date", (r) => inWeeks(r)],
      ["組別", "select", (r) => pick(r, groups)],
      ["填報人", "select", (r) => pick(r, ["張志強", "黃建國", "吳家豪", "劉俊傑"])],
      ["是否加班", "checkbox", (r) => r() > 0.6],
      ["加班時數", "number", (r) => (r() > 0.4 ? Math.round(r() * 5 * 2) / 2 : null)],
      ["加班類型", "select", (r) => pick(r, ["平日加班", "假日加班", "夜測"])],
      ["是否過夜", "checkbox", (r) => r() > 0.85],
    ],
  },
  "internal-work": {
    n: 200,
    spec: [
      ["工作單號", "text", (_, i) => `IW-${2000 + i}`],
      ["所屬成本單", "multiselect", (r) => [`IC-${Math.floor(r() * 60)}`]],
      ["所屬案件", "select", (r) => pick(r, ["新北地形案", "桃園地籍案", "台中放樣案", "高雄控制案"])],
      ["案件編號", "select", (r) => pick(r, projects)],
      ["內業工項", "select", (r) => pick(r, innerItems)],
      ["計價數量", "number", (r) => Math.round(r() * 12 * 10) / 10],
      ["營業額點數", "number", (r) => Math.round(r() * 3 * 10) / 10],
      ["雅雯檢核", "select", (r) => pick(r, ["通過", "通過", "通過", "不通過", null])],
      ["⚠負值", "checkbox", (r) => r() > 0.95],
    ],
  },
  "admin-cost": {
    n: 30,
    spec: [
      ["單號", "text", (_, i) => `AC-${i}`],
      ["工作日期", "date", (r) => inWeeks(r)],
      ["填表人", "multiselect", (r) => [pick(r, adminPeople)]],
      ["工作單列", "multiselect", () => null],
      ["是否加班", "checkbox", (r) => r() > 0.8],
      ["加班時數", "number", (r) => (r() > 0.8 ? Math.round(r() * 3 * 2) / 2 : null)],
    ],
  },
  "admin-work": {
    n: 90,
    spec: [
      ["工作單號", "text", (_, i) => `AW-${3000 + i}`],
      ["所屬成本單", "multiselect", (r) => [`AC-${Math.floor(r() * 30)}`]],
      ["行政工項", "multiselect", (r) => [pick(r, adminItems)]],
      ["件數", "number", (r) => Math.ceil(r() * 5)],
      ["最終營業額點數", "number", (r) => Math.round(r() * 0.4 * 100) / 100],
      ["備註", "text", (r) => (r() > 0.85 ? "示範備註" : null)],
      ["⚠工項與件數", "text", (r) => (r() > 0.93 ? "件數異常" : "")],
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
  "equipment-system": {
    n: 14,
    spec: [
      ["儀器名稱", "text", (_, i) => DEMO_GEAR[i][0]],
      ["儀器編號", "text", (_, i) => DEMO_GEAR[i][1]],
      ["種類", "select", (_, i) => DEMO_GEAR[i][2]],
      ["租賃方式", "select", (_, i) => DEMO_GEAR[i][3]],
      ["狀態", "select", (r) => pick(r, ["可用", "可用", "可用", "可用", "使用中", "使用中", "送修", "停用"])],
      ["保管組別", "select", (r) => pick(r, groups)],
    ],
  },
  "equipment-inspection": {
    n: 18,
    spec: [
      ["檢查對象", "select", (_, i) => DEMO_GEAR.filter((g) => g[3] === "月租" || g[2] === "車輛")[i % 8][0]],
      ["檢查日期", "date", (r) => inWeeks(r)],
      ["檢查結果", "select", (r) => pick(r, ["正常", "正常", "正常", "異常"])],
      ["檢查人", "select", (r) => pick(r, ["王小明", "陳大文", "林志強"])],
      ["備註", "text", (r) => (r() > 0.75 ? pick(r, ["腳架鬆動已鎖緊", "車內雜物已清", "電池老化，申請更換"]) : null)],
    ],
  },
  "equipment-calibration": {
    n: 20,
    spec: [
      ["儀器", "select", (_, i) => DEMO_GEAR[i % 10][0]],
      ["校驗類型", "select", (_, i) => (i < 10 ? "TAF" : "自校")],
      ["校驗日期", "date", (r) => Date.now() - Math.round(30 + r() * 330) * day],
      ["有效期限", "date", (r, i) => (i < 10 ? Date.now() + Math.round(-20 + r() * 200) * day : null)],
      ["結果", "select", (r) => pick(r, ["合格", "合格", "合格", "不合格"])],
      ["證書編號", "text", (_, i) => (i < 10 ? `TAF-${2600 + i}` : null)],
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
  "salary-overtime": {
    n: 36,
    spec: [
      ["姓名", "text", (_, i) => ["王小明", "陳大文", "林志強", "張家豪", "李俊傑", "黃建宏"][i % 6]],
      ["組別", "select", (_, i) => groups[i % 4]],
      ["月份", "text", (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - Math.floor(i / 6)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }],
      ["平日加班時數", "number", (r) => Math.round(r() * 16 * 2) / 2],
      ["假日加班時數", "number", (r) => (r() > 0.5 ? Math.round(r() * 12 * 2) / 2 : 0)],
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

// R11 reads the schedule by field id; give the demo schedule the same ids.
const DEMO_FID: Record<string, string> = { 人員: "fld7KNCsVe", 業別: "fldrENe4H6", 開始日期: "fldMXOggGP", 結束日期: "fldjWv1xST", 預估營業額點數: "fld5lTSN1r" };
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
    fields: def.spec.map(([name, kind], i) => ({ id: DEMO_FID[name] && specKey(src.key) === "schedule" ? DEMO_FID[name] : `f${i}`, name, kind, primary: i === 0 })),
    records,
    fetchedAt: Date.now(),
    source: "demo",
    complete: true,
    total: records.length,
  };
}
