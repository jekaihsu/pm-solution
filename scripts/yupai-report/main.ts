// 「預排核對報告」產生器 CLI。
//   npm run yupai:report                       # 預設區間，抓資料 + 覆寫雲端 Docx（需 --doc-id）
//   npm run yupai:report -- --dry-run           # 只在本地產出 report.md，不碰雲端
//   npm run yupai:report -- --no-pull           # 用 data/ 既有快取，不重新抓
//   npm run yupai:report -- --doc-id VCAgdgGFooejQ9xqiHZjaCGhpIe   # 覆寫既有 Docx 全文
// 唯讀 Lark；唯一寫入是以 Markdown 覆寫指定 Docx（或建立新 Docx）。不發送任何訊息。
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";
import { analyze } from "../../lib/yupaiCompliance";
import { YUPAI_REPORT_DOC_ID } from "../../lib/yupaiReport";
import { loadData } from "./load";
import { buildReport, summaryLines } from "./render";
import { buildSpotlight } from "./spotlight";
import { pullAll, recordHistory, runCli } from "./pull";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(HERE, "data");

interface Args {
  start: string;
  end: string;
  today: string | null;
  dryRun: boolean;
  noPull: boolean;
  title: string | null;
  docId: string | null;
  dataDir: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { start: "2026-10-12", end: "2026-10-20", today: null, dryRun: false, noPull: false, title: null, docId: null, dataDir: DEFAULT_DATA_DIR };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === "--start") a.start = next();
    else if (k === "--end") a.end = next();
    else if (k === "--today") a.today = next();
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--no-pull") a.noPull = true;
    else if (k === "--title") a.title = next();
    else if (k === "--doc-id") a.docId = next();
    else if (k === "--data-dir") a.dataDir = next();
    else throw new Error(`未知參數：${k}`);
  }
  return a;
}

function overwriteDocx(docId: string, mdPath: string) {
  const { code, out, err } = runCli(["docs", "+update", "--as", "user", "--doc", docId, "--command", "overwrite", "--doc-format", "markdown", "--content", "@" + mdPath]);
  if (code !== 0) throw new Error(`docs +update overwrite 失敗：${err || out}`);
}

function createDocx(title: string, mdPath: string): string {
  const { code, out, err } = runCli(["docs", "+create", "--as", "user", "--doc-format", "markdown", "--title", title, "--parent-position", "my_library", "--content", "@" + mdPath]);
  if (code !== 0) throw new Error(`docs +create 失敗：${err || out}`);
  const resp = JSON.parse(out);
  const data = resp.data ?? resp;
  const doc = data.document ?? data;
  const token = doc.document_id ?? doc.objToken ?? doc.token;
  return doc.url ?? (token ? `https://feishu.cn/docx/${token}` : "(unknown)");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const today = args.today ?? args.end;

  let leaveSource: "api" | "base" = "base";
  if (args.noPull) console.log("使用既有快取 (--no-pull)。");
  else leaveSource = pullAll(args.dataDir, args.start, args.end);

  const data = loadData(args.dataDir);
  const { an, result } = analyze(data, { start: args.start, end: args.end, today });
  // 乾跑／對帳不連 Lark：spotlight 的紀錄歷史用空 fetcher 降級；正式執行才查歷史。
  const fetcher = args.dryRun ? () => [] : recordHistory;
  const spotlightMd = buildSpotlight(an, data, fetcher);
  const md = buildReport(an, result, { leaveSource, spotlightMd });

  const reportPath = join(args.dataDir, "report.md");
  writeFileSync(reportPath, md);
  console.log(`已寫出 ${reportPath}（${md.length} 字元）`);
  console.log("統計：", JSON.stringify({ ...result.stats, byDiv: result.stats.byDiv }));

  const title = args.title ?? `預排vs日誌合規報告 ${args.start.replace(/-/g, "/")}-${args.end.slice(5).replace("-", "/")}`;
  if (args.dryRun) {
    console.log("--dry-run：未建立/覆寫 Docx。");
    return;
  }

  let url: string;
  const docId = args.docId ?? YUPAI_REPORT_DOC_ID;
  if (docId) {
    overwriteDocx(docId, reportPath);
    url = docId;
    console.log(`✅ Docx 已覆寫：${docId}`);
  } else {
    url = createDocx(title, reportPath);
    console.log(`✅ Docx 已建立：${url}`);
  }
  const resultLines = ["# 執行結果", "", `- **Docx**：${url}`, `- **標題**：${title}`, `- **區間**：${args.start} ~ ${args.end}（平日）`, `- **假勤來源**：${leaveSource === "api" ? "Lark 出勤 API" : "薪水計算 Base（每日考勤明細＋詠翔請假）"}`, "", "## 重點數字", ...summaryLines(result).map((l) => `- ${l}`)];
  writeFileSync(join(args.dataDir, "result.md"), resultLines.join("\n") + "\n");
  console.log("已寫出 result.md");
}

main();
