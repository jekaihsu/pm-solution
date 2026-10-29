import React from "react";
import { anomalies, classifyCheck, violatesSop, type GroupRow, type WorkFields, type buildInternalScheduleExecution, type buildPersonAttendanceAndBackfill } from "@/lib/controlGroup";

type Props = {
  rows?: GroupRow[];
  wf?: WorkFields;
  comparison?: ReturnType<typeof buildInternalScheduleExecution>;
  attendance?: ReturnType<typeof buildPersonAttendanceAndBackfill>;
  notes?: string[];
  comparisonReady?: boolean;
  attendanceReady?: boolean;
};

// Reuse the same order flags, schedule comparison and attendance results as the numbered sections.
export default function R02Anomalies({ rows = [], wf, comparison, attendance, notes = [], comparisonReady = notes.length === 0, attendanceReady = notes.length === 0 }: Props) {
  const groups = new Map<string, string[]>();
  const group = (team: string) => {
    const name = team || "（未填組別）";
    if (!groups.has(name)) groups.set(name, []);
    return groups.get(name)!;
  };
  const extraIds = new Set(comparison?.extraWorkOrders.map(order => order.id));
  for (const row of rows) {
    const issues = group(row.team ?? row.group);
    for (const order of row.orders) {
      if (!wf) continue;
      const labels = anomalies(order, wf);
      const status = String(order.fields[wf.status?.name ?? "檢核狀態"] ?? "").trim();
      if (status === "已退回") labels.push(`已退回：${order.fields["退回原因"] || "未填退回原因"}`);
      else if (classifyCheck(order, wf) === "fail") labels.push("檢核不通過");
      if (violatesSop(order, wf)) labels.push("違反 SOP");
      if (extraIds.has(order.id) && comparisonReady) labels.push("多增加的工作單");
      if (labels.length) issues.push(`${row.group}・${order.fields[wf.orderNo?.name ?? "工作單號"] || order.id}：${labels.join("、")}`);
    }
  }
  for (const person of attendance?.people ?? []) {
    const issues = group(person.team);
    // An incomplete source must not be presented as a confirmed missing report.
    if (attendanceReady && person.missingReportDays) issues.push(`${person.person}：未填日報 ${person.missingReportDays} 天（${person.missingDates.join("、")}）`);
    if (attendanceReady && person.after1030Count) issues.push(`${person.person}：超過次日 10:30 逾時補填 ${person.after1030Count} 件`);
  }
  const abnormal = [...groups].filter(([, issues]) => issues.length);
  const normal = [...groups].filter(([, issues]) => !issues.length);
  return <section className="cg" aria-label="異常／需人工確認" style={{ border: "1px solid #fca5a5", background: "#fff7f7" }}>
    <h2 style={{ color: "#991b1b" }}>異常／需人工確認</h2>
    {notes.map(note => <p key={note} role="status">{note}</p>)}
    {!abnormal.length && <p>{notes.length ? "資料未齊，異常狀態待確認。" : "目前範圍內無異常。"}</p>}
    {abnormal.map(([team, issues]) => <div key={team} data-anomaly-group={team} style={{ color: "#991b1b" }}>
      <h3>{team}・需人工確認 {issues.length} 項</h3>
      <ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
    </div>)}
    <details key={normal.map(([team]) => team).join("|")} data-normal-groups>
      <summary>{notes.length ? "待確認組別" : "無異常的組別"}（{normal.length} 組）</summary>
      {normal.map(([team]) => <p key={team}>{team}：{notes.length ? "資料未齊，待確認" : "無異常"}</p>)}
      {!normal.length && <p>目前沒有{notes.length ? "待確認" : "無異常的"}組別。</p>}
    </details>
    <p className="muted small">依工作單異常欄位、檢核狀態、SOP、預排案件比對及第 5 項未填／逾時補填統計彙整；多增加工作單列為需人工確認。</p>
  </section>;
}
