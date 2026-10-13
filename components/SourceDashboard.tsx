"use client";
import { useMemo } from "react";
import { aggregate, applyFilters, defaultWidgets, formatNumber, type Filters, type Widget } from "@/lib/aggregate";
import { inRange, pickExisting, sum, weeklyCounts } from "@/lib/metrics";
import type { SourceDef } from "@/lib/reports";
import type { FieldMeta, TableData } from "@/lib/types";
import { weekRange } from "@/lib/week";
import ChartView from "./ChartView";
import Sparkline from "./Sparkline";

// Starting charts built from the source's configured dimensions and metrics.
export function dashboardWidgets(source: SourceDef, fields: FieldMeta[], dateField: string | undefined): Widget[] {
  const id = () => Math.random().toString(36).slice(2, 9);
  const cats = fields.filter((f) => ["select", "multiselect", "person", "checkbox", "text"].includes(f.kind));
  const dims = pickExisting(source.dims, fields);
  const fallbackDims = cats.filter((f) => f.kind !== "text").map((f) => f.name);
  const allDims = [...new Set([...dims, ...fallbackDims])];
  const metrics = pickExisting(source.metrics, fields, ["number"]);
  const status = allDims.find((d) => /檢核|狀態|status/i.test(d));
  const main = allDims.find((d) => d !== status);
  const out: Widget[] = [];

  if (dateField) out.push({ id: id(), title: "每日筆數", type: "bar", groupBy: dateField, dateBucket: "day", agg: "count", width: 2 });
  if (main) out.push({ id: id(), title: `依「${main}」筆數`, type: "hbar", groupBy: main, agg: "count", width: 1, limit: 10 });
  if (status) out.push({ id: id(), title: `「${status}」分布`, type: "pie", groupBy: status, agg: "count", width: 1 });
  if (main && metrics[0]) out.push({ id: id(), title: `各${main}「${metrics[0]}」加總（原值）`, type: "hbar", groupBy: main, agg: "sum", metric: metrics[0], width: 2, limit: 12 });
  return out.length ? out : defaultWidgets(fields.filter((f) => f.kind !== "date"));
}

function Delta({ now, prev }: { now: number; prev: number }) {
  if (prev === 0 && now === 0) return <span className="delta">與前週持平</span>;
  const diff = now - prev;
  const pct = prev ? Math.round((diff / prev) * 100) : null;
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "＝";
  return (
    <span className="delta">
      {arrow} {formatNumber(Math.abs(diff))}
      {pct !== null && diff !== 0 ? `（${diff > 0 ? "+" : "−"}${Math.abs(pct)}%）` : ""} vs 前週
    </span>
  );
}

export default function SourceDashboard({
  source,
  data,
  dateField,
  weekOffset,
  filters,
  records,
  widgets,
  colorKeys,
  onEdit,
  onRemove,
  onMove,
  onAdd,
  onReset,
}: {
  source: SourceDef;
  data: TableData;
  dateField: string | undefined; // undefined = not filtering by week
  weekOffset: number;
  filters: Filters;
  records: TableData["records"]; // current period, filtered
  widgets: Widget[];
  colorKeys: Map<string, string[]>;
  onEdit: (w: Widget) => void;
  onRemove: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onAdd: () => void;
  onReset: () => void;
}) {
  const metrics = pickExisting(source.metrics, data.fields, ["number"]).slice(0, 2);
  const numberFallback = metrics.length ? metrics : data.fields.filter((f) => f.kind === "number").slice(0, 1).map((f) => f.name);

  const prev = useMemo(() => {
    if (!dateField) return null;
    const w = weekRange(weekOffset - 1);
    return inRange(applyFilters(data, filters), dateField, w.start, w.end);
  }, [data, dateField, weekOffset, filters]);

  const trend = useMemo(() => (dateField ? weeklyCounts(data, dateField, weekOffset, 8, filters) : null), [data, dateField, weekOffset, filters]);

  return (
    <div className="dash">
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">{dateField ? "本期筆數" : "筆數"}</div>
          <div className="kpi-value">{formatNumber(records.length)}</div>
          {prev && <Delta now={records.length} prev={prev.length} />}
          {trend && (
            <div className="kpi-spark">
              <Sparkline values={trend.map((t) => t.count)} labels={trend.map((t) => t.label)} />
              <span className="muted small">近 8 週</span>
            </div>
          )}
        </div>
        {numberFallback.map((m) => {
          const now = sum(records, m);
          const before = prev ? sum(prev, m) : null;
          return (
            <div className="kpi" key={m}>
              <div className="kpi-label">
                {m} <span className="muted">加總（原值，未核定）</span>
              </div>
              <div className="kpi-value">{formatNumber(Math.round(now.total * 100) / 100)}</div>
              {before && <Delta now={Math.round(now.total * 100) / 100} prev={Math.round(before.total * 100) / 100} />}
              {now.n < records.length && <div className="kpi-sub">{records.length - now.n} 筆空白未計入</div>}
            </div>
          );
        })}
      </div>

      {records.length === 0 ? null : (
        <div className="grid">
          {widgets.map((w, i) => (
            <article key={w.id} className={`card ${w.width === 2 ? "wide" : ""}`}>
              <header>
                <h3>{w.title}</h3>
                <div className="card-actions">
                  <button title="前移" disabled={i === 0} onClick={() => onMove(i, i - 1)}>
                    ←
                  </button>
                  <button title="後移" disabled={i === widgets.length - 1} onClick={() => onMove(i, i + 1)}>
                    →
                  </button>
                  <button title="編輯" onClick={() => onEdit(w)}>
                    ✎
                  </button>
                  <button title="刪除" onClick={() => onRemove(w.id)}>
                    ✕
                  </button>
                </div>
              </header>
              <ChartView widget={w} series={aggregate(records, data.fields, w)} colorKeys={colorKeys.get(w.groupBy) ?? []} stackColorKeys={colorKeys.get(w.stackBy ?? "") ?? []} />
            </article>
          ))}
        </div>
      )}
      <div className="dash-foot">
        <button className="btn ghost small" onClick={onReset}>
          重設看板
        </button>
        <button className="btn primary small" onClick={onAdd}>
          ＋ 新增圖表
        </button>
      </div>
    </div>
  );
}
