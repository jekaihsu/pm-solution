"use client";
import { CalendarCheck, CircleAlert, Plane } from "lucide-react";
import { useEffect, useState } from "react";
import type { AttendanceResponse, DayCode } from "@/lib/attendanceCore";
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
  trip: ["出差", "", "出差（不計入應到）"],
  out: ["外出", "", "外出（不計入應到）"],
  off: ["—", "dim", "免打卡／非應打卡日"],
  none: ["—", "dim", "無資料"],
  future: ["", "dim", "尚未到"],
  pending: ["進行中", "dim", "今天尚未結束，缺卡不計"],
};
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
  const kpis: [string, number][] = ok
    ? [["應到人日", ok.summary.expected], ["出勤人日", ok.summary.present], ["遲到", ok.summary.late], ["早退", ok.summary.early], ["缺卡", ok.summary.lack], ["請假", ok.summary.leave], ["出差", ok.summary.trip], ["外出", ok.summary.out]]
    : [];

  return (
    <>
      <section className="hr-card">
        {head(<CalendarCheck size={16} />, "出勤紀錄")}
        {!ok ? (
          msg(true)
        ) : (
          <>
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
                  {ok.people.map((p) => (
                    <tr key={`${p.group}|${p.name}`}>
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
                <CircleAlert size={14} /> 預設口徑，待業主確認。分母＝考勤組成員（綁定人員＋展開綁定部門－排除名單）×應打卡日；外業同事不打卡，不列入。
              </li>
              <li>到班＝正常、遲到、早退與補卡（補卡、主管修正）；缺卡另計。請假、出差、外出的日子從分母扣除、另列天數（半天假也算 1 天）。本週未過完只算到今天，未來日不算缺卡，今天的缺卡顯示「進行中」。</li>
              <li>
                在職 {ok.notes.rosterInService} 人：{ok.notes.noAccount} 人沒有 Lark帳號、{ok.notes.unmapped} 人換不到 employee_id、考勤組另有 {ok.notes.outsideRoster} 人不在人員名單，皆不列入。
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
