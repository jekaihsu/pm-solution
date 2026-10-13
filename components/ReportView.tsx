"use client";
import { useEffect, useState } from "react";
import { sourceByKey, type ReportDef } from "@/lib/reports";
import { showSource, useShell } from "./AppShell";
import SourcePanel from "./SourcePanel";

export default function ReportView({ report }: { report: ReportDef }) {
  const { version } = useShell();
  const sources = report.sources
    .map(sourceByKey)
    .filter((s) => s !== undefined)
    .filter((s) => showSource(s, version));
  const [active, setActive] = useState(sources[0]?.key);
  const [showSpec, setShowSpec] = useState(false);
  const current = sources.find((s) => s.key === active) ?? sources[0];

  useEffect(() => {
    if (!sources.some((s) => s.key === active)) setActive(sources[0]?.key);
  }, [sources, active]);

  return (
    <div className="report">
      <header className="report-bar">
        <span className="rid-lg">{report.id}</span>
        <h1>{report.name}</h1>
        <button className={`tool ${showSpec ? "on" : ""}`} onClick={() => setShowSpec((s) => !s)} aria-expanded={showSpec}>
          ⓘ 報告說明
        </button>
      </header>

      {showSpec && (
        <div className="spec">
          <p className="purpose">{report.purpose}</p>
          <div className="spec-cols">
            <div>
              <h4>報告必備內容</h4>
              <ul>
                {report.mustHave.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>待確認定義（未定前不計算）</h4>
              <ul>
                {report.pending.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
          {sources.some((s) => s.version) && <p className="muted small">V3 與 V4 是不同系統的原始資料，分開列出，不相加也不去重。</p>}
        </div>
      )}

      {sources.length > 1 && (
        <nav className="sheet-tabs" role="tablist" aria-label="資料表">
          {sources.map((s) => (
            <button key={s.key} role="tab" aria-selected={s.key === current?.key} className={s.key === current?.key ? "active" : ""} onClick={() => setActive(s.key)}>
              {s.name}
              {s.version && <span className={`ver ver-${s.version}`}>{s.version.toUpperCase()}</span>}
            </button>
          ))}
        </nav>
      )}

      {current ? <SourcePanel key={current.key} reportId={report.id} source={current} /> : <div className="state-box">此版本沒有資料來源</div>}
    </div>
  );
}
