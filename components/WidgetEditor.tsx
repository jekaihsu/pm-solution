"use client";
import { useState } from "react";
import type { ChartType, Widget } from "@/lib/aggregate";
import type { FieldMeta } from "@/lib/types";

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: "bar", label: "長條圖" },
  { value: "hbar", label: "橫向長條圖" },
  { value: "stacked", label: "堆疊長條圖" },
  { value: "line", label: "折線圖" },
  { value: "area", label: "面積圖" },
  { value: "pie", label: "圓餅圖" },
];

export default function WidgetEditor({
  fields,
  initial,
  onSave,
  onCancel,
}: {
  fields: FieldMeta[];
  initial: Widget;
  onSave: (w: Widget) => void;
  onCancel: () => void;
}) {
  const [w, setW] = useState<Widget>(initial);
  const set = <K extends keyof Widget>(k: K, v: Widget[K]) => setW((prev) => ({ ...prev, [k]: v }));

  const numbers = fields.filter((f) => f.kind === "number");
  const categorical = fields.filter((f) => ["select", "multiselect", "person", "checkbox", "text"].includes(f.kind));
  const groupField = fields.find((f) => f.name === w.groupBy);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave(w.agg !== "count" && !w.metric ? { ...w, metric: numbers[0]?.name } : w);
        }}
      >
        <h3>{initial.title ? "編輯圖表" : "新增圖表"}</h3>

        <label>
          標題
          <input value={w.title} onChange={(e) => set("title", e.target.value)} placeholder="例如：各狀態任務數" required />
        </label>

        <label>
          圖表類型
          <select value={w.type} onChange={(e) => set("type", e.target.value as ChartType)}>
            {CHART_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          分組欄位（X 軸 / 類別）
          <select value={w.groupBy} onChange={(e) => set("groupBy", e.target.value)}>
            {fields.map((f) => (
              <option key={f.id} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        {groupField?.kind === "date" && (
          <label>
            日期粒度
            <select value={w.dateBucket ?? "month"} onChange={(e) => set("dateBucket", e.target.value as Widget["dateBucket"])}>
              <option value="day">日</option>
              <option value="week">週</option>
              <option value="month">月</option>
              <option value="quarter">季</option>
              <option value="year">年</option>
            </select>
          </label>
        )}

        {w.type === "stacked" && (
          <label>
            堆疊欄位（顏色）
            <select value={w.stackBy ?? ""} onChange={(e) => set("stackBy", e.target.value || undefined)}>
              <option value="">（無）</option>
              {categorical.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="row">
          <label>
            計算方式
            <select value={w.agg} onChange={(e) => set("agg", e.target.value as Widget["agg"])}>
              <option value="count">筆數</option>
              <option value="sum" disabled={!numbers.length}>
                加總
              </option>
              <option value="avg" disabled={!numbers.length}>
                平均
              </option>
              <option value="min" disabled={!numbers.length}>
                最小
              </option>
              <option value="max" disabled={!numbers.length}>
                最大
              </option>
            </select>
          </label>
          {w.agg !== "count" && (
            <label>
              數值欄位
              <select value={w.metric ?? numbers[0]?.name} onChange={(e) => set("metric", e.target.value)}>
                {numbers.map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="row">
          <label>
            最多顯示類別數
            <input type="number" min={1} max={100} value={w.limit ?? ""} placeholder="不限" onChange={(e) => set("limit", e.target.value ? Number(e.target.value) : undefined)} />
          </label>
          <label>
            寬度
            <select value={w.width} onChange={(e) => set("width", Number(e.target.value) as 1 | 2)}>
              <option value={1}>半寬</option>
              <option value={2}>全寬</option>
            </select>
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="btn primary">
            儲存
          </button>
        </div>
      </form>
    </div>
  );
}
