"use client";
import { CalendarCheck, CircleAlert, Plane } from "lucide-react";
import { useEffect, useState } from "react";
import { fieldCostReminder, fieldCostWarning, type AttendanceResponse, type DayCode } from "@/lib/attendanceCore";
import { weekName } from "@/lib/week";
import { useShell } from "./AppShell";

// R04 出勤紀錄＋出差紀錄（Lark 假勤）。兩張卡共用一次讀取。口徑為預設，待業主確認。
const LABEL: Record<DayCode, [text: string, tone: string, title: string]> = {
  ok: ["到班", "ok", "到班"],
  late: ["遲到", "warn", "遲到"],
  early: ["早退", "warn", "早退"],
  "late-early": ["遲到早退", "warn", "遲到且早退"],
  lack: ["缺卡", "bad", "缺卡"],
  leave: ["請假", "", "請假（不計入應到）"],
  "leave-half": ["半天假", "", "半天假（請假 0.5 天）；另半天正常：考勤組有打卡、外業有日報，計應到與到班各 0.5"],
  "leave-half-open": ["半天假（另半天無紀錄）", "", "半天假（請假 0.5 天）；另半天沒有打卡證據（Lark 兩側都標請假、當天沒紀錄、或今天下午還沒結束），另半天不入應到，只計請假 0.5"],
  "leave-half-late": ["半天假・遲到", "warn", "半天假（請假 0.5 天）；另半天遲到（有打卡，計應到與到班各 0.5，遲到計 1 次）"],
  "leave-half-early": ["半天假・早退", "warn", "半天假（請假 0.5 天）；另半天早退（有打卡，計應到與到班各 0.5，早退計 1 次）"],
  "leave-half-late-early": ["半天假・遲到早退", "warn", "半天假（請假 0.5 天）；另半天遲到且早退（計應到與到班各 0.5，遲到、早退各計 1 次）"],
  "leave-half-nofield": ["半天假（無日報）", "", "外業半天假（請假 0.5 天）；當天沒有外業成本單（日報），另半天不入應到，只計請假 0.5"],
  "leave-half-lack": ["半天假・缺卡", "bad", "半天假（請假 0.5 天）；另半天缺卡，計應到 0.5、缺卡 0.5"],
  trip: ["出差", "", "出差（不計入應到）"],
  out: ["外出", "", "外出（不計入應到）"],
  off: ["—", "dim", "免打卡／非應打卡日"],
  none: ["—", "dim", "無資料"],
  future: ["", "dim", "尚未到"],
  field: ["外業出勤", "ok", "外業不打卡：這天有外業成本單（日報）＝出勤，計入應到與到班"],
  nofield: ["無日報", "dim", "外業這天沒有成本單（日報），也沒有請假／出差／外出：不列入應到，也不算缺卡（待確認）"],
};
// 人日可能有 0.5（半天假），最多顯示 1 位小數
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1));
const pct = (a: number, b: number) => (b > 0 ? `${(Math.round((a / b) * 1000) / 10).toFixed(1)}%` : "—");
const WD = ["一", "二", "三", "四", "五", "六", "日"];

type State = { tag: string; res?: AttendanceResponse; error?: string };

function Pending({ res }: { res: Extract<AttendanceResponse, { status: "needs-permission" }> }) {
  return (
    <div className="hr-pending">
      <p>出勤／出差需要 PM週報 開通假勤與通訊錄唯讀權限（交由管理員處理中）。</p>
      {res.missing.length > 0 && (
        <p>
          缺少：
          {res.missing.map((m) => (
            <code key={m} className="mono" style={{ marginRight: 6 }}>
              {m}
            </code>
          ))}
        </p>
      )}
      <p className="muted small">{res.hint}完成前不顯示任何出勤資料。</p>
    </div>
  );
}

export default function AttendanceCards() {
  const { week, demo, tick, manual } = useShell();
  const tag = `${week.start}|${demo}`;
  const [state, setState] = useState<State>({ tag: "" });
  useEffect(() => {
    let off = false;
    const qs = new URLSearchParams({ week: String(week.start) });
    if (demo) qs.set("demo", "1");
    if (tick > 0 && manual) qs.set("refresh", "1");
    fetch(`/api/attendance?${qs}`)
      .then((r) => r.json())
      .then((res: AttendanceResponse) => !off && setState({ tag, res }))
      .catch((e) => !off && setState({ tag, error: String(e) }));
    return () => {
      off = true;
    };
  }, [tag, week.start, demo, tick, manual]);

  const cur = state.tag === tag ? state : null;
  const res = cur?.res;
  const head = (icon: React.ReactNode, title: string) => (
    <div className="hr-card-head">
      {icon}
      <h2>{title}</h2>
      <span className="muted small">
        {weekName(week.offset)} {week.label}
      </span>
    </div>
  );
  const msg = (full: boolean) => {
    if (!cur) return <p className="muted small">載入中…</p>;
    if (cur.error || !res) return <p className="bad-text small">讀取失敗{cur.error ? `：${cur.error}` : ""}</p>;
    if (res.status === "needs-permission") return full ? <Pending res={res} /> : <p className="muted small">同「出勤紀錄」，待假勤權限開通。</p>;
    if (res.status === "forbidden") return <p className="muted small">{res.error ?? "沒有查看權限"}</p>;
    if (res.status === "not-connected") return <p className="muted small">尚未連接 Lark（伺服器未設定應用憑證）</p>;
    if (res.status === "error") return <p className="bad-text small">讀取失敗：{res.error}</p>;
    return null;
  };
  const ok = res?.status === "ok" ? res : null;
  const warn = ok ? fieldCostWarning(ok) : null;
  const reminder = ok ? fieldCostReminder(ok) : null;
  const kpis: [string, string][] = ok
    ? [["應到人日", fmt(ok.summary.expected)], ["出勤人日", fmt(ok.summary.present)], ["出勤率", pct(ok.summary.present, ok.summary.expected)], ["其中外業出勤", fmt(ok.summary.field)], ["遲到", fmt(ok.summary.late)], ["早退", fmt(ok.summary.early)], ["缺卡", fmt(ok.summary.lack)], ["請假", fmt(ok.summary.leave)], ["出差", fmt(ok.summary.trip)], ["外出", fmt(ok.summary.out)]]
    : [];

  return (
    <>
      <section className="hr-card">
        {head(<CalendarCheck size={16} />, "出勤紀錄")}
        {!ok ? (
          msg(true)
        ) : (
          <>
            {warn && <p className="small warn-text strong">{warn}。外業人員的出勤可能被低估，請對照 Lark 外業成本單。</p>}
            <div className="att-kpis">
              {kpis.map(([k, v]) => (
                <div key={k} className="att-kpi">
                  <span>{k}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
            <div className="cg-sheet">
              <table>
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>組別</th>
                    {ok.days.map((d, i) => (
                      <th key={d.date}>
                        週{WD[i]}
                        <small>{d.date.slice(5).replace("-", "/")}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ok.people.map((p, pi) => (
                    <tr key={`${pi}|${p.group}|${p.name}`}>
                      <td className="att-name">{p.name}</td>
                      <td>{p.group}</td>
                      {p.days.map((c, i) => (
                        <td key={i}>
                          <span className={`att-tag ${LABEL[c][1]}`} title={LABEL[c][2]}>
                            {LABEL[c][0]}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {ok.people.length === 0 && (
                    <tr>
                      <td colSpan={9} className="muted">
                        考勤組沒有對得上人員名單的人。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <ul className="cg-notes">
              <li>
                <CircleAlert size={14} /> 口徑（業主 2026-10-13 確認）：分母＝考勤組成員（綁定人員＋展開綁定部門－排除名單）×應打卡日，加上外業人員。外業不打卡，以「有外業成本單（日報）的日子」當出勤（成本單的組長與實際出工人都算，組長開單代表全組）；外業人員＝不在任何考勤組、本週有成本單的在職同事（{ok.notes.fieldPeople} 人，不需要 Lark帳號；其中 {ok.notes.fieldNoApproval} 人沒有 employee_id，查不到請假／出差／外出審批，這些日子照成本單算）。
              </li>
              <li>
                外業沒填日報的日子不列入應到、也不算缺卡（待確認，格子顯示「無日報」）；外業在平日請假、出差、外出照樣從分母扣除。
                {ok.notes.fieldSheets === undefined ? "" : `本週到今天的外業成本單 ${ok.notes.fieldSheets} 筆；成本單裡有 ${ok.notes.fieldUnmatched} 位對不到在職名冊，不列入。整張成本單（不分週）工作日期空白 ${ok.notes.fieldNoDate ?? 0} 筆，其中日期、組長、實際出工人全空 ${ok.notes.fieldAllEmpty ?? 0} 筆（平常約 6 筆，暴增可能是 Lark 回了空白頁）。`}
              </li>
              <li>到班＝正常、遲到、早退與補卡（補卡、主管修正）；缺卡另計，今天沒打卡也算缺卡（今天已打上班卡、下班還沒到不算缺卡）。請假、出差、外出的日子從分母扣除、另列天數。請假依請假時刻判斷涵蓋上午（到 12:00）或下午（13:00 起）：只涵蓋一半算 0.5 天（請假 0.5、應到 0.5），另半天考勤組看打卡（忽略請假那半邊的打卡；正常算到班 0.5、缺卡算缺卡 0.5），外業看當天有沒有成本單；今天上午假而下午還沒結束、上班側也沒打卡時，另半天不入應到、不算缺卡，只計請假 0.5；只請午休不算請假；只有日期沒有時刻的單日半天假不分上下午（今天的這種假比照上午假）。半天假同日又有出差／外出，一律整天算出差／外出（請假不重複計）；整天假、出差、外出落在平日但 Lark 沒有打卡紀錄，照樣計入並從分母扣除；週末、補假等純免打卡日的請假不計。本週未過完只算到今天，未來日不算缺卡。</li>
              {reminder && <li>{reminder}。</li>}
              {!!ok.notes.rosterShared && <li>人員名單有 {ok.notes.rosterShared} 列和別列共用同一 Lark帳號但名字不同（在職的已併為同一人、離職舊列不併入），請檢查名單。</li>}
              <li>
                在職 {ok.notes.rosterInService} 人：{ok.notes.noAccount} 人沒有 Lark帳號、{ok.notes.unmapped} 人換不到 employee_id（以上除非是有成本單的外業人員，否則不列入）、考勤組另有 {ok.notes.outsideRoster} 人不在人員名單，不列入。
                {ok.source === "demo" ? "（示範資料）" : ""}
              </li>
            </ul>
          </>
        )}
      </section>

      <section className="hr-card">
        {head(<Plane size={16} />, "出差／外出紀錄")}
        {!ok ? (
          msg(false)
        ) : (
          <>
            <p className="small">
              出差 <b>{ok.recordCounts.trips}</b> 張、外出 <b>{ok.recordCounts.outs}</b> 張
            </p>
            {ok.records.length ? (
              <div className="cg-detail">
                <table>
                  <thead>
                    <tr>
                      <th>類型</th>
                      <th>姓名</th>
                      <th>組別</th>
                      <th>起～訖</th>
                      <th className="num">時長</th>
                      <th>事由</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ok.records.map((t, i) => (
                      <tr key={i}>
                        <td>{t.kind === "trip" ? "出差" : "外出"}</td>
                        <td className="strong">{t.name}</td>
                        <td>{t.group}</td>
                        <td>{t.timeText}</td>
                        <td className="num">
                          {t.duration} {t.unit}
                        </td>
                        <td className="att-reason">{t.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted small">本週沒有已通過的出差或外出單。</p>
            )}
            <p className="muted small">
              預設口徑，待業主確認。只計已通過；範圍＝全公司有出差或外出單的人（不限考勤組，名冊在職且有 Lark帳號）；與所選週有重疊的都列出，依開始時間排序，張數以審批單號去重。出差時長＝天數（含起訖日）；外出時長＝審批時數，四捨五入到 0.5 小時。事由原文顯示、超過 40 字截斷。出勤紀錄的統計不變（外出仍從分母扣除）。
            </p>
          </>
        )}
      </section>
    </>
  );
}
