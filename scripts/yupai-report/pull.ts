// 以 lark-cli（--as user，唯讀）抓取 V3／薪水計算 Base 的資料到 data/*.ndjson。
// 指令與舊版 generate.py 的 pull_all 完全一致；只讀取、不對任何 Base 寫入。
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { V3_BASE } from "./spotlight";

const TBL_ROSTER = "tblmlpA6nG5Ou7NQ";
const TBL_PRE = "tblN8c3WN44233aG";
const TBL_WAI = "tbl97f1uXqi7Qz0k";
const TBL_NEI = "tblTP5Naz52FBpFg";
const TBL_XING = "tbl2c5CLgwPZ3Pl2";

const SAL_BASE = "VwAsbezz9app3YsramgjduLYp2U";
const TBL_ATT = "tblsrN2D99v46m3e";
const TBL_LEAVE = "tblUxMuP87ZmHHZJ";

export interface CliResult {
  code: number;
  out: string;
  err: string;
}
export function runCli(args: string[]): CliResult {
  try {
    const out = execFileSync("lark-cli", args, { encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 });
    return { code: 0, out, err: "" };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: err.stdout ?? "", err: err.stderr ?? String(e) };
  }
}

function pullRecords(dataDir: string, base: string, table: string, fields: string[], outName: string, filterJson?: string): string {
  const path = join(dataDir, outName);
  const args = ["base", "+record-list", "--as", "user", "--base-token", base, "--table-id", table, "--format", "ndjson", "--output", path, "--overwrite"];
  for (const f of fields) args.push("--field-id", f);
  if (filterJson) args.push("--filter-json", filterJson);
  const { code, out, err } = runCli(args);
  if (code !== 0) throw new Error(`record-list 失敗 (${table}): ${err || out}`);
  try {
    const manifest = JSON.parse(out);
    if (manifest.has_more) throw new Error(`${outName} has_more=true：資料未完整，停止產出以免低估缺失；請分頁抓取。`);
  } catch (e) {
    if (e instanceof Error && e.message.includes("has_more")) throw e;
    // stdout 非 JSON manifest 時忽略（與 Python 一致）。
  }
  return path;
}

function monthsInRange(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))];
  const [ey, em] = [Number(end.slice(0, 4)), Number(end.slice(5, 7))];
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}`);
    m += 1;
    if (m > 12) ((m = 1), (y += 1));
  }
  return out;
}

// 探測 Lark 出勤 API（user token 通常不支援）。回傳實際採用來源。
export function tryAttendanceApi(): "api" | "base" {
  const { out, err } = runCli([
    "attendance",
    "user_tasks",
    "query",
    "--as",
    "user",
    "--employee-type",
    "employee_id",
    "--data",
    JSON.stringify({ check_date_from: 20260101, check_date_to: 20260102, user_ids: ["ou_7dfe7ce548da22a0275cba0d92b3bfec"] }),
  ]);
  let resp: { ok?: boolean; error?: { message?: string } } = {};
  try {
    resp = JSON.parse(out);
  } catch {
    resp = {};
  }
  if (resp.ok) return "api";
  const msg = resp.error?.message || (err || out).split(/\s+/).join(" ");
  console.log(`  Lark 出勤 API 不可用，改用薪水計算 Base。原因：${msg.slice(0, 120)}`);
  return "base";
}

export function pullAll(dataDir: string, start: string, end: string): "api" | "base" {
  mkdirSync(dataDir, { recursive: true });
  console.log("抓取資料中 (唯讀)…");
  pullRecords(dataDir, V3_BASE, TBL_ROSTER, ["姓名", "在職", "所屬組別", "職級", "同步_OpenID"], "roster.ndjson");
  pullRecords(dataDir, V3_BASE, TBL_PRE, ["開始日期", "結束日期", "人員", "業別", "組別", "條類型"], "preschedule_all.ndjson");
  pullRecords(dataDir, V3_BASE, TBL_WAI, ["出工日期", "此單出工人", "建立者"], "waiye.ndjson");
  pullRecords(dataDir, V3_BASE, TBL_NEI, ["工作日期-營業額明細", "填報時間", "姓名", "建立者"], "neiye.ndjson");
  pullRecords(dataDir, V3_BASE, TBL_XING, ["工作日期-營業額明細", "填寫時間", "營業額人員-明細", "建立者"], "xingzheng.ndjson");

  tryAttendanceApi();
  const leaveSource: "api" | "base" = "base"; // 本產生器實際使用下方 Base 資料。

  const frames: string[] = [];
  for (const m of monthsInRange(start, end)) {
    frames.push(
      pullRecords(
        dataDir,
        SAL_BASE,
        TBL_ATT,
        ["姓名", "日期", "出勤狀態", "核准假別", "請假起始", "請假結束", "請假件數", "應出勤"],
        `attendance_${m}.ndjson`,
        JSON.stringify({ logic: "and", conditions: [["月份", "==", m]] }),
      ),
    );
  }
  const merged = join(dataDir, "attendance_oct.ndjson");
  writeFileSync(merged, frames.map((p) => readFileSync(p, "utf-8")).join(""));

  // 詠翔請假：往前抓 31 天，涵蓋可能跨入區間的假單。
  const buf = new Date(new Date(start + "T00:00:00Z").getTime() - 31 * 86400000).toISOString().slice(0, 10);
  pullRecords(
    dataDir,
    SAL_BASE,
    TBL_LEAVE,
    ["发起人", "开始时间", "结束时间", "假期类型", "申请状态", "折算請假天數"],
    "leave_oct.ndjson",
    JSON.stringify({ logic: "and", conditions: [["开始时间", ">", `ExactDate(${buf})`]] }),
  );
  return leaveSource;
}

// 紀錄歷史（供 spotlight 用）：lark-cli base +record-history-list --as user。
import type { HistoryEvent } from "./spotlight";
const TZ = 8 * 3600000;
const fmtTs = (sec: number): string => new Date(sec * 1000 + TZ).toISOString().slice(0, 19).replace("T", " ");
const operatorStr = (op: unknown): string => (op && typeof op === "object" ? String((op as { name?: string }).name ?? JSON.stringify(op)) : String(op ?? ""));

export function recordHistory(base: string, table: string, recordId: string): HistoryEvent[] {
  const { code, out } = runCli(["base", "+record-history-list", "--as", "user", "--base-token", base, "--table-id", table, "--record-id", recordId]);
  if (code !== 0) return [];
  let items: Record<string, unknown>[];
  try {
    items = JSON.parse(out).data.items as Record<string, unknown>[];
  } catch {
    return [];
  }
  return items
    .slice()
    .sort((a, b) => Number(a.create_time ?? 0) - Number(b.create_time ?? 0))
    .map((it) => ({
      time: fmtTs(Number(it.create_time)),
      type: String(it.activity_type ?? ""),
      operator: operatorStr(it.operator),
      fields: Array.isArray(it.field_changes) ? (it.field_changes as { field_name?: string }[]).map((c) => c.field_name ?? "") : [],
    }));
}
