"use client";
import { ArrowDownRight, ArrowUpRight, Minus, Plus, RotateCcw } from "lucide-react";
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
  const diff = Math.round((now - prev) * 100) / 100;
  const pct = prev ? Math.round((diff / prev) * 100) : null;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  return (
    <span className="delta-row">
      <span className="delta">
        <Icon size={13} strokeWidth={2} />
        {diff === 0 ? "持平" : `${formatNumber(Math.abs(diff))}${pct !== null ? `（${Math.abs(pct)}%）` : ""}`}
      </span>
      <span className="muted">較前週</span>
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
          <div className="kpi-main">
            <div className="kpi-value">{formatNumber(records.length)}</div>
            {trend && <Sparkline values={trend.map((t) => t.count)} labels={trend.map((t) => t.label)} />}
          </div>
          {prev ? <Delta now={records.length} prev={prev.length} /> : <span className="delta-row muted">未依週篩選</span>}
        </div>
        {numberFallback.map((m) => {
          const now = sum(records, m);
          const before = prev ? sum(prev, m) : null;
          return (
            <div className="kpi" key={m}>
              <div className="kpi-label" title="原始值加總，尚未核定">
                {m} 加總
                <span className="kpi-tag">原值</span>
              </div>
              <div className="kpi-main">
                <div className="kpi-value">{formatNumber(Math.round(now.total * 100) / 100)}</div>
              </div>
              {before ? <Delta now={now.total} prev={before.total} /> : null}
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
        <button className="btn ghost" onClick={onReset}>
          <RotateCcw size={14} strokeWidth={1.75} />
          重設
        </button>
        <button className="btn" onClick={onAdd}>
          <Plus size={14} strokeWidth={1.75} />
          新增圖表
        </button>
      </div>
    </div>
  );
}
