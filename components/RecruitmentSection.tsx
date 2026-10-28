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
  const [dataMode, setDataMode] = useState<"104_baseline" | "lark_live">("104_baseline");
  const [onlyPending, setOnlyPending] = useState(false);

  const summary = useMemo(() => {
    const liveRecords =
      hrSource.status === "ok" && hrSource.data?.source !== "demo" && hrSource.data?.records?.length
        ? (hrSource.data.records as { id: string; fields: Record<string, unknown> }[])
        : undefined;
    return summarizeRecruitment(liveRecords, week.start);
  }, [hrSource.status, hrSource.data, week.start]);

  const rawRows: RecruitmentStatRow[] = dataMode === "104_baseline" ? summary.baselineRows : summary.liveRows;
  const shownRows = onlyPending ? rawRows.filter((r) => (r.unnotified ?? 0) > 0) : rawRows;
  const shownTotal = sumStatRows(shownRows, "合計");

  return (
    <section className="hr-card">
      <div className="hr-card-head">
        <UserPlus size={16} />
        <h2>招聘數據（104履歷統計）</h2>
        <span className="muted small">
          串接 Lark Base《人事系統 · 01 招聘候選人池》（{hrSource.status === "ok" && hrSource.data?.source !== "demo" ? "即時連線" : "已同步最新池內 89 筆候選人紀錄"}）
        </span>
      </div>

      {/* 頂部 4 個週會核心摘要卡片 */}
      <div className="kpis hr-kpis">
        <div className="kpi">
          <div className="kpi-label">本週新應徵人數</div>
          <div className="kpi-value">{summary.weeklyNewCount}</div>
          <div className="kpi-sub">
            104履歷統計總數 {summary.baselineTotal} 人｜Lark 候選人池累計 {summary.totalActivePool} 人
          </div>
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
        <div className="cg-picker" role="group" aria-label="資料顯示模式" style={{ margin: 0 }}>
          <button
            className={`cg-chip ${dataMode === "104_baseline" ? "on" : ""}`}
            onClick={() => setDataMode("104_baseline")}
            aria-pressed={dataMode === "104_baseline"}
          >
            104履歷統計報表（69份）
          </button>
          <button
            className={`cg-chip ${dataMode === "lark_live" ? "on" : ""}`}
            onClick={() => setDataMode("lark_live")}
            aria-pressed={dataMode === "lark_live"}
          >
            Lark 候選人池全量展開（{summary.totalActivePool}人）
          </button>
        </div>

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
            <ExternalLink size={13} strokeWidth={1.9} /> 👔 主管專用視圖（Lark Base）
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
                104履歷統計
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

      <ul className="cg-notes">
        <li>
          <UserPlus size={14} /> 資料來源：《104履歷統計》與《人事系統 · 01 招聘候選人池》。主管審閱履歷請點右上角「👔 主管專用視圖」，在「主管確認要不要面試（是否需要一面）」選擇「需要面試」並填寫「主管可配合時段（請填 3 個）」，系統即自動通知行政羅薇安排面試。
        </li>
      </ul>
    </section>
  );
}
