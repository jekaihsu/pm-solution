"use client";

// Tiny bar sparkline; the last bar (current period) is emphasised.
export default function Sparkline({ values, labels, height = 28 }: { values: number[]; labels?: string[]; height?: number }) {
  const max = Math.max(1, ...values);
  const w = 8;
  const gap = 3;
  const width = values.length * (w + gap) - gap;
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`近 ${values.length} 週筆數：${values.join("、")}`}>
      {values.map((v, i) => {
        const h = v === 0 ? 1.5 : Math.max(2, (v / max) * (height - 2));
        return (
          <rect key={i} x={i * (w + gap)} y={height - h} width={w} height={h} rx={2} className={i === values.length - 1 ? "spark-now" : "spark-bar"}>
            <title>{`${labels?.[i] ?? ""}：${v} 筆`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
