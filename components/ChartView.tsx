"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, type Series, type Widget } from "@/lib/aggregate";
import { MAX_SERIES, OTHER, colorFor, useChartTheme } from "./palette";

// Collapse long tails so we never exceed the categorical palette.
function foldRows(rows: Series["rows"]): Series["rows"] {
  if (rows.length <= MAX_SERIES) return rows;
  const head = rows.slice(0, MAX_SERIES - 1);
  const rest = rows.slice(MAX_SERIES - 1).reduce((s, r) => s + Number(r.value ?? 0), 0);
  return [...head, { name: OTHER, value: Math.round(rest * 100) / 100, __total: rest }];
}

function foldStacks(series: Series): { rows: Series["rows"]; keys: string[] } {
  const totals = new Map<string, number>();
  for (const r of series.rows) for (const k of series.stackKeys) totals.set(k, (totals.get(k) ?? 0) + Number(r[k] ?? 0));
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  if (ranked.length <= MAX_SERIES) return { rows: series.rows, keys: ranked };
  const keep = ranked.slice(0, MAX_SERIES - 1);
  const rows = series.rows.map((r) => {
    const out: Record<string, string | number> = { name: r.name };
    let other = 0;
    for (const k of series.stackKeys) {
      if (keep.includes(k)) out[k] = r[k] ?? 0;
      else other += Number(r[k] ?? 0);
    }
    out[OTHER] = Math.round(other * 100) / 100;
    return out;
  });
  return { rows, keys: [...keep, OTHER] };
}

export default function ChartView({
  widget,
  series,
  colorKeys,
  stackColorKeys,
}: {
  widget: Widget;
  series: Series;
  colorKeys: string[]; // stable category order for the group-by field
  stackColorKeys: string[]; // stable category order for the stack-by field
}) {
  const theme = useChartTheme();
  const valueLabel = widget.agg === "count" ? "筆數" : `${widget.metric}（${aggLabel(widget.agg)}）`;

  if (!series.rows.length) return <div className="empty">沒有符合條件的資料</div>;

  const axisProps = {
    stroke: theme.axis,
    tick: { fill: theme.muted, fontSize: 12 },
    tickLine: false,
  };
  const tooltip = (
    <Tooltip
      cursor={{ fill: theme.grid, opacity: 0.5, stroke: theme.axis }}
      formatter={(v) => formatNumber(Number(v))}
      contentStyle={{ background: theme.surface, border: `1px solid ${theme.grid}`, borderRadius: 8, color: theme.text, fontSize: 13 }}
      labelStyle={{ color: theme.text, fontWeight: 600 }}
    />
  );
  const grid = <CartesianGrid stroke={theme.grid} vertical={false} />;
  const legend = <Legend wrapperStyle={{ fontSize: 12, color: theme.text }} iconType="circle" iconSize={8} />;

  if (widget.type === "pie") {
    const rows = foldRows(series.rows);
    const total = rows.reduce((s, r) => s + Number(r.value), 0);
    return (
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={1}
            stroke={theme.surface}
            strokeWidth={2}
            isAnimationActive={false}
          >
            {rows.map((r) => (
              <Cell key={String(r.name)} fill={colorFor(String(r.name), colorKeys, theme)} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => `${formatNumber(Number(v))}（${total ? ((Number(v) / total) * 100).toFixed(1) : 0}%）`}
            contentStyle={{ background: theme.surface, border: `1px solid ${theme.grid}`, borderRadius: 8, color: theme.text, fontSize: 13 }}
            itemStyle={{ color: theme.text }}
          />
          <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (widget.type === "stacked") {
    const { rows, keys } = foldStacks(series);
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={rows} barCategoryGap="20%">
          {grid}
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} axisLine={false} tickFormatter={formatNumber} width={48} />
          {tooltip}
          {legend}
          {keys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              stackId="s"
              fill={colorFor(k, stackColorKeys, theme)}
              stroke={theme.surface}
              strokeWidth={1}
              radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (widget.type === "line" || widget.type === "area") {
    const color = theme.series[0];
    const Chart = widget.type === "line" ? LineChart : AreaChart;
    return (
      <ResponsiveContainer width="100%" height={280}>
        <Chart data={series.rows}>
          {grid}
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} axisLine={false} tickFormatter={formatNumber} width={48} />
          {tooltip}
          {widget.type === "line" ? (
            <Line dataKey="value" name={valueLabel} stroke={color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
          ) : (
            <Area dataKey="value" name={valueLabel} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.15} isAnimationActive={false} />
          )}
        </Chart>
      </ResponsiveContainer>
    );
  }

  // bar / hbar — single series, one color; the title names it.
  const horizontal = widget.type === "hbar";
  const color = theme.series[0];
  const height = horizontal ? Math.max(200, series.rows.length * 30 + 40) : 280;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={series.rows} layout={horizontal ? "vertical" : "horizontal"} barCategoryGap="25%" margin={{ right: horizontal ? 40 : 8, top: 16 }}>
        <CartesianGrid stroke={theme.grid} horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axisProps} axisLine={false} tickFormatter={formatNumber} />
            <YAxis type="category" dataKey="name" {...axisProps} width={110} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" {...axisProps} interval={0} angle={series.rows.length > 6 ? -30 : 0} textAnchor={series.rows.length > 6 ? "end" : "middle"} height={series.rows.length > 6 ? 60 : 30} />
            <YAxis {...axisProps} axisLine={false} tickFormatter={formatNumber} width={48} />
          </>
        )}
        {tooltip}
        <Bar
          dataKey="value"
          name={valueLabel}
          fill={color}
          radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          isAnimationActive={false}
          label={series.rows.length <= 12 ? { position: horizontal ? "right" : "top", fill: theme.muted, fontSize: 11, formatter: (v: unknown) => formatNumber(Number(v)) } : undefined}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function aggLabel(agg: Widget["agg"]): string {
  return { count: "筆數", sum: "加總", avg: "平均", min: "最小", max: "最大" }[agg];
}
