"use client";
import { ExternalLink } from "lucide-react";
import { SOURCES, REPORTS, isLocated, type SourceDef } from "@/lib/reports";
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
  const s = useSource(src.key, { only: "meta" });
  const usedBy = REPORTS.filter((r) => r.sources.includes(src.key)).map((r) => r.id);
  const status =
    s.status === "ok" && s.data ? (
      <span className={`pill ${s.data.stale ? "pill-warn" : "pill-good"}`}>{s.data.source === "demo" ? "示範" : s.data.stale ? "過期快照" : "已連線"}</span>
    ) : src.optional && s.status === "error" ? (
      <span className="pill pill-warn" title="非必要參照：沒有報表依賴這張表">非必要參照・{STATUS_TEXT[s.status]}</span>
    ) : (
      <span className={`pill ${s.status === "error" ? "pill-bad" : ""}`}>{STATUS_TEXT[s.status]}</span>
    );
  // Tables found by name have no fixed id: show the one resolved at read time.
  const tableId = src.tableId ?? (s.data && s.data.source !== "demo" ? s.data.table.id : undefined);
  const location = !isLocated(src)
    ? "尚未定位"
    : `${src.baseToken} / ${tableId ?? (src.tableName ? `依表名「${src.tableName.source}」尋找（未解析）` : "未解析")}${src.viewId ? ` / ${src.viewId}` : ""}`;
  const link = src.url && !src.tableId && tableId && !src.url.includes("table=") ? `${src.url}?table=${tableId}` : src.url;

  return (
    <section className="src-card">
      <header className="src-head">
        <div>
          <h2>
            {src.name}
            {src.version && <span className={`ver ver-${src.version}`}>{src.version.toUpperCase()}</span>}
          </h2>
          <div className="src-used">
            {usedBy.map((id) => (
              <span key={id} className="rid">
                {id}
              </span>
            ))}
          </div>
        </div>
        <div className="src-meta">
          {status}
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="icon-btn bordered" title="在 Lark 開啟" aria-label="在 Lark 開啟">
              <ExternalLink size={14} strokeWidth={1.75} />
            </a>
          )}
        </div>
      </header>
      <dl className="facts">
        <dt>位置</dt>
        <dd className="mono">{location}</dd>
        {s.data && (
          <>
            <dt>筆數</dt>
            <dd>
              {s.data.total} 筆{src.viewId ? "（檢視）" : "（全表）"}
              {s.data.complete ? "" : "，未讀完"}・擷取 {new Date(s.data.fetchedAt).toLocaleString("zh-TW")}
            </dd>
          </>
        )}
        {src.createdAfterLabel && (
          <>
            <dt>納入規則</dt>
            <dd>
              原生建立時間在 {src.createdAfterLabel} 之後
              {s.data ? `；排除 ${s.data.excluded ?? 0} 筆（來源共 ${s.data.sourceTotal ?? "?"} 筆）` : ""}
            </dd>
          </>
        )}
        {src.dateField && (
          <>
            <dt>週篩選欄位</dt>
            <dd>{src.dateField}</dd>
          </>
        )}
        {src.note && (
          <>
            <dt>備註</dt>
            <dd>{src.note}</dd>
          </>
        )}
        {s.error && (
          <>
            <dt>錯誤</dt>
            <dd className="mono bad-text">{s.error}</dd>
          </>
        )}
      </dl>
      {s.data && (
        <details className="fields-details">
          <summary>欄位 {s.data.fields.length}</summary>
          <div className="field-list">
            {s.data.fields.map((f) => (
              <span key={f.id} className="field-tag">
                {f.name}
                <em>{KIND_TEXT[f.kind]}</em>
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
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <div className="eyebrow">設定</div>
          <h1>資料來源</h1>
          <p className="page-sub">各報告讀取的 Lark 資料表、連線狀態與欄位。欄位型別為 Lark 原始型別；單位、核定階段等業務定義仍待權責同事確認。</p>
        </div>
      </header>
      <div className="src-list">
        {SOURCES.map((s) => (
          <SourceRow key={s.key} src={s} />
        ))}
      </div>
    </div>
  );
}
