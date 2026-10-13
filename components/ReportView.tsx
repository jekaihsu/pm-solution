"use client";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { sourceByKey, type ReportDef } from "@/lib/reports";
import { showSource, useShell } from "./AppShell";
import GroupBoard, { BOARDS } from "./GroupBoard";
import EmptyState from "./EmptyState";
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
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <div className="eyebrow">報告 {report.id}</div>
          <h1>{report.name}</h1>
          <p className="page-sub">{report.purpose}</p>
        </div>
        <button className={`btn ${showSpec ? "on" : ""}`} onClick={() => setShowSpec((s) => !s)} aria-expanded={showSpec}>
          <Info size={15} strokeWidth={1.75} />
          報告定義
        </button>
      </header>

      {showSpec && (
        <div className="spec">
          <div>
            <h4>必備內容</h4>
            <ul>
              {report.mustHave.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>待確認定義 · 未定前不計算</h4>
            <ul className="pending">
              {report.pending.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          {sources.some((s) => s.version) && <p className="spec-note">V3 與 V4 是不同系統的原始資料，分開列出，不相加也不去重。</p>}
        </div>
      )}

      {report.id === "R01" || report.id === "R02" ? (
        <>
          <GroupBoard key={report.id} cfg={report.id === "R01" ? BOARDS.r01 : BOARDS.r02} />
          <details className="raw-data">
            <summary>查看原始資料表</summary>
            <div className="raw-data-body">
      {sources.length > 1 && (
        <nav className="tabs" role="tablist" aria-label="資料表">
          {sources.map((s) => (
            <button key={s.key} role="tab" aria-selected={s.key === current?.key} className={s.key === current?.key ? "active" : ""} onClick={() => setActive(s.key)}>
              {s.name}
              {s.version && <span className={`ver ver-${s.version}`}>{s.version.toUpperCase()}</span>}
            </button>
          ))}
        </nav>
      )}

      {current ? (
        <SourcePanel key={current.key} reportId={report.id} source={current} />
      ) : (
        <EmptyState kind="empty" title="此版本沒有資料來源">
          切換上方「全部／V3／V4」看看其他版本。
        </EmptyState>
      )}
            </div>
          </details>
        </>
      ) : (
        <>
      {sources.length > 1 && (
        <nav className="tabs" role="tablist" aria-label="資料表">
          {sources.map((s) => (
            <button key={s.key} role="tab" aria-selected={s.key === current?.key} className={s.key === current?.key ? "active" : ""} onClick={() => setActive(s.key)}>
              {s.name}
              {s.version && <span className={`ver ver-${s.version}`}>{s.version.toUpperCase()}</span>}
            </button>
          ))}
        </nav>
      )}

      {current ? (
        <SourcePanel key={current.key} reportId={report.id} source={current} />
      ) : (
        <EmptyState kind="empty" title="此版本沒有資料來源">
          切換上方「全部／V3／V4」看看其他版本。
        </EmptyState>
      )}
        </>
      )}
    </div>
  );
}
