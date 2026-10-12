// Sample data used when Lark credentials are not configured, so the dashboard
// can be previewed (e.g. on a fresh Zeabur deploy) before wiring up a Base.
import type { TableData, TableMeta } from "./types";

export const DEMO_TABLES: TableMeta[] = [{ id: "demo_tasks", name: "專案任務（示範資料）" }];

const projects = ["官網改版", "App 2.0", "CRM 導入", "數據平台"];
const statuses = ["待處理", "進行中", "審核中", "已完成"];
const owners = ["Alice", "Ben", "Cathy", "David", "Eva"];
const priorities = ["高", "中", "低"];
const tags = ["前端", "後端", "設計", "QA", "文件"];

// Deterministic pseudo-random so the demo looks the same on every refresh.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function demoTableData(): TableData {
  const rand = rng(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const start = Date.UTC(2026, 3, 1);
  const day = 86400000;

  const records = Array.from({ length: 160 }, (_, i) => {
    const status = pick(statuses);
    const estimate = Math.round((2 + rand() * 30) * 10) / 10;
    return {
      id: `rec${i}`,
      fields: {
        任務名稱: `任務 #${i + 1}`,
        專案: pick(projects),
        狀態: status,
        負責人: [pick(owners)],
        優先級: pick(priorities),
        標籤: Array.from(new Set([pick(tags), pick(tags)])),
        預估工時: estimate,
        實際工時: status === "待處理" ? 0 : Math.round(estimate * (0.6 + rand() * 0.9) * 10) / 10,
        預算: Math.round(5000 + rand() * 45000),
        開始日期: start + Math.floor(rand() * 180) * day,
        已驗收: status === "已完成" && rand() > 0.3,
      },
    };
  });

  return {
    table: DEMO_TABLES[0],
    fields: [
      { id: "f1", name: "任務名稱", kind: "text", primary: true },
      { id: "f2", name: "專案", kind: "select", primary: false },
      { id: "f3", name: "狀態", kind: "select", primary: false },
      { id: "f4", name: "負責人", kind: "person", primary: false },
      { id: "f5", name: "優先級", kind: "select", primary: false },
      { id: "f6", name: "標籤", kind: "multiselect", primary: false },
      { id: "f7", name: "預估工時", kind: "number", primary: false },
      { id: "f8", name: "實際工時", kind: "number", primary: false },
      { id: "f9", name: "預算", kind: "number", primary: false },
      { id: "f10", name: "開始日期", kind: "date", primary: false },
      { id: "f11", name: "已驗收", kind: "checkbox", primary: false },
    ],
    records,
    fetchedAt: Date.now(),
    source: "demo",
  };
}
