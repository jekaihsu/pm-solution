"use client";
import { SOURCES, REPORTS, isLocated, sourceLabel, type SourceDef } from "@/lib/reports";
import { useSource, STATUS_TEXT } from "./useSource";

const KIND_TEXT: Record<string, string> = {
  text: "文字",
  number: "數字",
  select: "單選",
  multiselect: "多選",
  date: "日期",
  checkbox: "核取",
  person: "人員",
};

function SourceRow({ src }: { src: SourceDef }) {
  const s = useSource(src.key);
  const usedBy = REPORTS.filter((r) => r.sources.includes(src.key)).map((r) => r.id);
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>{sourceLabel(src)}</h2>
          <p className="note">
            用於 {usedBy.join("、")}
            {src.note ? `｜${src.note}` : ""}
          </p>
        </div>
        <div className="panel-meta">
          {src.url && (
            <a href={src.url} target="_blank" rel="noreferrer">
              在 Lark 開啟 ↗
            </a>
          )}
        </div>
      </header>
      <dl className="facts">
        <dt>Base / 資料表 / 視圖</dt>
        <dd>{isLocated(src) ? `${src.baseToken} / ${src.tableId}${src.viewId ? ` / ${src.viewId}` : "（全表）"}` : "尚未定位"}</dd>
        {src.createdAfterLabel && (
          <>
            <dt>納入規則</dt>
            <dd>原生建立時間在 {src.createdAfterLabel} 之後{s.data ? `｜排除 ${s.data.excluded ?? 0} 筆，來源共 ${s.data.sourceTotal ?? "?"} 筆` : ""}</dd>
          </>
        )}
        {src.dateField && (
          <>
            <dt>預設週篩選欄位</dt>
            <dd>{src.dateField}</dd>
          </>
        )}
        <dt>狀態</dt>
        <dd>
          {s.status === "ok" && s.data
            ? `${s.data.source === "demo" ? "示範資料" : s.data.stale ? "過期快照" : "即時讀取"}｜${s.data.total} 筆${s.data.complete ? "" : "（未讀完）"}｜擷取 ${new Date(s.data.fetchedAt).toLocaleString("zh-TW")}`
            : STATUS_TEXT[s.status]}
          {s.error && <div className="muted small">{s.error}</div>}
        </dd>
      </dl>
      {s.data && (
        <details className="fields-details">
          <summary>欄位清單（{s.data.fields.length}）</summary>
        <div className="field-list">
          {s.data.fields.map((f) => (
            <span key={f.id} className="field-tag">
              {f.name} <em>{KIND_TEXT[f.kind]}</em>
            </span>
          ))}
        </div>
        </details>
      )}
    </section>
  );
}

export default function SourcesView() {
  return (
    <div>
      <header className="report-head">
        <div>
          <h1>資料來源與定義</h1>
          <p className="purpose">各報告讀取的 Lark 資料表、目前讀取狀態與欄位。欄位型別為 Lark 原始型別，業務定義（單位、核定階段）仍待各權責同事確認。</p>
        </div>
      </header>
      {SOURCES.map((s) => (
        <SourceRow key={s.key} src={s} />
      ))}
    </div>
  );
}
