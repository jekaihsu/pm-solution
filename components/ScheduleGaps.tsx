"use client";
import { CalendarX, Download } from "lucide-react";
import { downloadCsv, simpleCsv } from "@/lib/csv";
import { buildRosterIndex, buildScheduleIndex, exemptionRosterNote, scheduledPersonIds, unfilledPlanning, type RosterLite } from "@/lib/scheduleCheck";
import { normalizeWorkDate } from "@/lib/workDate";
import { weekName, weekRange } from "@/lib/week";
import { useShell } from "./AppShell";
import { STATUS_TEXT, useSource } from "./useSource";

export default function ScheduleGaps() {
  const { week } = useShell();
  const next = weekRange(week.offset + 1);
  const people = useSource("yupai-v3-people", { links: true });
  const sched = useSource("yupai-v3-schedule", { links: true });
  let report: { roster: RosterLite[]; required: RosterLite[]; scheduled: Set<string>; unfilled: RosterLite[] } | undefined;
  let error = people.status !== "ok" ? STATUS_TEXT[people.status] : sched.status !== "ok" ? STATUS_TEXT[sched.status] : "";
  if (!error) try {
    const roster = buildRosterIndex(people.data!);
    const start = normalizeWorkDate(next.start)!, end = normalizeWorkDate(next.end - 1)!;
    const index = buildScheduleIndex(sched.data!, roster, start, end);
    const scheduled = scheduledPersonIds(index, roster.active, start, end);
    const required = roster.active.filter((p) => p.requiresPlanning && !p.sourcePending);
    report = { roster: roster.active, required, scheduled, unfilled: unfilledPlanning(roster.active, scheduled) };
  } catch (e) { error = (e as Error).message; }
  const title = <div className="hr-card-head"><CalendarX size={16} /><h2>下週預排未填</h2><span className="muted small">{weekName(next.offset)} {next.label}</span></div>;
  if (!report) return <section className="hr-card">{title}<p className="warn-text small">核對未完成：{error}。停止缺失統計及結果匯出。</p></section>;
  const pending = report.roster.filter((p) => p.requiresPlanning && p.sourcePending);
  const filled = report.required.length - report.unfilled.length;
  const note = `應填 ${report.required.length}・週內曾排 ${filled}・未排 ${report.unfilled.length}・來源待確認 ${pending.length}（不計缺漏）`;
  const excluded = report.roster.filter((p) => !p.requiresPlanning);
  return <section className="hr-card">{title}<div className="toolbar" style={{ flexWrap: "wrap", gap: 12 }}><span>{note}</span><button className="tool" onClick={() => downloadCsv(`下週預排_${next.label}.csv`, simpleCsv(["姓名", "原組別", "有效組別", "狀態"], [...report!.unfilled.map((p) => [p.name, p.rawGroup, p.effectiveGroup, "未排"]), ...pending.map((p) => [p.name, p.rawGroup, p.effectiveGroup, "待確認"])], [note, "週內曾排，不代表每天排滿；空白類型及同組外業預排皆計入。", exemptionRosterNote(people.data)]))}><Download size={14} />匯出</button></div>
    <div className="cg-sheet"><table><thead><tr><th>姓名</th><th>原組別 → 有效組別</th><th>狀態</th></tr></thead><tbody>{report!.unfilled.map((p) => <tr key={p.recordId}><td>{p.name}</td><td>{p.rawGroup || "未填"} → {p.effectiveGroup || "未填"}</td><td>未排</td></tr>)}{!report.unfilled.length && <tr><td colSpan={3} className="muted">應填者週內皆曾排。</td></tr>}</tbody></table></div>
    <h3>行政資料來源待確認</h3><p className="muted small">{pending.map((p) => `${p.name}（待確認）`).join("、") || "無"}</p>
    <p className="muted small">週內任一平日有預排就算曾排（含空白類型、休假類型）；有效外業組共享預排，PM／行政／內業不共享。此處不代表每天排滿。</p>
    <p className="muted small">排除：{excluded.map((p) => `${p.name}（${p.departedReason ?? p.exemptionReason}）`).join("、") || "無"}。{exemptionRosterNote(people.data)}</p>
  </section>;
}
