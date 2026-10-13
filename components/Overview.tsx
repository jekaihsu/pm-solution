"use client";
import Link from "next/link";
import { formatNumber } from "@/lib/aggregate";
import { resolveDateField, weeklyCounts } from "@/lib/metrics";
import { REPORTS, SOURCES, sourceByKey, type SourceDef } from "@/lib/reports";
import { weekName } from "@/lib/week";
import { showSource, useShell } from "./AppShell";
import Sparkline from "./Sparkline";
import { useSource, type SourceState } from "./useSource";

function statusText(s: SourceState): string {
  switch (s.status) {
    case "loading":
      return "載入中…";
    case "not-located":
      return "來源未定位";
    case "not-connected":
      return "未連接";
    case "no-demo":
      return "無示範";
    case "error":
      return "讀取失敗";
    default:
      return "";
  }
}

function SourceRow({ src, state, offset }: { src: SourceDef; state: SourceState; offset: number }) {
  const d = state.data;
  const field = d ? resolveDateField(src, d.fields) : undefined;
  const trend = d && field ? weeklyCounts(d, field, offset, 8) : null;
  const now = trend?.[trend.length - 1].count;
  const prev = trend?.[trend.length - 2].count;
  const diff = now !== undefined && prev !== undefined ? now - prev : null;
  const dot = state.status === "ok" ? (d?.stale ? "warn" : "good") : state.status === "error" ? "bad" : "";

  return (
    <li>
      <span className={`dot ${dot}`} aria-hidden />
      <span className="ov-src-name">
        {src.name}
        {src.version && <span className={`ver ver-${src.version}`}>{src.version.toUpperCase()}</span>}
      </span>
      {state.status !== "ok" || !d ? (
        <span className="ov-src-val muted">{statusText(state)}</span>
      ) : trend ? (
        <span className="ov-src-val">
          <Sparkline values={trend.map((t) => t.count)} labels={trend.map((t) => t.label)} height={20} />
          <strong>{formatNumber(now ?? 0)}</strong>
          {diff !== null && <span className="delta">{diff > 0 ? `▲${diff}` : diff < 0 ? `▼${-diff}` : "＝"}</span>}
        </span>
      ) : (
        <span className="ov-src-val">共 {formatNumber(d.total)} 筆</span>
      )}
    </li>
  );
}

export default function Overview() {
  const { week, version } = useShell();
  // SOURCES is a fixed list, so calling the hook per entry keeps hook order stable.
  const states = Object.fromEntries(SOURCES.map((s) => [s.key, useSource(s.key)]));

  return (
    <div>
      <header className="report-bar">
        <h1>週報總覽</h1>
        <span className="muted small ov-sub">
          {weekName(week.offset)} {week.label}・數字為本期筆數、▲▼ 與前週比較、小圖為近 8 週
        </span>
      </header>
      <p className="muted small ov-note">各報告視角不同，筆數不可跨報告相加（R01 與 R10 共用外業工作單）；V3 與 V4 分開計。</p>
      <div className="overview-grid">
        {REPORTS.map((r) => {
          const keys = r.sources.filter((key) => showSource(sourceByKey(key)!, version));
          return (
            <Link key={r.id} href={`/reports/${r.slug}`} className="ov-card">
              <div className="ov-top">
                <span className="rid">{r.id}</span>
                <h2>{r.name}</h2>
              </div>
              <ul className="ov-sources">
                {keys.map((key) => (
                  <SourceRow key={key} src={sourceByKey(key)!} state={states[key]} offset={week.offset} />
                ))}
              </ul>
              <div className="ov-foot">{r.pending.length} 項定義待確認 →</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
