"use client";
// R04 每日檢查：完整名冊、預排／日誌政策與獨立打卡狀態。
import { CalendarCheck2, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { downloadCsv, simpleCsv } from "@/lib/csv";
import {
  costSourceKnown,
  dailyStatus,
  exemptionRosterNote,
  loggedPersonIds,
  parseRoster,
  planningKnown,
  rosterIssue,
  scheduledPersonIds,
  taipeiDay,
  type CostSource,
  type DailyStatus,
} from "@/lib/scheduleCheck";
import { weekDates } from "@/lib/attendanceCore";
import { useShell } from "./AppShell";
import { STATUS_TEXT, useSource } from "./useSource";

const DAY = 86400000;
const TZ = 8 * 3600000;
const WD = ["一", "二", "三", "四", "五", "六", "日"];
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
const LEAVE_TEXT: Record<string, string> = {
  leave: "請假",
  trip: "出差",
  out: "外出",
};
type DailyResp = {
  status: string;
  leave?: Record<string, { date: string; kind: string }[]>;
  punch?: Record<string, string[]>;
  members?: string[];
};

const yes = <span className="att-tag ok">✓</span>;
const no = <span className="att-tag bad">✗</span>;
const unknown = (
  <span className="muted small" title="來源尚未完整讀取，無法判斷">
    未知
  </span>
);
const checkText = (r: DailyStatus, kind: "planning" | "log") => {
  if (r.departedReason) return "離職（不檢核）";
  if (r.exemptionReason) return "豁免";
  const known = kind === "planning" ? r.plannedKnown : r.loggedKnown;
  const present = kind === "planning" ? r.planned : r.logged;
  return known ? (present ? "有" : "無") : "未知";
};
const statusText = (r: DailyStatus) => {
  if (r.departedReason) return "離職";
  if (r.exemptionReason) return r.missing ? "預排／日誌豁免；打卡缺漏" : "豁免";
  if (r.leave) return `${LEAVE_TEXT[r.leave]}（未計合規）`;
  if (r.noSignal) return "無活動訊號（待確認）";
  if (r.missing) return "有缺漏";
  return r.compliant ? "已完成應填項目" : "待確認";
};
const reasonText = (r: DailyStatus) => r.reason;

export default function DailyCheck() {
  const { week, demo, tick, manual } = useShell();
  const people = useSource("v3-people");
  const sched = useSource("v3-schedule", { fields: SCHED_FIELDS, links: true });
  const iCost = useSource("v3-internal-cost", {
    fields: ["工作日期", "填報人"],
    links: true,
  });
  const fCost = useSource("v3-field-cost", {
    fields: ["工作日期", "組長", "實際出工人", "組員"],
    links: true,
  });
  const aCost = useSource("v3-admin-cost", {
    fields: ["工作日期", "填表人"],
    links: true,
  });

  // 與假勤 API 一致，展開包含 week.start 的週一到週日。
  const days = useMemo(() => weekDates(week.start), [week.start]);
  const todayStr = new Date(Date.now() + TZ).toISOString().slice(0, 10);
  const [date, setDate] = useState(
    days.includes(todayStr) ? todayStr : days[0],
  );
  useEffect(
    () => setDate(days.includes(todayStr) ? todayStr : days[0]),
    [days, todayStr],
  );
  const [onlyMissing, setOnlyMissing] = useState(false);
  const attendanceTag = `${week.start}|${demo}|${tick}|${manual}`;
  const [dailyResult, setDailyResult] = useState<{
    tag: string;
    data: DailyResp | null;
    state: "off" | "ok" | "fail";
  } | null>(null);
  // 切週、示範模式或重新整理時，不呈現上一個請求的打卡／假勤結果。
  const daily = dailyResult?.tag === attendanceTag ? dailyResult.data : null;
  const dailyState = dailyResult?.tag === attendanceTag ? dailyResult.state : "off";
  useEffect(() => {
    let off = false;
    setDailyResult({ tag: attendanceTag, data: null, state: "off" });
    const qs = new URLSearchParams({ week: String(week.start) });
    if (demo) qs.set("demo", "1");
    if (tick > 0 && manual) qs.set("refresh", "1");
    fetch(`/api/attendance/daily?${qs}`)
      .then((r) => r.json())
      .then((res: DailyResp) => {
        if (off) return;
        const complete =
          res.status === "ok" &&
          !!res.leave &&
          !!res.punch &&
          Array.isArray(res.members);
        setDailyResult({
          tag: attendanceTag,
          data: complete ? res : null,
          state: complete ? "ok" : "fail",
        });
      })
      .catch(() => {
        if (!off) setDailyResult({ tag: attendanceTag, data: null, state: "fail" });
      });
    return () => {
      off = true;
    };
  }, [week.start, demo, tick, manual, attendanceTag]);

  const costSources = useMemo(
    () =>
      [
        iCost.status === "ok" && iCost.data
          ? {
              data: iCost.data,
              dateNames: ["工作日期"],
              personNames: ["填報人"],
            }
          : null,
        fCost.status === "ok" && fCost.data
          ? {
              data: fCost.data,
              dateNames: ["工作日期"],
              personNames: ["組長", "實際出工人", "組員"],
              requiredPersonNames: [["組長"], ["實際出工人", "組員"]],
            }
          : null,
        aCost.status === "ok" && aCost.data
          ? {
              data: aCost.data,
              dateNames: ["工作日期"],
              personNames: ["填表人"],
            }
          : null,
      ].filter((s): s is CostSource => !!s && !s.data.stale && !s.data.error),
    [
      iCost.status,
      iCost.data,
      fCost.status,
      fCost.data,
      aCost.status,
      aCost.data,
    ],
  );
  const schedKnown = sched.status === "ok" && planningKnown(sched.data);
  const costKnown =
    costSources.length === 3 && costSources.every(costSourceKnown);
  const rosterError =
    people.status === "ok" && people.data ? rosterIssue(people.data) : null;
  const rows = useMemo(() => {
    if (people.status !== "ok" || !people.data || rosterError) return null;
    const roster = parseRoster(people.data);
    const dayStart = Date.parse(`${date}T00:00:00+08:00`);
    const planned =
      sched.status === "ok" && sched.data && !sched.data.stale && !sched.data.error
        ? scheduledPersonIds(sched.data, dayStart, dayStart + DAY)
        : new Set<string>();
    const logged = loggedPersonIds(costSources, taipeiDay(dayStart));
    const members = new Set(daily?.members ?? []);
    const punched = new Set<string>();
    for (const [rid, ds] of Object.entries(daily?.punch ?? {}))
      if (ds.includes(date)) punched.add(rid);
    const leaveByRecord = new Map<string, "leave" | "trip" | "out">();
    for (const [rid, list] of Object.entries(daily?.leave ?? {})) {
      const hit = list.find(
        (l) => l.date === date && ["leave", "trip", "out"].includes(l.kind),
      );
      if (hit) leaveByRecord.set(rid, hit.kind as "leave" | "trip" | "out");
    }
    return dailyStatus(
      roster,
      planned,
      logged,
      punched,
      members,
      leaveByRecord,
      { sched: schedKnown, cost: costKnown, attendance: dailyState === "ok" },
    );
  }, [
    people.status,
    people.data,
    rosterError,
    sched.status,
    sched.data,
    costSources,
    daily,
    dailyState,
    date,
    schedKnown,
    costKnown,
  ]);

  const title = (
    <div className="hr-card-head">
      <CalendarCheck2 size={16} />
      <h2>每日檢查</h2>
      <span className="muted small">完整名冊・預排／日誌／獨立打卡檢查</span>
    </div>
  );
  if (people.status === "forbidden")
    return (
      <section className="hr-card">
        {title}
        <p className="muted small">
          {people.error ?? "沒有查看人員名單的權限"}
          （每日檢查需要人事查看權限）。
        </p>
      </section>
    );
  if (!rows)
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

  const shown = onlyMissing ? rows.filter((r) => r.missing) : rows;
  const active = rows.filter((r) => !r.departedReason);
  const missingCount = active.filter((r) => r.missing).length;
  const leaveCount = active.filter((r) => r.leave).length;
  const exemptCount = active.filter((r) => r.exemptionReason).length;
  const attentionCount = active.filter(
    (r) => r.dataAttentionReasons.length,
  ).length;
  const noSignalCount = active.filter(
    (r) => r.noSignal && !r.exemptionReason,
  ).length;
  const compliantCount = active.filter((r) => r.compliant).length;
  const note = exemptionRosterNote(people.data);
  const exportCsv = () =>
    downloadCsv(
      `每日檢查_${date}.csv`,
      simpleCsv(
        [
          "姓名",
          "原始姓名",
          "組別",
          "檢核分類",
          "預排",
          "日誌",
          "打卡",
          "請假/出差/外出",
          "狀態",
          "原因",
          "資料注意",
        ],
        shown.map((r) => [
          r.name,
          r.rawName,
          r.group,
          r.classification,
          checkText(r, "planning"),
          checkText(r, "log"),
          r.departedReason
            ? "不檢核"
            : dailyState !== "ok"
              ? "未知"
              : r.isMember
                ? r.punched
                  ? "有"
                  : "無"
                : "不打卡",
          r.leave ? LEAVE_TEXT[r.leave] : "",
          statusText(r),
          reasonText(r),
          r.dataAttentionReasons.join("；"),
        ]),
        [
          `每日檢查 ${date}`,
          onlyMissing ? "只列有缺漏的" : "完整名冊（含豁免與離職 override）",
          `在職 ${active.length} 人、豁免 ${exemptCount} 人、缺漏 ${missingCount} 人、合規 ${compliantCount} 人`,
          "外業／業務／內業以外按內業檢核，須填預排＋日誌；豁免兩項皆免，打卡獨立。",
          note,
        ],
      ),
    );

  return (
    <section className="hr-card">
      {title}
      <div className="toolbar" style={{ gap: 12, flexWrap: "wrap" }}>
        <label className="tool tool-select">
          日期
          <select
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="選擇日期"
          >
            {days.map((d, i) => (
              <option key={d} value={d}>
                週{WD[i]} {d.slice(5).replace("-", "/")}
              </option>
            ))}
          </select>
        </label>
        <label className="switch" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
          />
          <span className="switch-ui" aria-hidden />
          只列有缺漏的
        </label>
        <div className="toolbar-right">
          <span className="count-text">
            在職 {active.length}・豁免 {exemptCount}・離職{" "}
            {rows.length - active.length}・缺漏 <strong>{missingCount}</strong>
            ・合規 {compliantCount}
          </span>
          <button
            className="tool"
            onClick={exportCsv}
            disabled={!shown.length}
            title="匯出 CSV"
          >
            <Download size={14} strokeWidth={1.75} /> 匯出
          </button>
        </div>
      </div>
      <p className="muted small">
        請假出差外出 {leaveCount}・無活動訊號 {noSignalCount}・資料注意{" "}
        {attentionCount}（原因旗標可能重疊，不可相加）。{note}
      </p>
      {dailyState !== "ok" && (
        <p className="warn-text small">
          打卡與請假資料{dailyState === "off" ? "載入中" : "讀取失敗或不完整"}
          ：打卡與假勤狀態未知，不能據此判合規。
        </p>
      )}
      {(!schedKnown || !costKnown) && (
        <p className="warn-text small">
          {!schedKnown && !costKnown
            ? "預排與成本單（日誌）"
            : !schedKnown
              ? "預排"
              : "成本單（日誌）"}
          資料尚未完整讀取或缺少必要欄位：無法確認的項目顯示「未知」，不判為已完成。
        </p>
      )}
      <div className="cg-sheet">
        <table>
          <thead>
            <tr>
              <th>姓名</th>
              <th>組別／分類</th>
              <th>預排</th>
              <th>日誌</th>
              <th>打卡</th>
              <th>請假/出差/外出</th>
              <th>狀態／原因／資料注意</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.recordId}>
                <td
                  className="att-name"
                  title={
                    r.rawName !== r.name ? `原始姓名：${r.rawName}` : undefined
                  }
                >
                  {r.name}
                </td>
                <td>
                  {r.group}
                  <div className="muted small">按{r.classification}檢核</div>
                </td>
                <td>
                  {r.departedReason ? (
                    <span className="muted small">離職</span>
                  ) : r.exemptionReason ? (
                    <span className="att-tag">豁免</span>
                  ) : r.plannedKnown ? (
                    r.planned ? (
                      yes
                    ) : (
                      no
                    )
                  ) : (
                    unknown
                  )}
                </td>
                <td>
                  {r.departedReason ? (
                    <span className="muted small">離職</span>
                  ) : r.exemptionReason ? (
                    <span className="att-tag">豁免</span>
                  ) : r.loggedKnown ? (
                    r.logged ? (
                      yes
                    ) : (
                      no
                    )
                  ) : (
                    unknown
                  )}
                </td>
                <td>
                  {r.departedReason ? (
                    <span className="muted small">—</span>
                  ) : dailyState !== "ok" ? (
                    unknown
                  ) : r.isMember ? (
                    r.punched ? (
                      yes
                    ) : (
                      no
                    )
                  ) : (
                    <span className="muted small">不打卡</span>
                  )}
                </td>
                <td>
                  {r.departedReason ? (
                    "—"
                  ) : dailyState !== "ok" ? (
                    unknown
                  ) : r.leave ? (
                    <span className="att-tag">{LEAVE_TEXT[r.leave]}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <span
                    className={
                      r.missing
                        ? "bad-text"
                        : r.dataAttentionReasons.length || r.noSignal
                          ? "warn-text"
                          : ""
                    }
                  >
                    {statusText(r)}
                  </span>
                  <div
                    className={`small ${r.dataAttentionReasons.length ? "warn-text" : "muted"}`}
                  >
                    {reasonText(r)}
                  </div>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={7} className="muted">
                  {onlyMissing
                    ? "目前沒有可確認的缺漏；未知、豁免與待確認狀態請取消篩選查看。"
                    : "這天沒有名冊資料。"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ul className="cg-notes">
        <li>
          除具名豁免與離職外，全部在職人員皆須填預排＋日誌，包含主管及
          PM／行政／IT／控制／圖報。外業／業務／內業以外按內業檢核，保留原組別；未填組別仍檢查並列資料注意。
        </li>
        <li>
          豁免的預排及日誌皆顯示「豁免」，理由為「JK
          確認免填預排」；離職另列。打卡獨立檢查，豁免不影響打卡要求。
        </li>
        <li>
          日誌＝當天有內業／外業／行政成本單（外業算組長與實際出工人）；預排＝當天工作預排「人員」（排除休假）。請假／出差／外出者保留原因、不列缺漏且不計合規；無活動訊號者顯示待確認，不計合規。
        </li>
        <li>
          資料範圍＝所選週，只看
          V3；打卡與請假需要人事查看權限。每日狀態僅代表所選日期，不推論整週是否有工作。
        </li>
      </ul>
    </section>
  );
}
