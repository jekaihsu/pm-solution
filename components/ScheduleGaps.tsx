"use client";
// R04 下週預排：應填者的缺漏，以及完整可見的豁免／離職與資料注意。
import { CalendarX, Download } from "lucide-react";
import { useMemo } from "react";
import { downloadCsv, simpleCsv } from "@/lib/csv";
import {
  exemptionRosterNote,
  parseRoster,
  planningKnown,
  rosterIssue,
  scheduledPersonIds,
  unfilledPlanning,
} from "@/lib/scheduleCheck";
import { weekName, weekRange } from "@/lib/week";
import { useShell } from "./AppShell";
import { STATUS_TEXT, useSource } from "./useSource";

const SCHED_FIELDS = [
  "#fldMXOggGP",
  "#fldjWv1xST",
  "#fld7KNCsVe",
  "#fld78OmLVn",
  "開始日期",
  "結束日期",
  "人員",
  "條類型",
];

export default function ScheduleGaps() {
  const { week } = useShell();
  const next = weekRange(week.offset + 1);
  const people = useSource("v3-people");
  const sched = useSource("v3-schedule", { fields: SCHED_FIELDS, links: true });
  const rosterError =
    people.status === "ok" && people.data ? rosterIssue(people.data) : null;
  const schedKnown = sched.status === "ok" && planningKnown(sched.data);
  const report = useMemo(() => {
    if (people.status !== "ok" || !people.data || rosterError) return null;
    const roster = parseRoster(people.data);
    const required = roster.filter(
      (p) => p.requiresPlanning && !p.departedReason,
    );
    const scheduled =
      schedKnown && sched.data
        ? scheduledPersonIds(sched.data, next.start, next.end)
        : new Set<string>();
    return {
      roster,
      required,
      scheduled,
      unfilled: schedKnown ? unfilledPlanning(roster, scheduled) : [],
      filled: schedKnown
        ? required.filter((p) => scheduled.has(p.recordId)).length
        : 0,
    };
  }, [
    people.status,
    people.data,
    rosterError,
    schedKnown,
    sched.data,
    next.start,
    next.end,
  ]);
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
        <p className="muted small">
          {people.error ?? "沒有查看人員名單的權限"}
          （下週預排未填需要人事查看權限）。
        </p>
      </section>
    );
  if (!report)
    return (
      <section className="hr-card">
        {title}
        <p
          className={`small ${rosterError || people.status === "error" ? "bad-text" : "muted"}`}
        >
          {rosterError ??
            `人員名單${STATUS_TEXT[people.status]}${people.error ? `：${people.error}` : ""}`}
        </p>
        <p className="muted small">{exemptionRosterNote()}</p>
      </section>
    );

  const { roster, required, scheduled, unfilled, filled } = report;
  const exempt = roster.filter((p) => p.exemptionReason && !p.departedReason);
  const departed = roster.filter((p) => p.departedReason);
  const attention = roster.filter((p) => p.dataAttentionReasons.length);
  const byGroup = new Map<string, string[]>();
  for (const p of unfilled)
    byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p.name]);
  const note = exemptionRosterNote(people.data);
  const exportCsv = () =>
    downloadCsv(
      `下週預排檢查_${next.label.replace(/[\s/–]/g, "_")}.csv`,
      simpleCsv(
        [
          "姓名",
          "原始姓名",
          "組別",
          "檢核分類",
          "預排狀態",
          "日誌要求",
          "原因",
          "資料注意",
        ],
        roster.map((p) => [
          p.name,
          p.rawName,
          p.group,
          p.classification,
          p.departedReason
            ? "離職（不檢核）"
            : p.exemptionReason
              ? "豁免"
              : !schedKnown
                ? "未知"
                : scheduled.has(p.recordId)
                  ? "已排"
                  : "未填",
          p.requiresLog
            ? "須填（此表不評估日誌）"
            : p.departedReason
              ? "離職（不檢核）"
              : "豁免",
          p.departedReason ??
            p.exemptionReason ??
            (!schedKnown
              ? "預排來源未知，無法判斷"
              : !scheduled.has(p.recordId)
                ? "未找到下週工作預排，待確認"
                : ""),
          p.dataAttentionReasons.join("；"),
        ]),
        [
          `下週（${next.label}）預排檢查（完整名冊）`,
          `在職 ${roster.length - departed.length} 人、應填 ${required.length} 人、豁免 ${exempt.length} 人、離職 ${departed.length} 人、已排 ${schedKnown ? filled : "未知"} 人、未填 ${schedKnown ? unfilled.length : "未知"} 人`,
          "外業／業務／內業以外按內業檢核，須填預排＋日誌；具名豁免兩項皆免。",
          note,
        ],
      ),
    );

  return (
    <section className="hr-card">
      {title}
      <div className="att-kpis">
        <div className="att-kpi">
          <span>在職</span>
          <b>{roster.length - departed.length}</b>
        </div>
        <div className="att-kpi">
          <span>應填預排</span>
          <b>{required.length}</b>
        </div>
        <div className="att-kpi">
          <span>已排下週</span>
          <b>{schedKnown ? filled : "未知"}</b>
        </div>
        <div className="att-kpi">
          <span>未填</span>
          <b className={unfilled.length ? "bad-text" : ""}>
            {schedKnown ? unfilled.length : "未知"}
          </b>
        </div>
      </div>
      <p className="muted small">
        豁免 {exempt.length}・離職 {departed.length}・資料注意{" "}
        {attention.length}。{note}
      </p>
      {!schedKnown ? (
        <p className="warn-text small">
          工作預排
          {sched.status === "ok" ? "缺少必要欄位" : STATUS_TEXT[sched.status]}
          {sched.error ? `：${sched.error}` : ""}
          ：應填者狀態未知，不能判為未填或已排。
        </p>
      ) : unfilled.length ? (
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
              {[...byGroup]
                .sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"))
                .map(([g, names]) => (
                  <tr key={g}>
                    <td className="cg-sheet-name">{g}</td>
                    <td>{names.join("、")}</td>
                    <td className="num">{names.length}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">
          {required.length
            ? "需填預排者均已排下週預排。"
            : "目前名冊沒有需填預排者。"}
        </p>
      )}
      {!!(exempt.length + departed.length) && (
        <div className="cg-sheet" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>姓名</th>
                <th>組別</th>
                <th>狀態</th>
                <th>原因</th>
              </tr>
            </thead>
            <tbody>
              {[...exempt, ...departed].map((p) => (
                <tr key={p.recordId}>
                  <td className="att-name">{p.name}</td>
                  <td>{p.group}</td>
                  <td>
                    {p.departedReason ? "離職（不檢核）" : "預排／日誌豁免"}
                  </td>
                  <td>{p.departedReason ?? p.exemptionReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!!attention.length && (
        <div className="cg-sheet" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>資料注意人員</th>
                <th>組別</th>
                <th>預排狀態</th>
                <th>資料注意</th>
              </tr>
            </thead>
            <tbody>
              {attention.map((p) => (
                <tr key={p.recordId}>
                  <td>{p.name}</td>
                  <td>{p.group}</td>
                  <td>
                    {p.departedReason
                      ? "離職"
                      : p.exemptionReason
                        ? "豁免"
                        : !schedKnown
                          ? "未知"
                          : scheduled.has(p.recordId)
                            ? "已排"
                            : "未填"}
                  </td>
                  <td className="warn-text">
                    {p.dataAttentionReasons.join("；")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <button className="tool" onClick={exportCsv} title="匯出完整名冊 CSV">
          <Download size={14} strokeWidth={1.75} /> 匯出完整名冊
        </button>
      </div>
      <ul className="cg-notes">
        <li>
          名冊＝V3 人員名單在職同事，另保留離職 override
          供核對。具名豁免不計預排／日誌應填人數，理由為「JK
          確認免填預排」；離職另列不計入在職。已排與未填僅計應填預排者。
        </li>
        <li>
          除豁免與離職外，全部在職人員皆須填預排＋日誌，包含主管及
          PM／行政／IT／控制／圖報；外業／業務／內業以外按內業檢核，保留原組別。未填組別仍檢核並列資料注意。
        </li>
        <li>
          比對下週工作預排「人員」（record_id），排除休假／請假條；沒有工作預排者列未填並待確認，不判斷缺勤或整週合規。日誌與請假原因請查看每日檢查。V4
          另計，這裡只看 V3。
        </li>
      </ul>
    </section>
  );
}
