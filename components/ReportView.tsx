"use client";
import { sourceByKey, type ReportDef } from "@/lib/reports";
import { showSource, useShell } from "./AppShell";
import SourcePanel from "./SourcePanel";

export default function ReportView({ report }: { report: ReportDef }) {
  const { version } = useShell();
  const sources = report.sources
    .map(sourceByKey)
    .filter((s) => s !== undefined)
    .filter((s) => showSource(s, version));
  return (
    <div className="report">
      <header className="report-head">
        <div className="rid-lg">{report.id}</div>
        <div>
          <h1>{report.name}</h1>
          <p className="purpose">{report.purpose}</p>
        </div>
      </header>

      <div className="spec">
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
          <ul className="pending">
            {report.pending.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>

      {version === "all" && sources.some((s) => s.version) && (
        <div className="info-box">V3 與 V4 是不同系統的原始資料，分開列出，不相加也不去重。可用上方「資料版本」只看其中一個。</div>
      )}
      {sources.map((s) => (
        <SourcePanel key={s.key} reportId={report.id} source={s} />
      ))}
    </div>
  );
}
