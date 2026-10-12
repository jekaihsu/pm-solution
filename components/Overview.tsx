"use client";
import Link from "next/link";
import { REPORTS, SOURCES, sourceLabel, sourceByKey, type SourceDef } from "@/lib/reports";
import { weekName } from "@/lib/week";
import { showSource, useShell } from "./AppShell";
import { useSource, type SourceState } from "./useSource";

function weekCount(src: SourceDef, s: SourceState, start: number, end: number): { n: number; field: string } | null {
  const d = s.data;
  if (s.status !== "ok" || !d) return null;
  const field = d.fields.find((f) => f.name === src.dateField && f.kind === "date") ?? d.fields.find((f) => f.kind === "date");
  if (!field) return null;
  const n = d.records.filter((r) => {
    const v = r.fields[field.name];
    return typeof v === "number" && v >= start && v < end;
  }).length;
  return { n, field: field.name };
}

export default function Overview() {
  const { week, version } = useShell();
  // SOURCES is a fixed list, so calling the hook per entry keeps hook order stable.
  const states = Object.fromEntries(SOURCES.map((s) => [s.key, { src: s, state: useSource(s.key) }]));

  return (
    <div>
      <header className="report-head">
        <div>
          <h1>週報總覽</h1>
          <p className="purpose">
            {weekName(week.offset)} {week.label}（Asia/Taipei，週一至週日）。各報告視角不同，筆數不可跨報告相加：R01 與 R10 共用外業工作單。V3 與 V4 分開計，不相加。
          </p>
        </div>
      </header>
      <div className="overview-grid">
        {REPORTS.map((r) => (
          <Link key={r.id} href={`/reports/${r.slug}`} className="ov-card">
            <div className="ov-top">
              <span className="rid">{r.id}</span>
              <h2>{r.name}</h2>
            </div>
            <ul className="ov-sources">
              {r.sources.filter((key) => showSource(sourceByKey(key)!, version)).map((key) => {
                const { src, state } = states[key];
                const wc = weekCount(src, state, week.start, week.end);
                return (
                  <li key={key}>
                    <span className={`dot ${state.status === "ok" ? (state.data?.stale ? "warn" : "good") : state.status === "error" ? "bad" : ""}`} aria-hidden />
                    <span className="ov-src-name">{sourceLabel(src)}</span>
                    <span className="ov-src-val">
                      {state.status === "ok" && state.data
                        ? wc
                          ? `本期 ${wc.n} 筆`
                          : `共 ${state.data.total} 筆`
                        : state.status === "loading"
                          ? "…"
                          : state.status === "not-located"
                            ? "來源未定位"
                            : state.status === "not-connected"
                              ? "未連接"
                              : state.status === "no-demo"
                                ? "無示範"
                                : "讀取失敗"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="ov-foot">{r.pending.length} 項定義待確認</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
