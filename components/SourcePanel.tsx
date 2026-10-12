"use client";
import { useEffect, useMemo, useState } from "react";
import { aggregate, applyFilters, defaultWidgets, formatNumber, groupKeys, type Filters, type Widget } from "@/lib/aggregate";
import { downloadCsv, toCsv } from "@/lib/csv";
import { sourceLabel, type SourceDef } from "@/lib/reports";
import type { CellValue, FieldMeta, TableData } from "@/lib/types";
import { formatDate, weekName } from "@/lib/week";
import { useShell } from "./AppShell";
import ChartView from "./ChartView";
import WidgetEditor from "./WidgetEditor";
import { STATUS_TEXT, useSource } from "./useSource";

const ALL = "__all__";

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — layout just won't persist */
  }
}

export default function SourcePanel({ reportId, source }: { reportId: string; source: SourceDef }) {
  const state = useSource(source.key);
  const { week, demo } = useShell();
  const data = state.data;

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>
            {source.name}
            {source.version && <span className={`ver ver-${source.version}`}>{source.version.toUpperCase()}</span>}
          </h2>
          {source.note && <p className="note">{source.note}</p>}
        </div>
        <div className="panel-meta">
          <StatusBadge state={state.status} stale={data?.stale} demo={demo} />
          {source.url && !demo && (
            <a href={source.url} target="_blank" rel="noreferrer">
              在 Lark 開啟 ↗
            </a>
          )}
        </div>
      </header>

      {state.status !== "ok" || !data ? (
        <div className={`state-box ${state.status === "error" ? "is-error" : ""}`}>
          {STATUS_TEXT[state.status]}
          {state.error && <div className="muted small">{state.error}</div>}
        </div>
      ) : (
        <SourceBody key={`${source.key}:${data.source}`} reportId={reportId} source={source} data={data} weekStart={week.start} weekEnd={week.end} weekText={`${weekName(week.offset)} ${week.label}`} />
      )}
    </section>
  );
}

function StatusBadge({ state, stale, demo }: { state: string; stale?: boolean; demo: boolean }) {
  if (demo && state === "ok") return <span className="badge warn">示範</span>;
  if (state === "ok") return <span className={`badge ${stale ? "warn" : "good"}`}>{stale ? "過期快照" : "即時讀取"}</span>;
  if (state === "loading") return <span className="badge">載入中</span>;
  if (state === "error") return <span className="badge bad">讀取失敗</span>;
  return <span className="badge">未取得</span>;
}

function SourceBody({
  reportId,
  source,
  data,
  weekStart,
  weekEnd,
  weekText,
}: {
  reportId: string;
  source: SourceDef;
  data: TableData;
  weekStart: number;
  weekEnd: number;
  weekText: string;
}) {
  const storeKey = `pm:${reportId}:${source.key}:${data.source}`;
  const dateFields = data.fields.filter((f) => f.kind === "date");
  const [dateField, setDateField] = useState<string>(() => {
    const saved = load<string>(`${storeKey}:date`);
    if (saved && (saved === ALL || dateFields.some((f) => f.name === saved))) return saved;
    return source.dateField && dateFields.some((f) => f.name === source.dateField) ? source.dateField : dateFields[0]?.name ?? ALL;
  });
  const [filters, setFilters] = useState<Filters>(() => load<Filters>(`${storeKey}:filters`) ?? {});
  const [widgets, setWidgets] = useState<Widget[]>(() => load<Widget[]>(`${storeKey}:widgets`) ?? defaultWidgets(data.fields.filter((f) => f.kind !== "date")));
  const [editing, setEditing] = useState<Widget | null>(null);
  const [tab, setTab] = useState<"table" | "charts">("table");

  useEffect(() => save(`${storeKey}:date`, dateField), [storeKey, dateField]);
  useEffect(() => save(`${storeKey}:filters`, filters), [storeKey, filters]);
  useEffect(() => save(`${storeKey}:widgets`, widgets), [storeKey, widgets]);

  const byWeek = dateField !== ALL;
  const { inWeek, undated } = useMemo(() => {
    if (!byWeek) return { inWeek: data.records, undated: 0 };
    let undated = 0;
    const inWeek = data.records.filter((r) => {
      const v = r.fields[dateField];
      if (typeof v !== "number") {
        undated++;
        return false;
      }
      return v >= weekStart && v < weekEnd;
    });
    return { inWeek, undated };
  }, [data, dateField, byWeek, weekStart, weekEnd]);

  const records = useMemo(() => applyFilters({ ...data, records: inWeek }, filters), [data, inWeek, filters]);

  const colorKeys = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const f of data.fields) {
      if (f.kind === "number" || f.kind === "date") continue;
      const counts = new Map<string, number>();
      for (const r of data.records) for (const k of groupKeys(r.fields[f.name], f)) counts.set(k, (counts.get(k) ?? 0) + 1);
      out.set(f.name, [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k));
    }
    return out;
  }, [data]);

  // Only offer filters on low-cardinality categorical fields.
  const filterable = data.fields.filter((f) => ["select", "multiselect", "person", "checkbox"].includes(f.kind) && (colorKeys.get(f.name)?.length ?? 0) <= 60);
  const activeFilters = Object.entries(filters).filter(([, v]) => v.length);

  const exportCsv = () => {
    const meta = [
      `報告 ${reportId}｜來源 ${sourceLabel(source)}`,
      ...(source.createdAfterLabel ? [`納入規則：只含原生建立時間在 ${source.createdAfterLabel} 之後的記錄（排除 ${data.excluded ?? 0} 筆）`] : []),
      `資料模式：${data.source === "demo" ? "示範（虛構）" : data.stale ? "過期快照" : "Lark 即時讀取"}`,
      `擷取時間：${new Date(data.fetchedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}（Asia/Taipei）`,
      byWeek ? `統計週：${weekText}，依「${dateField}」` : "統計週：不依週篩選",
      `篩選：${activeFilters.length ? activeFilters.map(([k, v]) => `${k}=${v.join("/")}`).join("；") : "無"}`,
      `筆數：${records.length}${data.complete ? "" : "（來源分頁未讀完，資料不完整）"}`,
    ];
    downloadCsv(`${reportId}_${sourceLabel(source)}_${byWeek ? weekText.replace(/[\s/–]/g, "_") : "全部"}.csv`, toCsv(data.fields, records, meta));
  };

  return (
    <>
      {data.stale && <div className="warn-box">最近一次讀取失敗，顯示的是 {new Date(data.fetchedAt).toLocaleString("zh-TW")} 的快照。錯誤：{data.error}</div>}
      {!data.complete && <div className="warn-box">來源分頁未讀完（上限 20,000 筆），以下為部分資料。</div>}
      {source.createdAfterLabel && (
        <div className="info-box">
          V4 納入規則：只含原生建立時間在 {source.createdAfterLabel} 之後的記錄；之前的舊測試資料不納入（本表排除 {formatNumber(data.excluded ?? 0)} 筆）。
        </div>
      )}

      <div className="panel-controls">
        <label className="inline">
          週篩選依據
          <select value={dateField} onChange={(e) => setDateField(e.target.value)}>
            {dateFields.map((f) => (
              <option key={f.id} value={f.name}>
                {f.name}
              </option>
            ))}
            <option value={ALL}>不依週篩選（全部）</option>
          </select>
        </label>
        {filterable.map((f) => (
          <FilterChip key={f.id} field={f} options={colorKeys.get(f.name) ?? []} selected={filters[f.name] ?? []} onChange={(v) => setFilters((p) => ({ ...p, [f.name]: v }))} />
        ))}
        {activeFilters.length > 0 && (
          <button className="btn ghost small" onClick={() => setFilters({})}>
            清除篩選
          </button>
        )}
      </div>

      <div className="kpis">
        <Kpi label={byWeek ? `${weekText} 筆數` : "筆數"} value={records.length} sub={activeFilters.length ? `篩選前 ${formatNumber(inWeek.length)}` : undefined} />
        <Kpi
          label={source.createdAfterLabel ? "納入筆數" : "來源總筆數"}
          value={data.total}
          sub={source.createdAfterLabel ? `排除 ${formatNumber(data.excluded ?? 0)} 筆（建立於基準前或時間不明）` : `擷取 ${new Date(data.fetchedAt).toLocaleTimeString("zh-TW")}`}
        />
        {byWeek && <Kpi label={`「${dateField}」空白`} value={undated} sub="不計入任何週" />}
      </div>

      <nav className="tabs">
        <button className={tab === "table" ? "active" : ""} onClick={() => setTab("table")}>
          明細
        </button>
        <button className={tab === "charts" ? "active" : ""} onClick={() => setTab("charts")}>
          圖表
        </button>
        <div className="tab-actions">
          {tab === "charts" ? (
            <>
              <button className="btn ghost small" onClick={() => setWidgets(defaultWidgets(data.fields.filter((f) => f.kind !== "date")))}>
                重設圖表
              </button>
              <button
                className="btn primary small"
                onClick={() =>
                  setEditing({ id: Math.random().toString(36).slice(2, 9), title: "", type: "bar", groupBy: filterable[0]?.name ?? data.fields[0]?.name ?? "", agg: "count", width: 1 })
                }
              >
                ＋ 新增圖表
              </button>
            </>
          ) : (
            <button className="btn small" onClick={exportCsv} disabled={!records.length}>
              匯出 CSV
            </button>
          )}
        </div>
      </nav>

      {records.length === 0 ? (
        <div className="state-box">
          {data.records.length === 0 ? (data.excluded ? "套用 V4 納入規則後沒有記錄（不代表數值為零）" : "來源目前沒有記錄（不代表數值為零）") : byWeek ? `${weekText} 依「${dateField}」沒有符合的記錄` : "此篩選條件沒有記錄"}
        </div>
      ) : tab === "table" ? (
        <DataTable fields={data.fields} records={records} />
      ) : (
        <div className="grid">
          {widgets.map((w, i) => (
            <article key={w.id} className={`card ${w.width === 2 ? "wide" : ""}`}>
              <header>
                <h3>{w.title}</h3>
                <div className="card-actions">
                  <button title="前移" disabled={i === 0} onClick={() => setWidgets((ws) => move(ws, i, i - 1))}>
                    ←
                  </button>
                  <button title="後移" disabled={i === widgets.length - 1} onClick={() => setWidgets((ws) => move(ws, i, i + 1))}>
                    →
                  </button>
                  <button title="編輯" onClick={() => setEditing(w)}>
                    ✎
                  </button>
                  <button title="刪除" onClick={() => setWidgets((ws) => ws.filter((x) => x.id !== w.id))}>
                    ✕
                  </button>
                </div>
              </header>
              <ChartView widget={w} series={aggregate(records, data.fields, w)} colorKeys={colorKeys.get(w.groupBy) ?? []} stackColorKeys={colorKeys.get(w.stackBy ?? "") ?? []} />
            </article>
          ))}
        </div>
      )}

      {editing && (
        <WidgetEditor
          fields={data.fields}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(w) => {
            setWidgets((ws) => (ws.some((x) => x.id === w.id) ? ws.map((x) => (x.id === w.id ? w : x)) : [...ws, w]));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function Kpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{typeof value === "number" ? formatNumber(value) : value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function FilterChip({ field, options, selected, onChange }: { field: FieldMeta; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  return (
    <details className={`chip ${selected.length ? "on" : ""}`}>
      <summary>
        {field.name}
        {selected.length ? `：${selected.length > 2 ? `${selected.length} 項` : selected.join("、")}` : ""}
      </summary>
      <div className="chip-menu">
        {options.map((o) => (
          <label key={o}>
            <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
            {o}
          </label>
        ))}
      </div>
    </details>
  );
}

function display(v: CellValue, f: FieldMeta): string {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.join("、");
  if (f.kind === "date" && typeof v === "number") return formatDate(v);
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return String(v);
}

function DataTable({ fields, records }: { fields: FieldMeta[]; records: TableData["records"] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ field: string; dir: 1 | -1 } | null>(null);
  const PAGE = 200;

  const rows = useMemo(() => {
    let out = records;
    if (q) {
      const needle = q.toLowerCase();
      out = out.filter((r) => fields.some((f) => display(r.fields[f.name], f).toLowerCase().includes(needle)));
    }
    if (sort) {
      out = [...out].sort((a, b) => {
        const x = a.fields[sort.field];
        const y = b.fields[sort.field];
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
      });
    }
    return out;
  }, [records, fields, q, sort]);

  return (
    <div className="table-wrap">
      <input className="search" placeholder="搜尋工程編號、工作單號…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜尋明細" />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f.id} className={f.kind === "number" ? "num" : ""} aria-sort={sort?.field === f.name ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button onClick={() => setSort((s) => (s?.field === f.name ? { field: f.name, dir: s.dir === 1 ? -1 : 1 } : { field: f.name, dir: 1 }))}>
                    {f.name}
                    {sort?.field === f.name ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, PAGE).map((r) => (
              <tr key={r.id}>
                {fields.map((f) => {
                  const text = display(r.fields[f.name], f);
                  return (
                    <td key={f.id} className={f.kind === "number" ? "num" : ""} title={text}>
                      {text || <span className="blank">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="meta-line">
        {q ? `搜尋結果 ${rows.length} 筆` : `共 ${rows.length} 筆`}
        {rows.length > PAGE && `，顯示前 ${PAGE} 筆（CSV 匯出包含全部）`}。「—」表示空白／未填，不等於 0。
      </div>
    </div>
  );
}
