"use client";
import { CalendarCheck2, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { downloadCsv, simpleCsv } from "@/lib/csv";
import { checkCsvRow, checkText, evaluateRange, existingAttendance, exemptionRosterNote, statusText, logSourceText, type DayResult, type ExistingDailyResponse } from "@/lib/scheduleCheck";
import { weekDates } from "@/lib/attendanceCore";
import { useShell } from "./AppShell";
import { STATUS_TEXT, useSource } from "./useSource";

export default function DailyCheck() {
  const { week, demo, tick, manual } = useShell();
  const people = useSource("yupai-v3-people", { links: true });
  const sched = useSource("yupai-v3-schedule", { links: true });
  const field = useSource("yupai-v3-field-work", { links: true });
  const internal = useSource("yupai-v3-internal-work", { links: true });
  const admin = useSource("yupai-v3-admin-work", { links: true });
  const pm = useSource("yupai-v3-pm-cost", { links: true });
  const cost = useSource("yupai-v3-internal-cost", { links: true });
  const days = useMemo(() => weekDates(week.start), [week.start]);
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const [date, setDate] = useState(days.includes(today) ? today : days[0]);
  const [onlyMissing, setOnlyMissing] = useState(false);
  useEffect(() => setDate(days.includes(today) ? today : days[0]), [days, today]);
  const tag = `${week.start}|${demo}|${tick}|${manual}`;
  const [dailyResult, setDailyResult] = useState<{ tag: string; data?: ExistingDailyResponse; error?: string }>();
  useEffect(() => {
    let off = false;
    const qs = new URLSearchParams({ week: String(week.start) });
    if (demo) qs.set("demo", "1");
    if (tick > 0 && manual) qs.set("refresh", "1");
    fetch(`/api/attendance/daily?${qs}`).then((r) => r.json()).then((data: ExistingDailyResponse) => {
      if (!off) setDailyResult({ tag, data });
    }).catch(() => { if (!off) setDailyResult({ tag, error: "假勤來源讀取失敗" }); });
    return () => { off = true; };
  }, [week.start, demo, tick, manual, tag]);
  const sources = [people, sched, field, internal, admin, pm, cost];
  let report: ReturnType<typeof evaluateRange> | undefined;
  let error = sources.some((s) => s.status !== "ok") ? sources.filter((s) => s.status !== "ok").map((s) => STATUS_TEXT[s.status]).join("、") : "";
  const daily = dailyResult?.tag === tag ? dailyResult : undefined;
  if (!error && !daily) error = "假勤載入中…";
  if (!error && daily?.error) error = daily.error;
  if (!error) {
    try {
      report = evaluateRange({ people: people.data!, schedule: sched.data!, logs: { "field-work": field.data!, "internal-work": internal.data!, "admin-work": admin.data!, "pm-cost": pm.data!, "internal-cost": cost.data! }, attendance: existingAttendance(daily!.data!), start: days[0], end: days[6], today });
    } catch (e) { error = (e as Error).message; }
  }
  const title = <div className="hr-card-head"><CalendarCheck2 size={16} /><h2>每日檢查</h2><span className="muted small">V3 預排／個人日誌・打卡獨立</span></div>;
  if (!report) return <section className="hr-card">{title}<p className="warn-text small">核對未完成：{error}。停止缺失統計及結果匯出。</p></section>;
  const rows = report.rows.filter((r) => r.date === date);
  const regular = rows.filter((r) => !r.sourcePending && (!onlyMissing || r.missing));
  const pending = rows.filter((r) => r.sourcePending);
  const excluded = report.roster.filter((p) => !p.requiresPlanning);
  const excludedCsv = excluded.map((p) => [p.name, p.rawGroup, p.effectiveGroup, p.classification, p.departedReason ? "離職" : "豁免", p.departedReason ? "離職" : "豁免", "", report.punchRows.find((r) => r.recordId === p.recordId && r.date === date)?.status ?? "—", p.departedReason ?? p.exemptionReason ?? "", p.dataAttentionReasons.join("；")]);
  const summary = report.summary;
  const note = exemptionRosterNote(people.data);
  const metadata = [
    `每日檢查 ${date}；統計區間 ${days[0]}～${days[6]}；日誌寬限截止 ${report.cutoff}`,
    `在職 ${summary.active}；核對 ${summary.checked}；可評估 ${summary.assessed}；來源待確認 ${summary.sourcePending}`,
    `預排／日誌缺失 ${summary.attention}；到期未填 ${summary.missed}；僅未排 ${summary.unschedOnly}；未偵測缺失 ${summary.clean}；無活動 ${summary.unable}；假勤證據不足 ${summary.attendanceUnknown}；資料注意 ${summary.dataAttention}；總關注 ${summary.totalAttention}；打卡缺漏 ${summary.punchMissing}（獨立）`,
    ...Object.entries(summary.byDivision).map(([d, n]) => `${d}：核對 ${n.checked}／可評估 ${n.assessed}／缺失 ${n.attention}`),
    "現有假勤口徑；完整假勤來源不相容：缺全員考勤狀態、休息日比例與審批中假單證據。未觀測活動不當成無活動／乾淨；打卡另列，不代替完整出勤紀錄。",
    `行政工作單全表最新工作日：${report.adminLatest ?? "未知"}；更新不解除待確認。`, note,
  ];
  const exportCsv = () => downloadCsv(`每日檢查_${date}.csv`, simpleCsv(["姓名", "原組別", "有效組別", "檢核分類", "預排", "日誌", "日誌來源", "打卡", "狀態／原因", "資料注意"], [...[...regular, ...pending].map(checkCsvRow), ...excludedCsv], metadata));
  const renderTable = (list: DayResult[]) => (
    <div className="cg-sheet">
      <table>
        <thead><tr><th>姓名</th><th>原組別 → 有效組別／分類</th><th>預排</th><th>日誌／來源</th><th>打卡（獨立）</th><th>狀態／原因</th></tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.recordId}>
              <td title={r.rawName}>{r.name}</td>
              <td>{r.rawGroup || "未填"} → {r.effectiveGroup || "未填"}<div className="muted small">{r.classification}</div></td>
              <td className={r.planning === "未排" ? "bad-text" : ""}>{checkText(r, "planning")}</td>
              <td className={r.log === "未填" ? "bad-text" : ""}>
                {checkText(r, "log")}<div className="muted small">{logSourceText(r.logSources)}</div>
              </td>
              <td className={r.punchMissing ? "bad-text" : ""}>{r.punch}</td>
              <td className={r.missing ? "bad-text" : ""}>
                {statusText(r)}<div className="warn-text small">{r.dataAttentionReasons.join("；")}</div>
              </td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={6} className="muted">這天沒有符合條件的工作日結果。</td></tr>}
        </tbody>
      </table>
    </div>
  );
  return <section className="hr-card">{title}
    <div className="toolbar" style={{ gap: 12, flexWrap: "wrap" }}><label className="tool tool-select">日期 <select value={date} onChange={(e) => setDate(e.target.value)} aria-label="選擇日期">{days.map((d) => <option key={d} value={d}>{d}</option>)}</select></label><label><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> 只列預排／日誌缺失</label><button className="tool" onClick={exportCsv}><Download size={14} />匯出</button></div>
    {metadata.map((m, i) => <p key={i} className="muted small">{m}</p>)}
    {renderTable(regular)}
    <h3>行政資料來源待確認</h3>{renderTable(pending)}
    <h3>預排／日誌豁免及離職（不計核對分母）</h3>
    <div className="cg-sheet"><table><thead><tr><th>姓名</th><th>預排</th><th>日誌</th><th>打卡（獨立）</th><th>原因</th></tr></thead><tbody>{excludedCsv.map((r) => <tr key={r[0]}><td>{r[0]}</td><td>{r[4]}</td><td>{r[5]}</td><td>{r[7]}</td><td>{r[8]}</td></tr>)}</tbody></table></div>
    <p className="muted small">排／未排／待排；填／未填／待；假＝本人假勤或純休假預排；·＝未觀測活動。外業同組預排共享，日誌只算本人；空白條類型也算預排。週末不展開。預排期限為上週五，日誌截止日（含）仍寬限。</p>
    <p className="muted small">日誌＝外業、內業、行政工作單及業務PM、內業成本單五來源聯集，只依工作日期（UTC 序列／ISO 轉台北），不回退填寫時間。預排／日誌豁免與離職排除：{report.roster.filter((p) => !p.requiresPlanning).map((p) => `${p.name}（${p.departedReason ?? p.exemptionReason}）`).join("、") || "無"}；打卡結果獨立於預排／日誌缺失。</p>
  </section>;
}
