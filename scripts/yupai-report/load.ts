// 讀取 lark-cli 產出的 ndjson 快取成 YupaiData（純讀檔，不連 Lark）。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawRecord, YupaiData } from "../../lib/yupaiCompliance";

export function loadNdjson(path: string): RawRecord[] {
  const out: RawRecord[] = [];
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return out; // 檔案不存在時回空陣列（例如某張表這次沒抓）。
  }
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t) out.push(JSON.parse(t) as RawRecord);
  }
  return out;
}

// 預設檔名與 generate.py / pull.ts 一致。
export function loadData(dataDir: string): YupaiData {
  const f = (name: string) => loadNdjson(join(dataDir, name));
  return {
    roster: f("roster.ndjson"),
    preschedule: f("preschedule_all.ndjson"),
    waiye: f("waiye.ndjson"),
    neiye: f("neiye.ndjson"),
    xingzheng: f("xingzheng.ndjson"),
    attendance: f("attendance_oct.ndjson"),
    leave: f("leave_oct.ndjson"),
  };
}
