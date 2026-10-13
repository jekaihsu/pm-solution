"use client";
import { ArrowDownRight, ArrowUpRight, ChevronRight, CircleDashed, Minus } from "lucide-react";
import Link from "next/link";
import { formatNumber } from "@/lib/aggregate";
import { resolveDateField, weeklyCounts } from "@/lib/metrics";
import { REPORTS, SOURCES, isLocated, sourceByKey, type SourceDef } from "@/lib/reports";
import { weekName } from "@/lib/week";
import { showSource, useShell } from "./AppShell";
import Sparkline from "./Sparkline";
import { useSource, type SourceState } from "./useSource";

const STATUS: Record<string, string> = {
  loading: "載入中",
  "not-located": "未定位",
  "not-connected": "未連接",
  "no-demo": "無示範",
  error: "讀取失敗",
};

function SourceRow({ src, state, offset }: { src: SourceDef; state: SourceState; offset: number }) {
  const d = state.data;
  const field = d ? resolveDateField(src, d.fields) : undefined;
  const trend = d && field ? weeklyCounts(d, field, offset, 8) : null;
  const now = trend?.[trend.length - 1].count;
  const prev = trend?.[trend.length - 2].count;
  const diff = now !== undefined && prev !== undefined ? now - prev : null;
  const Icon = diff === null ? null : diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;

  return (
    <li className="ov-row">
      <span className="ov-name">
        {src.name}
        {src.version && <span className={`ver ver-${src.version}`}>{src.version.toUpperCase()}</span>}
      </span>
      {state.status !== "ok" || !d ? (
        <span className={`pill ${state.status === "error" ? "pill-bad" : ""}`}>{STATUS[state.status] ?? state.status}</span>
      ) : trend ? (
        <>
          <Sparkline values={trend.map((t) => t.count)} labels={trend.map((t) => t.label)} height={18} />
          <span className="ov-num">{formatNumber(now ?? 0)}</span>
          {Icon && (
            <span className="ov-delta">
              <Icon size={12} strokeWidth={2} />
              {diff !== 0 && Math.abs(diff!)}
            </span>
          )}
        </>
      ) : (
        <span className="ov-num muted">{formatNumber(d.total)} 筆</span>
      )}
    </li>
  );
}

export default function Overview() {
  const { week, version } = useShell();
  // SOURCES is a fixed list, so calling the hook per entry keeps hook order stable.
  const states = Object.fromEntries(SOURCES.map((s) => [s.key, useSource(s.key, { only: "dates" })]));
  // Optional reference tables (no report depends on them) are counted apart.
  const located = SOURCES.filter((s) => isLocated(s) && !s.optional);
  const ok = located.filter((s) => states[s.key].status === "ok").length;
  const failed = located.filter((s) => states[s.key].status === "error").length;
  const optionalFailed = SOURCES.filter((s) => s.optional && isLocated(s) && states[s.key].status === "error").length;
  const latest = Math.max(0, ...located.map((s) => states[s.key].data?.fetchedAt ?? 0));

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <div className="eyebrow">
            {weekName(week.offset)} · {week.label}
          </div>
          <h1>週報總覽</h1>
          <p className="page-sub">每張報告的資料來源、本期筆數與近 8 週趨勢。各報告視角不同，筆數不跨報告相加；V3 與 V4 分開計。</p>
        </div>
      </header>

      <div className="stat-strip">
        <div className="stat">
          <span className="stat-label">已連線資料表</span>
          <span className="stat-value">
            {ok}
            <span className="muted"> / {located.length}</span>
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">讀取失敗</span>
          <span className={`stat-value ${failed ? "bad-text" : ""}`}>{failed}</span>
          {optionalFailed > 0 && <span className="muted small">另有 {optionalFailed} 個非必要參照表讀不到</span>}
        </div>
        <div className="stat">
          <span className="stat-label">尚未定位的來源</span>
          <span className="stat-value">{SOURCES.length - located.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">最近更新</span>
          <span className="stat-value small-value">{latest ? new Date(latest).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
        </div>
      </div>

      <div className="overview-grid">
        {REPORTS.map((r) => {
          const keys = r.sources.filter((key) => showSource(sourceByKey(key)!, version));
          return (
            <Link key={r.id} href={`/reports/${r.slug}`} className="ov-card">
              <div className="ov-head">
                <span className="rid">{r.id}</span>
                <h2>{r.name}</h2>
                <ChevronRight size={16} className="ov-chevron" />
              </div>
              <ul className="ov-list">
                {keys.map((key) => (
                  <SourceRow key={key} src={sourceByKey(key)!} state={states[key]} offset={week.offset} />
                ))}
              </ul>
              <div className="ov-foot">
                <CircleDashed size={13} strokeWidth={1.75} />
                {r.pending.length} 項定義待確認
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
