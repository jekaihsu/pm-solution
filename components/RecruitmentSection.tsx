"use client";
import { ExternalLink, Filter, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { summarizeRecruitment, sumStatRows, type RecruitmentStatRow } from "@/lib/recruitment";
import { useShell } from "./AppShell";
import { useSource } from "./useSource";

const POOL_BASE_URL = "https://yong-xiang-survey.jp.larksuite.com/base/PQYybxyGHaQwIjsG7goj5gQSpte?table=tblIxj9iPY0fKFzF";
const POOL_MANAGER_URL = "https://yong-xiang-survey.jp.larksuite.com/base/PQYybxyGHaQwIjsG7goj5gQSpte?table=tblIxj9iPY0fKFzF&view=vewMkRjOqx";

const cellText = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export default function RecruitmentSection() {
  const { week } = useShell();
  const hrSource = useSource("hr");
  const [onlyPending, setOnlyPending] = useState(false);

  const summary = useMemo(() => {
    const liveRecords =
      hrSource.status === "ok" && hrSource.data?.records
        ? (hrSource.data.records as { id: string; fields: Record<string, unknown> }[])
        : undefined;
    return summarizeRecruitment(liveRecords, week.start, week.end);
  }, [hrSource.status, hrSource.data, week.start, week.end]);

  const rawRows: RecruitmentStatRow[] = summary.liveRows;
  const shownRows = onlyPending ? rawRows.filter((r) => (r.unnotified ?? 0) > 0) : rawRows;
  const shownTotal = sumStatRows(shownRows, "合計");

  return (
    <section className="hr-card">
      <div className="hr-card-head">
        <UserPlus size={16} />
        <h2>招聘數據（104履歷統計）</h2>
        <span className="muted small">所選週應徵資料{hrSource.data?.source === "demo" ? "（示範資料）" : hrSource.status !== "ok" ? "（資料尚未取得）" : ""}</span>
      </div>

      {/* 頂部 4 個週會核心摘要卡片 */}
      <div className="kpis hr-kpis">
        <div className="kpi">
          <div className="kpi-label">本週新應徵人數</div>
          <div className="kpi-value">{summary.weeklyNewCount}</div>

        </div>
        <div className="kpi">
          <div className="kpi-label">安排面試人數（答應邀約）</div>
          <div className="kpi-value">{summary.interviewCount}</div>
          <div className="kpi-sub">
            邀約成功率 {summary.notifiedCount > 0 ? `${((summary.interviewCount / summary.notifiedCount) * 100).toFixed(1)}%` : "—"}｜婉拒 {summary.baselineDeclined} 人・未接/未回電 {summary.baselineNoanswer} 人
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">已通知人數</div>
          <div className="kpi-value">{summary.notifiedCount}</div>
          <div className="kpi-sub">
            通知率 {summary.baselineTotal > 0 ? `${((summary.notifiedCount / summary.baselineTotal) * 100).toFixed(1)}%` : "—"}｜尚有未通知 {summary.unnotifiedCount} 人
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">最終入職人數（已發Offer）</div>
          <div className="kpi-value">{summary.hiredCount}</div>
          <div className="kpi-sub">{summary.hiredNames.join("、")}</div>
        </div>
      </div>

      {/* 工具列：切換統計模式、篩選未通知、快速跳轉 Lark Base */}
      <div className="toolbar" style={{ gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <label className="switch" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
          <span className="switch-ui" aria-hidden />
          <Filter size={13} strokeWidth={1.9} /> 只看有「未通知」職缺
        </label>

        <div className="toolbar-right" style={{ gap: 8, display: "flex", flexWrap: "wrap" }}>
          <a
            className="pill pill-good"
            href={POOL_MANAGER_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}
          >
            <ExternalLink size={13} strokeWidth={1.9} /> 👔 主管專用視圖
          </a>
          <a
            className="pill"
            href={POOL_BASE_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}
          >
            <ExternalLink size={13} strokeWidth={1.9} /> 01 招聘候選人池總表
          </a>
        </div>
      </div>

      {/* JK 指定《104履歷統計》7 欄標準色塊矩陣表 */}
      <div style={{ overflowX: "auto", marginBottom: 12 }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 15,
            background: "#ffffff",
            color: "#111827",
            border: "1px solid #bdbdbd",
            fontFamily: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
          }}
        >
          <thead>
            <tr>
              <th
                colSpan={7}
                style={{
                  background: "#ffffff",
                  color: "#111827",
                  fontSize: 18,
                  fontWeight: 700,
                  textAlign: "center",
                  padding: "10px 12px",
                  border: "1px solid #bdbdbd",
                  letterSpacing: "0.04em",
                }}
              >
                104履歷統計（本週）
              </th>
            </tr>
            <tr>
              <th
                style={{
                  background: "#ead1dc",
                  color: "#111827",
                  fontWeight: 700,
                  textAlign: "left",
                  padding: "8px 14px",
                  border: "1px solid #bdbdbd",
                  minWidth: 260,
                }}
              >
                職位
              </th>
              <th
                style={{
                  background: "#f4cccc",
                  color: "#111827",
                  fontWeight: 700,
                  textAlign: "center",
                  padding: "8px 14px",
                  border: "1px solid #bdbdbd",
                  width: 110,
                }}
              >
                總數量
              </th>
              <th
                style={{
                  background: "#d9ead3",
                  color: "#111827",
                  fontWeight: 700,
                  textAlign: "center",
                  padding: "8px 14px",
                  border: "1px solid #bdbdbd",
                  width: 110,
                }}
              >
                未通知
              </th>
              <th
                style={{
                  background: "#cfe2f3",
                  color: "#111827",
                  fontWeight: 700,
                  textAlign: "center",
                  padding: "8px 14px",
                  border: "1px solid #bdbdbd",
                  width: 110,
                }}
              >
                已通知
              </th>
              <th
                style={{
                  background: "#cfe2f3",
                  color: "#111827",
                  fontWeight: 700,
                  textAlign: "center",
                  padding: "8px 14px",
                  border: "1px solid #bdbdbd",
                  width: 110,
                }}
              >
                答應邀約
              </th>
              <th
                style={{
                  background: "#cfe2f3",
                  color: "#111827",
                  fontWeight: 700,
                  textAlign: "center",
                  padding: "8px 14px",
                  border: "1px solid #bdbdbd",
                  width: 110,
                }}
              >
                婉拒
              </th>
              <th
                style={{
                  background: "#cfe2f3",
                  color: "#111827",
                  fontWeight: 700,
                  textAlign: "center",
                  padding: "8px 14px",
                  border: "1px solid #bdbdbd",
                  width: 120,
                }}
              >
                未接/未回電
              </th>
            </tr>
          </thead>
          <tbody>
            {shownRows.map((r) => (
              <tr key={r.role}>
                <td
                  style={{
                    background: "#ffffff",
                    color: "#111827",
                    fontWeight: 500,
                    textAlign: "left",
                    padding: "8px 14px",
                    border: "1px solid #bdbdbd",
                  }}
                >
                  {r.role}
                </td>
                <td
                  style={{
                    background: "#f4cccc",
                    color: "#111827",
                    fontWeight: 700,
                    textAlign: "center",
                    padding: "8px 14px",
                    border: "1px solid #bdbdbd",
                  }}
                >
                  {cellText(r.total)}
                </td>
                <td
                  style={{
                    background: "#d9ead3",
                    color: "#111827",
                    fontWeight: 700,
                    textAlign: "center",
                    padding: "8px 14px",
                    border: "1px solid #bdbdbd",
                  }}
                >
                  {cellText(r.unnotified)}
                </td>
                <td
                  style={{
                    background: "#cfe2f3",
                    color: "#111827",
                    fontWeight: 500,
                    textAlign: "center",
                    padding: "8px 14px",
                    border: "1px solid #bdbdbd",
                  }}
                >
                  {cellText(r.notified)}
                </td>
                <td
                  style={{
                    background: "#cfe2f3",
                    color: "#111827",
                    fontWeight: 500,
                    textAlign: "center",
                    padding: "8px 14px",
                    border: "1px solid #bdbdbd",
                  }}
                >
                  {cellText(r.accepted)}
                </td>
                <td
                  style={{
                    background: "#cfe2f3",
                    color: "#111827",
                    fontWeight: 500,
                    textAlign: "center",
                    padding: "8px 14px",
                    border: "1px solid #bdbdbd",
                  }}
                >
                  {cellText(r.declined)}
                </td>
                <td
                  style={{
                    background: "#cfe2f3",
                    color: "#111827",
                    fontWeight: 500,
                    textAlign: "center",
                    padding: "8px 14px",
                    border: "1px solid #bdbdbd",
                  }}
                >
                  {cellText(r.noanswer)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td
                style={{
                  background: "#f3f4f6",
                  color: "#111827",
                  fontWeight: 700,
                  textAlign: "left",
                  padding: "8px 14px",
                  border: "1px solid #bdbdbd",
                }}
              >
                {shownTotal.role}
              </td>
              <td
                style={{
                  background: "#ea9999",
                  color: "#111827",
                  fontWeight: 700,
                  textAlign: "center",
                  padding: "8px 14px",
                  border: "1px solid #bdbdbd",
                }}
              >
                {cellText(shownTotal.total)}
              </td>
              <td
                style={{
                  background: "#b6d7a8",
                  color: "#111827",
                  fontWeight: 700,
                  textAlign: "center",
                  padding: "8px 14px",
                  border: "1px solid #bdbdbd",
                }}
              >
                {cellText(shownTotal.unnotified)}
              </td>
              <td
                style={{
                  background: "#9fc5e8",
                  color: "#111827",
                  fontWeight: 700,
                  textAlign: "center",
                  padding: "8px 14px",
                  border: "1px solid #bdbdbd",
                }}
              >
                {cellText(shownTotal.notified)}
              </td>
              <td
                style={{
                  background: "#9fc5e8",
                  color: "#111827",
                  fontWeight: 700,
                  textAlign: "center",
                  padding: "8px 14px",
                  border: "1px solid #bdbdbd",
                }}
              >
                {cellText(shownTotal.accepted)}
              </td>
              <td
                style={{
                  background: "#9fc5e8",
                  color: "#111827",
                  fontWeight: 700,
                  textAlign: "center",
                  padding: "8px 14px",
                  border: "1px solid #bdbdbd",
                }}
              >
                {cellText(shownTotal.declined)}
              </td>
              <td
                style={{
                  background: "#9fc5e8",
                  color: "#111827",
                  fontWeight: 700,
                  textAlign: "center",
                  padding: "8px 14px",
                  border: "1px solid #bdbdbd",
                }}
              >
                {cellText(shownTotal.noanswer)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 本週應徵與面試候選人明細表（僅展示所選週） */}
      <div className="cg-detail" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
          本週候選人明細（{summary.recentCandidates.length} 人）
        </div>
        <table>
          <thead>
            <tr>
              <th>應徵日期</th>
              <th>候選人</th>
              <th>性別</th>
              <th>年齡</th>
              <th>應徵職缺</th>
              <th>分派部門</th>
              <th>104聯絡狀態</th>
              <th>部門主管是否面試</th>
              <th>約定面試時間</th>
              <th>面試評價與錄取結果</th>
            </tr>
          </thead>
          <tbody>
            {summary.recentCandidates.length === 0 ? (
              <tr>
                <td colSpan={10} className="muted" style={{ textAlign: "center" }}>
                  本週尚無應徵或面試候選人紀錄
                </td>
              </tr>
            ) : (
              summary.recentCandidates.map((c) => (
                <tr key={c.id}>
                  <td>{c.applyDate || "—"}</td>
                  <td><b>{c.name}</b></td>
                  <td>{c.gender}</td>
                  <td>{c.age}</td>
                  <td>{c.role}</td>
                  <td>{c.dept || "—"}</td>
                  <td>{c.contactStatus}</td>
                  <td>{c.managerConfirm}</td>
                  <td>{c.interviewTime || "—"}</td>
                  <td>{c.evalResult || "待面試"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ul className="cg-notes">
        <li>
          <UserPlus size={14} /> 統計所選週應徵者目前的聯絡及面試狀態。
        </li>
      </ul>
    </section>
  );
}
