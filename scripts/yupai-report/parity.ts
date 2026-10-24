// 對帳：同一份快取資料、同一區間（預設 2026-10-12～10-20），分別用
//   (A) 儀表板單一口徑  lib/yupaiCompliance.ts（TS）
//   (B) 獨立的舊版產生器 legacy/generate.py（Python，--dry-run --no-pull）
// 兩套實作各自計算，列出各項計數並確認一致。不連 Lark（讀 data/ 既有快取）。
// 用法：npm run yupai:parity [-- --start 2026-10-12 --end 2026-10-20 --data-dir <dir>]
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../../lib/yupaiCompliance";
import { loadData } from "./load";
import { pullAll } from "./pull";

const HERE = dirname(fileURLToPath(import.meta.url));

interface Args {
  start: string;
  end: string;
  today: string;
  dataDir: string;
}
function parseArgs(argv: string[]): Args {
  const a: Args = { start: "2026-10-12", end: "2026-10-20", today: "2026-10-20", dataDir: join(HERE, "data") };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--start") a.start = argv[++i];
    else if (k === "--end") a.end = argv[++i];
    else if (k === "--today") a.today = argv[++i];
    else if (k === "--data-dir") a.dataDir = argv[++i];
    else throw new Error(`未知參數：${k}`);
  }
  return a;
}

interface Metrics {
  scope: number;
  attention: number;
  clean: number;
  外業: number;
  內業: number;
  業務: number;
  missingLog: number;
  unschedOnly: number;
  zeroPre: number;
}

function runPython(args: Args): Metrics {
  const out = execFileSync("python3", [join(HERE, "legacy", "generate.py"), "--dry-run", "--no-pull", "--start", args.start, "--end", args.end, "--today", args.today], {
    encoding: "utf-8",
    cwd: args.dataDir, // 讓 Python 把 report.md 寫在 gitignore 的 data/ 內，不污染 repo 根目錄
    env: { ...process.env, YUPAI_DATA_DIR: args.dataDir },
  });
  const line = out.split("\n").find((l) => l.includes("統計："));
  if (!line) throw new Error(`Python 產生器沒有輸出統計：\n${out}`);
  const s = JSON.parse(line.slice(line.indexOf("{")));
  return {
    scope: s.scope,
    attention: s.attention,
    clean: s.clean,
    外業: s.by_div["外業"] ?? 0,
    內業: s.by_div["內業"] ?? 0,
    業務: s.by_div["業務"] ?? 0,
    missingLog: s.missing_log,
    unschedOnly: s.unsched_only,
    zeroPre: s.zero_pre_total,
  };
}

function runTs(args: Args): Metrics {
  const { result } = analyze(loadData(args.dataDir), { start: args.start, end: args.end, today: args.today });
  const s = result.stats;
  return {
    scope: s.scope,
    attention: s.attention,
    clean: s.clean,
    外業: s.byDiv["外業"] ?? 0,
    內業: s.byDiv["內業"] ?? 0,
    業務: s.byDiv["業務"] ?? 0,
    missingLog: s.missingLog,
    unschedOnly: s.unschedOnly,
    zeroPre: s.zeroPreTotal,
  };
}

const LABELS: [keyof Metrics, string][] = [
  ["scope", "納入評估人數"],
  ["attention", "需關注人數"],
  ["clean", "無缺失人數"],
  ["外業", "需關注・外業"],
  ["內業", "需關注・內業"],
  ["業務", "需關注・業務"],
  ["missingLog", "需補登日誌人數"],
  ["unschedOnly", "僅未預排人數"],
  ["zeroPre", "外業整組未排人數"],
];

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(join(args.dataDir, "roster.ndjson"))) {
    console.log(`找不到快取（${args.dataDir}），改為即時抓取（唯讀）…`);
    pullAll(args.dataDir, args.start, args.end);
  }
  console.log(`對帳區間 ${args.start} ~ ${args.end}（today=${args.today}），資料 ${args.dataDir}\n`);

  const ts = runTs(args);
  const py = runPython(args);

  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - [...s].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0)));
  console.log(pad("指標", 22) + pad("儀表板口徑(TS)", 18) + pad("舊版產生器(Py)", 18) + "一致");
  console.log("-".repeat(62));
  let allMatch = true;
  for (const [k, label] of LABELS) {
    const a = ts[k];
    const b = py[k];
    const ok = a === b;
    if (!ok) allMatch = false;
    console.log(pad(label, 22) + pad(String(a), 18) + pad(String(b), 18) + (ok ? "✓" : "✗ 不一致"));
  }
  console.log("-".repeat(62));
  if (allMatch) {
    console.log("\n✅ 全部一致：單一口徑（lib/yupaiCompliance.ts）與舊版產生器對同一資料算出相同計數。");
    process.exit(0);
  } else {
    console.error("\n❌ 有不一致項目，請檢查口徑是否漂移。");
    process.exit(1);
  }
}

main();
