"use client";
// R04 管理工具（item 2）：下週預排未填 — 名冊 vs 下週工作預排，列出沒有任何預排的人＋組別。
// 「下週」＝所選週的下一週（可用週選擇器往前看）。純函式在 lib/scheduleCheck.ts。
import { CalendarX, Download } from "lucide-react";
import { useMemo } from "react";
import { downloadCsv, simpleCsv } from "@/lib/csv";
import { parseRoster, scheduledPersonIds, unfilledPlanning } from "@/lib/scheduleCheck";
import { weekName, weekRange } from "@/lib/week";
import { useShell } from "./AppShell";
import { STATUS_TEXT, useSource } from "./useSource";

// 預排只需人員（link）、真起訖日、條類型；依 field id，V4 退回欄名。
const SCHED_FIELDS = ["#fldMXOggGP", "#fldjWv1xST", "#fld7KNCsVe", "#fld78OmLVn", "開始日期", "結束日期", "人員", "條類型"];

export default function ScheduleGaps() {
  const { week } = useShell();
  const next = weekRange(week.offset + 1);
  const people = useSource("v3-people");
  const sched = useSource("v3-schedule", { fields: SCHED_FIELDS, links: true });

  const report = useMemo(() => {
    if (people.status !== "ok" || !people.data || sched.status !== "ok" || !sched.data) return null;
    const roster = parseRoster(people.data);
    const scheduled = scheduledPersonIds(sched.data, next.start, next.end);
    const filled = roster.filter((p) => scheduled.has(p.recordId)).length;
    return { roster, unfilled: unfilledPlanning(roster, scheduled), filled };
  }, [people.status, people.data, sched.status, sched.data, next.start, next.end]);

  const title = (
    <div className="hr-card-head">
      <CalendarX size={16} />
      <h2>下週預排未填</h2>
      <span className="muted small">
        {weekName(next.offset)} {next.label}
      </span>
    </div>
  );

  if (people.status === "forbidden")
    return (
      <section className="hr-card">
        {title}
        <p className="muted small">{people.error ?? "沒有查看人員名單的權限"}（下週預排未填需要人事查看權限）。</p>
      </section>
    );
  if (!report)
    return (
      <section className="hr-card">
        {title}
        <p className={`small ${people.status === "error" || sched.status === "error" ? "bad-text" : "muted"}`}>
          {people.status !== "ok" ? `人員名單${STATUS_TEXT[people.status]}` : `工作預排${STATUS_TEXT[sched.status]}`}
          {people.error || sched.error ? `：${people.error ?? sched.error}` : ""}
        </p>
      </section>
    );

  const { roster, unfilled, filled } = report;
  const byGroup = new Map<string, string[]>();
  for (const p of unfilled) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p.name]);
  const exportCsv = () =>
    downloadCsv(
      `下週預排未填_${next.label.replace(/[\s/–]/g, "_")}.csv`,
      simpleCsv(["姓名", "組別"], unfilled.map((p) => [p.name, p.group]), [`下週（${next.label}）預排未填`, `在職 ${roster.length} 人、已排 ${filled} 人、未填 ${unfilled.length} 人`]),
    );

  return (
    <section className="hr-card">
      {title}
      <div className="att-kpis">
        <div className="att-kpi">
          <span>在職</span>
          <b>{roster.length}</b>
        </div>
        <div className="att-kpi">
          <span>已排下週</span>
          <b>{filled}</b>
        </div>
        <div className="att-kpi">
          <span>未填</span>
          <b className={unfilled.length ? "bad-text" : ""}>{unfilled.length}</b>
        </div>
      </div>
      {unfilled.length ? (
        <>
          <div className="cg-sheet">
            <table>
              <thead>
                <tr>
                  <th>組別</th>
                  <th>未填下週預排的人</th>
                  <th className="num">人數</th>
                </tr>
              </thead>
              <tbody>
                {[...byGroup].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant")).map(([g, names]) => (
                  <tr key={g}>
                    <td className="cg-sheet-name">{g}</td>
                    <td>{names.join("、")}</td>
                    <td className="num">{names.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8 }}>
            <button className="tool" onClick={exportCsv} title="匯出 CSV">
              <Download size={14} strokeWidth={1.75} /> 匯出名單
            </button>
          </div>
        </>
      ) : (
        <p className="muted small">下週每位在職同事都有預排。</p>
      )}
      <ul className="cg-notes">
        <li>
          名冊＝V3 人員名單在職同事；比對「下週」（所選週的下一週，可用上方週選擇器往前看）工作預排的「人員」欄（依 record_id），排除條類型＝休假／請假的預排。沒有出現在任何預排的人即列為未填。V4 預排另計，這裡只看 V3。
        </li>
      </ul>
    </section>
  );
}
