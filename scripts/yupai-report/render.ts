// 由 Analysis + 結果產出報告 Markdown（純函式）。與舊版 generate.py 的 build_report 等價。
import { Analysis, MANAGERS, SCOPE_DIVISIONS, isoOrd, ordToIso, weekday, type Cell, type PersonEval, type YupaiResult } from "../../lib/yupaiCompliance";

const WEEKDAY_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const PRE_SYM: Record<string, string> = { 待排: "~", 排: "✓", 未排: "✗", 假: "假", "·": "·" };
const LOG_SYM: Record<string, string> = { 填: "✓", 未填: "✗", 待: "~", 免: "—", 假: "假", "·": "·" };

const cellRender = (c: Cell): string => (c.kind === "leave" ? "假" : c.kind === "none" ? "·" : PRE_SYM[c.pre] + LOG_SYM[c.log]);
const mmdd = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const zh = (a: string, b: string) => a.localeCompare(b, "zh-Hant");

export interface RenderOpts {
  leaveSource: "api" | "base";
  spotlightMd: string;
}

export function buildReport(an: Analysis, r: YupaiResult, opts: RenderOpts): string {
  const L: string[] = [];
  const dateHdr = an.workdays.map((d) => `${Number(ordToIso(d).slice(5, 7))}/${Number(ordToIso(d).slice(8, 10))}(${WEEKDAY_ZH[weekday(d)]})`);
  const sIso = ordToIso(an.startOrd);
  const eIso = ordToIso(an.endOrd);
  const rng = `${sIso.slice(0, 4)}/${sIso.slice(5, 7)}/${sIso.slice(8, 10)}–${eIso.slice(5, 7)}/${eIso.slice(8, 10)}`;
  const srcLabel = opts.leaveSource === "api" ? "Lark 出勤 API" : "薪水計算 Base（每日考勤明細＋詠翔請假）";

  L.push(`# 預排 vs 日誌 合規報告`);
  L.push(`**區間**：${rng}（僅平日）　**產出日**：${ordToIso(an.todayOrd)}　**假勤來源**：${srcLabel}`);
  L.push("");

  // ---- 一、結論 ----
  L.push("## 一、結論");
  L.push(`- 本次納入評估（三大組在職人員，排除主管/離職）共 **${r.stats.scope} 人**，其中 **需關注 ${r.stats.attention} 人**、無缺失 ${r.stats.clean} 人。`);
  L.push(`- 需關注分佈：` + SCOPE_DIVISIONS.map((d) => `${d} ${r.stats.byDiv[d] ?? 0} 人`).join("、") + "。");
  L.push(`- 兩類問題：**未填日誌 ${r.stats.missingLog} 人**（個人補登）；**僅未預排 ${r.stats.unschedOnly} 人**（多為整組未排班）。`);
  L.push("");
  L.push("**關鍵系統性問題：**");
  const zeroPre = [...r.zeroPreGroups.entries()].sort((a, b) => b[1].length - a[1].length);
  const gstr = zeroPre.map(([g, v]) => `${g}${v.length}人`).join("、");
  L.push(
    `1. **外業人員未見預排**：${gstr}（共 ${r.stats.zeroPreTotal} 人）本區間在「工作預排」**無任何排班紀錄**，但多數仍有外業工作單（日誌）。建議各組長補排或確認預排流程。`,
  );
  let worstDay: string | null = null;
  let worstN = -1;
  for (const [iso, n] of r.logMissByDay) if (n > worstN) ((worstN = n), (worstDay = iso)); // 同數取先出現者
  if (worstDay) {
    const wd = weekday(isoOrd(worstDay));
    const dd = r.logMissByDayDiv.get(worstDay)!;
    const divStr = [...dd.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} 人`).join("、");
    L.push(
      `2. **${mmdd(worstDay)}（週${WEEKDAY_ZH[wd]}）為漏填日誌高峰**：當日共 ${r.logMissByDay.get(worstDay)} 人未填（${divStr}），以內業週五日誌最集中（當日內業工作單極少，名單見下表）。`,
    );
  }
  const bizAttn = r.attention.filter((x) => x.division === "業務").map((x) => x.name).join("、");
  L.push(`3. **業務組**：制度上免填日誌（僅檢核預排）；${bizAttn} 有預排缺漏（見下表）。`);
  L.push("");
  if (r.withMissing.length) {
    L.push(`**需個人補登日誌者**：${r.withMissing.join("、")}。`);
    L.push("");
  }

  // ---- 二、需關注人員明細 ----
  L.push("## 二、需關注人員明細");
  L.push(
    "> 每格兩碼：第 1 碼＝預排、第 2 碼＝日誌。　預排：✓ 已排、✗ 未排、~ 尚未到上週五期限；　日誌：✓ 已填、✗ 未填、~ 尚未到期（次日/當日寬限）、— 免填（業務）。　「假」＝整日請假；「·」＝當日無排班/無日誌/無出勤（不計缺失）。　**⚠ 任一碼為 ✗ 即需關注。**",
  );
  L.push("");
  for (const div of SCOPE_DIVISIONS) {
    const groupRows = r.attention.filter((x) => x.division === div);
    if (!groupRows.length) continue;
    L.push(`### ${div}組（主管：${MANAGERS[div] ?? "—"}）— 需關注 ${groupRows.length} 人`);
    L.push("");
    L.push("| 姓名 | 組別 | " + dateHdr.join(" | ") + " |");
    L.push("|---|---|" + Array(dateHdr.length).fill("---").join("|") + "|");
    const sorted = [...groupRows].sort((a, b) => {
      const am = a.cells.some((c) => c.log === "未填") ? 0 : 1;
      const bm = b.cells.some((c) => c.log === "未填") ? 0 : 1;
      return am - bm || zh(a.group, b.group) || zh(a.name, b.name);
    });
    for (const row of sorted) {
      L.push(`| ${row.name} | ${row.group} | ${row.cells.map(cellRender).join(" | ")} |`);
    }
    L.push("");
  }

  // ---- 三、專案查核 ----
  L.push("## 三、專案查核");
  L.push(opts.spotlightMd);

  // ---- 四、資料說明與注意事項 ----
  L.push("## 四、資料說明與注意事項");
  L.push(
    `- **假勤來源**：優先嘗試 Lark 出勤 API，但以 user token 查詢回傳「user access token not support」無法存取，故改用「薪水計算」Base 的『每日考勤明細』（核准假別/出勤狀態）與『詠翔請假』（含審批中假單）。`,
  );
  L.push(
    `- **比對欄位**：預排以「工作預排—人員」；外業日誌以「外業工作單—此單出工人」；內業以「內業工作單—姓名」；行政以「行政工作單—營業額人員」。工作日期取各表實際工作日（內業/行政為日期序列欄位還原）。`,
  );
  const lastPast = an.workdays.filter((d) => d < an.todayOrd);
  const graceDay = lastPast.length ? mmdd(ordToIso(Math.max(...lastPast))) : mmdd(ordToIso(an.todayOrd));
  L.push(
    `- **日誌寬限**：日誌多於次日填寫，故最近一個工作日（${graceDay}）及當日之日誌標示「~」、不列缺失；惟當週預排已於上週五排定，故 ${mmdd(ordToIso(an.todayOrd))} 之『未排』仍檢核。`,
  );
  L.push(`- **僅評估活動日**：僅在當事人當日有出勤/排班/日誌任一訊號時才判定缺失；全日請假（含審批中）一律視為請假不計缺失。`);
  const weekendDays: number[] = [];
  for (let d = an.startOrd; d <= an.endOrd; d++) if (weekday(d) >= 5) weekendDays.push(Number(ordToIso(d).slice(8, 10)));
  L.push(
    `- **範圍**：僅三大組（外業/業務/內業）平日。週末（${weekendDays.join("/")}）不計；` +
      (an.holidays.size ? `偵測到之假日：${[...an.holidays].join("、")}。` : "區間內未偵測到國定假日。") +
      " 行政/IT/PM 不在三大組範圍（行政日誌最新僅到 10/07、填寫延遲，未納入本次判斷）。",
  );
  L.push(`- **排除名單**：離職人員；另本日離職之「陳星影」——名冊中對應為『陳星穎』（在職旗標尚未更新），一併排除。`);
  L.push(`- **異體字對應**：鄭秉彝＝鄭秉彜。`);
  const noEval = new Set<string>(an.noSignal);
  for (const row of r.rows) if (row.cells.every((c) => c.kind === "none" || c.kind === "leave")) noEval.add(row.name);
  if (noEval.size) {
    L.push(`- **無法評估**：下列在職人員本區間無任何排班/日誌/出勤訊號（或整週請假），未列入關注：${[...noEval].sort(zh).join("、")}。`);
  }
  L.push("");
  L.push(`*（本報告由 scripts/yupai-report 產生器自動產生，單一口徑在 lib/yupaiCompliance.ts；資料唯讀，僅覆寫本 Docx，未對任何 Base 寫入、未發送訊息。）*`);

  return L.join("\n");
}

// 統計摘要（寫入 result.md）。
export function summaryLines(r: YupaiResult): string[] {
  return [
    `納入評估 ${r.stats.scope} 人；需關注 ${r.stats.attention} 人；無缺失 ${r.stats.clean} 人。`,
    `分佈：` + Object.entries(r.stats.byDiv).map(([k, v]) => `${k} ${v} 人`).join("、"),
    `需個人補登日誌 ${r.stats.missingLog} 人；僅未預排 ${r.stats.unschedOnly} 人；外業整組未排共 ${r.stats.zeroPreTotal} 人。`,
  ];
}

export type { PersonEval };
