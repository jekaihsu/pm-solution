"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
const PAGE = 100;

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
  const { week } = useShell();
  const data = state.data;

  if (state.status !== "ok" || !data) {
    return (
      <div className={`state-box ${state.status === "error" ? "is-error" : ""}`}>
        {STATUS_TEXT[state.status]}
        {state.error && <div className="muted small">{state.error}</div>}
        {source.note && <div className="muted small">{source.note}</div>}
        {source.url && (
          <div className="small">
            <a href={source.url} target="_blank" rel="noreferrer">
              在 Lark 開啟 ↗
            </a>
          </div>
        )}
      </div>
    );
  }
  return (
    <SourceBody
      key={`${source.key}:${data.source}`}
      reportId={reportId}
      source={source}
      data={data}
      weekStart={week.start}
      weekEnd={week.end}
      weekText={`${weekName(week.offset)} ${week.label}`}
    />
  );
}

// Closes a <details> popover when clicking outside it.
function Popover({ label, active, children }: { label: React.ReactNode; active?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  return (
    <details ref={ref} className={`pop ${active ? "on" : ""}`}>
      <summary className="tool">{label}</summary>
      <div className="pop-body">{children}</div>
    </details>
  );
}

function defaultColumns(source: SourceDef, fields: FieldMeta[]): string[] {
  const names = new Set(fields.map((f) => f.name));
  const picked = (source.columns ?? []).filter((n) => names.has(n));
  if (picked.length >= 4) return picked;
  const primary = fields.find((f) => f.primary);
  const rest = fields.filter((f) => !f.primary && !picked.includes(f.name)).map((f) => f.name);
  return [...new Set([...(primary ? [primary.name] : []), ...picked, ...rest])].slice(0, 10);
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
  const [columns, setColumns] = useState<string[]>(() => {
    const saved = load<string[]>(`${storeKey}:cols`);
    const names = new Set(data.fields.map((f) => f.name));
    const valid = saved?.filter((n) => names.has(n));
    return valid?.length ? valid : defaultColumns(source, data.fields);
  });
  const [widgets, setWidgets] = useState<Widget[]>(() => load<Widget[]>(`${storeKey}:widgets`) ?? defaultWidgets(data.fields.filter((f) => f.kind !== "date")));
  const [showCharts, setShowCharts] = useState(false);
  const [editing, setEditing] = useState<Widget | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => save(`${storeKey}:date`, dateField), [storeKey, dateField]);
  useEffect(() => save(`${storeKey}:filters`, filters), [storeKey, filters]);
  useEffect(() => save(`${storeKey}:cols`, columns), [storeKey, columns]);
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

  const filtered = useMemo(() => applyFilters({ ...data, records: inWeek }, filters), [data, inWeek, filters]);

  const options = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const f of data.fields) {
      if (f.kind === "number" || f.kind === "date") continue;
      const counts = new Map<string, number>();
      for (const r of data.records) for (const k of groupKeys(r.fields[f.name], f)) counts.set(k, (counts.get(k) ?? 0) + 1);
      out.set(f.name, [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k));
    }
    return out;
  }, [data]);

  const filterable = data.fields.filter((f) => ["select", "multiselect", "person", "checkbox"].includes(f.kind) && (options.get(f.name)?.length ?? 0) <= 80);
  const activeFilters = Object.entries(filters).filter(([, v]) => v.length);
  const visibleFields = columns.map((n) => data.fields.find((f) => f.name === n)).filter((f): f is FieldMeta => Boolean(f));

  const exportCsv = () => {
    const meta = [
      `報告 ${reportId}｜來源 ${sourceLabel(source)}`,
      `資料模式：${data.source === "demo" ? "示範（虛構）" : data.stale ? "過期快照" : "Lark 即時讀取"}`,
      ...(source.createdAfterLabel ? [`納入規則：只含原生建立時間在 ${source.createdAfterLabel} 之後的記錄（排除 ${data.excluded ?? 0} 筆）`] : []),
      `擷取時間：${new Date(data.fetchedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}（Asia/Taipei）`,
      byWeek ? `統計週：${weekText}，依「${dateField}」` : "統計週：不依週篩選",
      `篩選：${activeFilters.length ? activeFilters.map(([k, v]) => `${k}=${v.join("/")}`).join("；") : "無"}`,
      `筆數：${filtered.length}${data.complete ? "" : "（來源分頁未讀完，資料不完整）"}`,
    ];
    downloadCsv(`${reportId}_${sourceLabel(source)}_${byWeek ? weekText.replace(/[\s/–]/g, "_") : "全部"}.csv`, toCsv(data.fields, filtered, meta));
  };

  // One compact line of context instead of stacked banners.
  const facts: string[] = [];
  if (data.source === "demo") facts.push("示範資料");
  else facts.push(data.stale ? `過期快照（${new Date(data.fetchedAt).toLocaleString("zh-TW")}）` : `更新 ${new Date(data.fetchedAt).toLocaleTimeString("zh-TW")}`);
  facts.push(`來源 ${formatNumber(data.total)} 筆`);
  if (source.createdAfterLabel) facts.push(`已排除 ${formatNumber(data.excluded ?? 0)} 筆 V4 基準前資料`);
  if (byWeek && undated) facts.push(`${formatNumber(undated)} 筆「${dateField}」空白`);
  if (!data.complete) facts.push("分頁未讀完");

  return (
    <div className="sheet">
      <div className="toolbar">
        <label className="tool tool-select" title="依哪個日期欄位篩選統計週">
          <span>📅</span>
          <select value={dateField} onChange={(e) => setDateField(e.target.value)} aria-label="週篩選依據">
            {dateFields.map((f) => (
              <option key={f.id} value={f.name}>
                {f.name}
              </option>
            ))}
            <option value={ALL}>不依週篩選</option>
          </select>
        </label>

        <Popover label={`篩選${activeFilters.length ? ` ${activeFilters.length}` : ""}`} active={activeFilters.length > 0}>
          {filterable.length === 0 && <div className="muted small">沒有可篩選的選項欄位</div>}
          {filterable.map((f) => {
            const sel = filters[f.name] ?? [];
            return (
              <details key={f.id} className="pop-group" open={sel.length > 0}>
                <summary>
                  {f.name}
                  {sel.length > 0 && <span className="count">{sel.length}</span>}
                </summary>
                <div className="pop-options">
                  {(options.get(f.name) ?? []).map((o) => (
                    <label key={o}>
                      <input
                        type="checkbox"
                        checked={sel.includes(o)}
                        onChange={() => setFilters((p) => ({ ...p, [f.name]: sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o] }))}
                      />
                      {o}
                    </label>
                  ))}
                </div>
              </details>
            );
          })}
          {activeFilters.length > 0 && (
            <button className="btn ghost small" onClick={() => setFilters({})}>
              清除全部篩選
            </button>
          )}
        </Popover>

        <Popover label={`欄位 ${visibleFields.length}/${data.fields.length}`}>
          <ColumnPicker fields={data.fields} columns={columns} onChange={setColumns} onReset={() => setColumns(defaultColumns(source, data.fields))} />
        </Popover>

        <input className="tool-search" placeholder="搜尋…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜尋明細" />

        <div className="toolbar-right">
          <span className="count-text">
            <strong>{formatNumber(filtered.length)}</strong> 筆{byWeek ? `（${weekText}）` : ""}
          </span>
          <button className={`tool ${showCharts ? "on" : ""}`} onClick={() => setShowCharts((s) => !s)} aria-pressed={showCharts}>
            圖表
          </button>
          <button className="tool" onClick={exportCsv} disabled={!filtered.length}>
            匯出
          </button>
          {source.url && data.source !== "demo" && (
            <a className="tool" href={source.url} target="_blank" rel="noreferrer" title="在 Lark 開啟原始資料表">
              ↗
            </a>
          )}
        </div>
      </div>

      <div className="facts-line" title={source.note}>
        {facts.join(" · ")}
        {source.note && <span className="muted"> · {source.note}</span>}
        {data.stale && data.error && <span className="bad-text"> · 最近一次讀取失敗：{data.error}</span>}
      </div>

      {showCharts && filtered.length > 0 && (
        <div className="charts">
          <div className="charts-head">
            <button className="btn ghost small" onClick={() => setWidgets(defaultWidgets(data.fields.filter((f) => f.kind !== "date")))}>
              重設圖表
            </button>
            <button
              className="btn primary small"
              onClick={() => setEditing({ id: Math.random().toString(36).slice(2, 9), title: "", type: "bar", groupBy: filterable[0]?.name ?? data.fields[0]?.name ?? "", agg: "count", width: 1 })}
            >
              ＋ 新增圖表
            </button>
          </div>
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
                <ChartView widget={w} series={aggregate(filtered, data.fields, w)} colorKeys={options.get(w.groupBy) ?? []} stackColorKeys={options.get(w.stackBy ?? "") ?? []} />
              </article>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="state-box">
          {data.records.length === 0
            ? data.excluded
              ? "套用 V4 納入規則後沒有記錄（不代表數值為零）"
              : "來源目前沒有記錄（不代表數值為零）"
            : byWeek
              ? `${weekText} 依「${dateField}」沒有符合的記錄`
              : "此篩選條件沒有記錄"}
        </div>
      ) : (
        <DataTable fields={visibleFields} records={filtered} query={q} allFields={data.fields} />
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
    </div>
  );
}

const KIND_ICON: Record<string, string> = { text: "Aa", number: "#", select: "◉", multiselect: "☰", date: "📅", checkbox: "☑", person: "👤" };

function ColumnPicker({ fields, columns, onChange, onReset }: { fields: FieldMeta[]; columns: string[]; onChange: (c: string[]) => void; onReset: () => void }) {
  const [q, setQ] = useState("");
  const shown = fields.filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (name: string) =>
    onChange(columns.includes(name) ? columns.filter((c) => c !== name) : fields.map((f) => f.name).filter((n) => n === name || columns.includes(n)));
  return (
    <div className="col-picker">
      <input placeholder="搜尋欄位…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜尋欄位" />
      <div className="col-actions">
        <button className="btn ghost small" onClick={onReset}>
          重點欄位
        </button>
        <button className="btn ghost small" onClick={() => onChange(fields.map((f) => f.name))}>
          全部
        </button>
      </div>
      <div className="pop-options tall">
        {shown.map((f) => (
          <label key={f.id}>
            <input type="checkbox" checked={columns.includes(f.name)} onChange={() => toggle(f.name)} />
            <span className="kind">{KIND_ICON[f.kind]}</span>
            {f.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function display(v: CellValue, f: FieldMeta): string {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.join("、");
  if (f.kind === "date" && typeof v === "number") return formatDate(v);
  if (typeof v === "boolean") return v ? "✓" : "";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return String(v);
}

function DataTable({ fields, allFields, records, query }: { fields: FieldMeta[]; allFields: FieldMeta[]; records: TableData["records"]; query: string }) {
  const [sort, setSort] = useState<{ field: string; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    let out = records;
    if (query) {
      const needle = query.toLowerCase();
      // Search all fields, not only the visible ones.
      out = out.filter((r) => allFields.some((f) => display(r.fields[f.name], f).toLowerCase().includes(needle)));
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
  }, [records, allFields, query, sort]);

  if (!fields.length) return <div className="state-box">尚未選擇要顯示的欄位，請從「欄位」勾選。</div>;

  return (
    <>
      <div className="grid-table">
        <table>
          <thead>
            <tr>
              <th className="rownum" aria-label="列號" />
              {fields.map((f) => (
                <th key={f.id} className={f.kind === "number" ? "num" : ""} aria-sort={sort?.field === f.name ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button onClick={() => setSort((s) => (s?.field === f.name ? (s.dir === 1 ? { field: f.name, dir: -1 } : null) : { field: f.name, dir: 1 }))}>
                    <span className="kind">{KIND_ICON[f.kind]}</span>
                    {f.name}
                    {sort?.field === f.name ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r, i) => (
              <tr key={r.id}>
                <td className="rownum">{i + 1}</td>
                {fields.map((f) => {
                  const text = display(r.fields[f.name], f);
                  return (
                    <td key={f.id} className={f.kind === "number" ? "num" : ""} title={text}>
                      {f.kind === "select" || f.kind === "multiselect" || f.kind === "person" ? (
                        text
                          .split("、")
                          .filter(Boolean)
                          .map((t) => (
                            <span key={t} className="tag">
                              {t}
                            </span>
                          ))
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        {query ? `搜尋結果 ${rows.length} 筆` : `共 ${rows.length} 筆`}
        {rows.length > limit && (
          <button className="btn ghost small" onClick={() => setLimit((l) => l + PAGE * 3)}>
            再顯示 {Math.min(PAGE * 3, rows.length - limit)} 筆
          </button>
        )}
        <span className="muted">空白儲存格表示未填，不等於 0。</span>
      </div>
    </>
  );
}
