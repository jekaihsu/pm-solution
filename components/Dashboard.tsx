"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { aggregate, applyFilters, defaultWidgets, formatNumber, groupKeys, type Filters, type Widget } from "@/lib/aggregate";
import type { CellValue, FieldMeta, TableData, TableMeta } from "@/lib/types";
import ChartView from "./ChartView";
import WidgetEditor from "./WidgetEditor";

const REFRESH_OPTIONS = [
  { value: 0, label: "不自動更新" },
  { value: 30, label: "每 30 秒" },
  { value: 60, label: "每 1 分鐘" },
  { value: 300, label: "每 5 分鐘" },
];

interface SavedConfig {
  widgets: Widget[];
  filters: Filters;
  kpis?: string[];
}

function storageKey(tableId: string) {
  return `pm-dashboard:${tableId}`;
}
function loadConfig(tableId: string): SavedConfig | null {
  try {
    const raw = localStorage.getItem(storageKey(tableId));
    return raw ? (JSON.parse(raw) as SavedConfig) : null;
  } catch {
    return null;
  }
}
function saveConfig(tableId: string, cfg: SavedConfig) {
  try {
    localStorage.setItem(storageKey(tableId), JSON.stringify(cfg));
  } catch {
    /* storage unavailable — config just won't persist */
  }
}

export default function Dashboard() {
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [tableId, setTableId] = useState<string>("");
  const [data, setData] = useState<TableData | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [editing, setEditing] = useState<Widget | null>(null);
  const [refreshSec, setRefreshSec] = useState(60);
  const [tab, setTab] = useState<"charts" | "table">("charts");

  // Load table list once.
  useEffect(() => {
    fetch("/api/tables")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setTables(j.tables);
        const fromUrl = new URLSearchParams(location.search).get("table");
        setTableId(j.tables.some((t: TableMeta) => t.id === fromUrl) ? fromUrl : j.defaultTableId ?? "");
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const load = useCallback(
    async (force = false) => {
      if (!tableId) return;
      setLoading(true);
      try {
        const r = await fetch(`/api/tables/${tableId}${force ? "?refresh=1" : ""}`);
        const j = await r.json();
        if (j.error) throw new Error(j.error);
        setData(j);
        setError("");
      } catch (e) {
        setError(String((e as Error).message ?? e));
      } finally {
        setLoading(false);
      }
    },
    [tableId],
  );

  // On table change: load data and restore saved layout.
  useEffect(() => {
    if (!tableId) return;
    setData(null);
    const url = new URL(location.href);
    url.searchParams.set("table", tableId);
    history.replaceState(null, "", url);
    load();
  }, [tableId, load]);

  useEffect(() => {
    if (!data || data.table.id !== tableId) return;
    const saved = loadConfig(tableId);
    const names = new Set(data.fields.map((f) => f.name));
    const valid = saved?.widgets.filter((w) => names.has(w.groupBy));
    setWidgets(valid?.length ? valid : defaultWidgets(data.fields));
    setFilters(Object.fromEntries(Object.entries(saved?.filters ?? {}).filter(([k]) => names.has(k))));
    // Only when the table (not every refresh) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.table.id, tableId]);

  useEffect(() => {
    if (tableId && widgets.length) saveConfig(tableId, { widgets, filters });
  }, [tableId, widgets, filters]);

  // Auto refresh.
  useEffect(() => {
    if (!refreshSec) return;
    const t = setInterval(() => load(), refreshSec * 1000);
    return () => clearInterval(t);
  }, [refreshSec, load]);

  const records = useMemo(() => (data ? applyFilters(data, filters) : []), [data, filters]);

  // Stable color keys per field, from the unfiltered data, ordered by frequency.
  const colorKeysByField = useMemo(() => {
    const out = new Map<string, string[]>();
    if (!data) return out;
    for (const f of data.fields) {
      if (f.kind === "number" || f.kind === "date") continue;
      const counts = new Map<string, number>();
      for (const r of data.records) for (const k of groupKeys(r.fields[f.name], f)) counts.set(k, (counts.get(k) ?? 0) + 1);
      out.set(f.name, [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k));
    }
    return out;
  }, [data]);

  const filterableFields = data?.fields.filter((f) => ["select", "multiselect", "person", "checkbox"].includes(f.kind)) ?? [];
  const numberFields = data?.fields.filter((f) => f.kind === "number") ?? [];

  const newWidget = (): Widget => ({
    id: Math.random().toString(36).slice(2, 9),
    title: "",
    type: "bar",
    groupBy: filterableFields[0]?.name ?? data?.fields[0]?.name ?? "",
    agg: "count",
    width: 1,
  });

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <h1>PM Dashboard</h1>
          {data?.source === "demo" && <span className="badge">示範資料 · 尚未設定 Lark</span>}
        </div>
        <div className="controls">
          <select value={tableId} onChange={(e) => setTableId(e.target.value)} aria-label="資料表">
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select value={refreshSec} onChange={(e) => setRefreshSec(Number(e.target.value))} aria-label="自動更新">
            {REFRESH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => load(true)} disabled={loading}>
            {loading ? "更新中…" : "立即更新"}
          </button>
        </div>
      </header>

      {error && <div className="error">⚠️ 讀取失敗：{error}</div>}

      {data && (
        <>
          <section className="filters">
            {filterableFields.map((f) => (
              <FilterChip
                key={f.id}
                field={f}
                options={colorKeysByField.get(f.name) ?? []}
                selected={filters[f.name] ?? []}
                onChange={(vals) => setFilters((prev) => ({ ...prev, [f.name]: vals }))}
              />
            ))}
            {Object.values(filters).some((v) => v.length) && (
              <button className="btn ghost small" onClick={() => setFilters({})}>
                清除篩選
              </button>
            )}
            <span className="meta">
              更新於 {new Date(data.fetchedAt).toLocaleTimeString()} · {records.length} / {data.records.length} 筆
            </span>
          </section>

          <section className="kpis">
            <Kpi label="記錄數" value={records.length} sub={records.length !== data.records.length ? `全部 ${formatNumber(data.records.length)}` : undefined} />
            {numberFields.slice(0, 3).map((f) => {
              const vals = records.map((r) => r.fields[f.name]).filter((v): v is number => typeof v === "number");
              const sum = vals.reduce((a, b) => a + b, 0);
              return <Kpi key={f.id} label={`${f.name} 總和`} value={sum} sub={vals.length ? `平均 ${formatNumber(sum / vals.length)}` : undefined} />;
            })}
          </section>

          <nav className="tabs">
            <button className={tab === "charts" ? "active" : ""} onClick={() => setTab("charts")}>
              圖表
            </button>
            <button className={tab === "table" ? "active" : ""} onClick={() => setTab("table")}>
              資料表
            </button>
            {tab === "charts" && (
              <div className="tab-actions">
                <button className="btn ghost small" onClick={() => setWidgets(defaultWidgets(data.fields))}>
                  重設版面
                </button>
                <button className="btn primary small" onClick={() => setEditing(newWidget())}>
                  ＋ 新增圖表
                </button>
              </div>
            )}
          </nav>

          {tab === "charts" ? (
            <section className="grid">
              {widgets.map((w, i) => (
                <article key={w.id} className={`card ${w.width === 2 ? "wide" : ""}`}>
                  <header>
                    <h2>{w.title}</h2>
                    <div className="card-actions">
                      <button title="左移" disabled={i === 0} onClick={() => setWidgets((ws) => move(ws, i, i - 1))}>
                        ←
                      </button>
                      <button title="右移" disabled={i === widgets.length - 1} onClick={() => setWidgets((ws) => move(ws, i, i + 1))}>
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
                  <ChartView
                    widget={w}
                    series={aggregate(records, data.fields, w)}
                    colorKeys={colorKeysByField.get(w.groupBy) ?? []}
                    stackColorKeys={colorKeysByField.get(w.stackBy ?? "") ?? []}
                  />
                </article>
              ))}
            </section>
          ) : (
            <DataTable fields={data.fields} records={records} />
          )}
        </>
      )}

      {!data && !error && <div className="loading">載入中…</div>}

      {editing && data && (
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

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function Kpi({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{formatNumber(value)}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function FilterChip({
  field,
  options,
  selected,
  onChange,
}: {
  field: FieldMeta;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
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
        {selected.length > 0 && (
          <button className="btn ghost small" onClick={() => onChange([])}>
            清除
          </button>
        )}
      </div>
    </details>
  );
}

function display(v: CellValue, f: FieldMeta): string {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.join("、");
  if (f.kind === "date" && typeof v === "number") return new Date(v).toLocaleDateString();
  if (typeof v === "boolean") return v ? "✓" : "";
  if (typeof v === "number") return formatNumber(v);
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
    <section className="table-wrap">
      <input className="search" placeholder="搜尋…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {fields.map((f) => (
                <th
                  key={f.id}
                  className={f.kind === "number" ? "num" : ""}
                  onClick={() => setSort((s) => (s?.field === f.name ? { field: f.name, dir: s.dir === 1 ? -1 : 1 } : { field: f.name, dir: 1 }))}
                >
                  {f.name}
                  {sort?.field === f.name ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, PAGE).map((r) => (
              <tr key={r.id}>
                {fields.map((f) => (
                  <td key={f.id} className={f.kind === "number" ? "num" : ""}>
                    {display(r.fields[f.name], f)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PAGE && <div className="meta">顯示前 {PAGE} 筆，共 {rows.length} 筆（可用搜尋縮小範圍）</div>}
    </section>
  );
}
