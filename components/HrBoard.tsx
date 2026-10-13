"use client";
import { CalendarCheck, CircleAlert, Clock, Plane, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/aggregate";
import { pickField } from "@/lib/controlGroup";
import type { CellValue, TableData } from "@/lib/types";
import { weekName } from "@/lib/week";
import { useShell } from "./AppShell";
import { STATUS_TEXT, useSource, type SourceState } from "./useSource";

const text = (v: CellValue) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v));
const round1 = (n: number) => formatNumber(Math.round(n * 10) / 10);

// 薪水總表 is monthly: one row per person per month. The server only ever asks
// Lark for overtime hours/days plus who/which group/which month.
const NAME = ["姓名", "員工姓名", "員工", "人員", "名字"];
const GROUP = ["組別", "所屬組別", "部門"];
const MONTH = ["月份", "年月", "薪資月份", "計薪月份", "期間", "月"];

function monthKey(v: CellValue, isDate: boolean): string | null {
  if (isDate && typeof v === "number") {
    const d = new Date(v + 8 * 3600000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const m = text(v).match(/(\d{2,4})\D{0,3}(\d{1,2})/);
  if (!m) return null;
  let y = Number(m[1]);
  if (y < 1000) y += 1911; // 民國年
  return `${y}-${m[2].padStart(2, "0")}`;
}

function SalaryOvertime({ state, weekStart }: { state: SourceState; weekStart: number }) {
  const [picked, setPicked] = useState<string | null>(null);
  const view = useMemo(() => {
    const d = state.data;
    if (!d) return null;
    const name = pickField(d.fields, NAME) ?? d.fields.find((f) => f.primary);
    const group = pickField(d.fields, GROUP);
    const month = pickField(d.fields, MONTH) ?? d.fields.find((f) => f.kind === "date");
    const ot = d.fields.filter((f) => /加班/.test(f.name) && d.records.some((r) => typeof r.fields[f.name] === "number"));
    const hourFields = ot.filter((f) => !/天/.test(f.name));
    const byMonth = new Map<string, TableData["records"]>();
    for (const r of d.records) {
      const k = month ? monthKey(r.fields[month.name], month.kind === "date") : null;
      const key = k ?? "（未填月份）";
      byMonth.set(key, [...(byMonth.get(key) ?? []), r]);
    }
    const months = [...byMonth.keys()].sort().reverse();
    return { name, group, month, ot, hourFields, byMonth, months };
  }, [state.data]);

  if (state.status === "forbidden") {
    return (
      <div className="hr-pending">
        <p>{state.error}</p>
        {state.openId && (
          <p className="muted small">
            你的 Lark ID：<code className="mono">{state.openId}</code>（如需查看，請提供給管理員加入 HR_VIEWERS）
          </p>
        )}
      </div>
    );
  }
  if (state.status !== "ok" || !state.data || !view) {
    return (
      <p className={`small ${state.status === "error" ? "bad-text" : "muted"}`}>
        {STATUS_TEXT[state.status]}
        {state.error ? `：${state.error}` : ""}
      </p>
    );
  }
  if (!view.ot.length) return <p className="muted small">薪水總表找不到有數字的「加班」欄位（已讀取的欄位：{state.data.fields.map((f) => f.name).join("、") || "無"}）。</p>;

  const d = new Date(weekStart + 8 * 3600000);
  const weekMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const current = picked && view.byMonth.has(picked) ? picked : view.byMonth.has(weekMonth) ? weekMonth : view.months[0];
  const records = view.byMonth.get(current) ?? [];
  const num = (r: TableData["records"][number], f: { name: string }) => (typeof r.fields[f.name] === "number" ? (r.fields[f.name] as number) : 0);
  const rows = records
    .map((r) => ({
      id: r.id,
      name: view.name ? text(r.fields[view.name.name]) || "—" : "—",
      group: view.group ? text(r.fields[view.group.name]) || "—" : "—",
      values: view.ot.map((f) => (typeof r.fields[f.name] === "number" ? (r.fields[f.name] as number) : null)),
      total: view.hourFields.reduce((s, f) => s + num(r, f), 0),
    }))
    .filter((r) => r.values.some((v) => v))
    .sort((a, b) => b.total - a.total);
  const groups = new Map<string, number>();
  for (const r of rows) groups.set(r.group, (groups.get(r.group) ?? 0) + r.total);

  return (
    <div className="hr-src">
      <div className="hr-src-head">
        薪水總表
        <span className="muted small">
          以月為單位・{view.month ? `依「${view.month.name}」` : "找不到月份欄位"}・{rows.length} 人有加班
        </span>
      </div>
      {view.months.length > 1 && (
        <div className="cg-picker" role="group" aria-label="選擇月份">
          {view.months.slice(0, 12).map((m) => (
            <button key={m} className={`cg-chip ${m === current ? "on" : ""}`} onClick={() => setPicked(m)} aria-pressed={m === current}>
              {m}
            </button>
          ))}
        </div>
      )}
      {view.hourFields.length > 0 && groups.size > 0 && (
        <div className="cg-focus-items">
          <span className="muted small">各組加班時數</span>
          {[...groups].sort((a, b) => b[1] - a[1]).map(([g, h]) => (
            <span key={g} className="tag">
              {g} {round1(h)}
            </span>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="muted small">{current} 沒有加班紀錄。</p>
      ) : (
        <div className="cg-detail">
          <table>
            <thead>
              <tr>
                <th>姓名</th>
                <th>組別</th>
                {view.ot.map((f) => (
                  <th key={f.name} className="num">
                    {f.name}
                  </th>
                ))}
                {view.hourFields.length > 1 && <th className="num">加班時數合計</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="strong">{r.name}</td>
                  <td>{r.group}</td>
                  {r.values.map((v, i) => (
                    <td key={i} className="num">
                      {v === null ? "—" : round1(v)}
                    </td>
                  ))}
                  {view.hourFields.length > 1 && <td className="num strong">{round1(r.total)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Pending({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="hr-card">
      <div className="hr-card-head">
        {icon}
        <h2>{title}</h2>
      </div>
      <div className="hr-pending">{children}</div>
    </section>
  );
}

export default function HrBoard() {
  const { week } = useShell();
  const salary = useSource("salary-overtime");

  return (
    <div className="hr">
      <Pending icon={<UserPlus size={16} />} title="招聘">
        <p>暫無。</p>
      </Pending>

      <Pending icon={<CalendarCheck size={16} />} title="出勤紀錄">
        <p>出勤資料在 Lark「假勤」，不在多維表格。要顯示需由管理員：</p>
        <ol>
          <li>在 PM週報 應用開通假勤唯讀權限並發布新版本；</li>
          <li>決定哪些人可以看出勤資料（個人資料，見 D-09）。</li>
        </ol>
        <p className="muted small">完成前不讀取、不顯示任何出勤資料。</p>
      </Pending>

      <Pending icon={<Plane size={16} />} title="出差紀錄">
        <p>出差申請在 Lark「審批」，不在多維表格。要顯示需由管理員：</p>
        <ol>
          <li>確認出差使用哪一個審批表單；</li>
          <li>在 PM週報 應用開通審批唯讀權限並發布新版本；</li>
          <li>決定哪些人可以看出差資料。</li>
        </ol>
        <p className="muted small">外業成本單的「是否過夜／住宿」是住宿津貼用途，不等於出差紀錄，未拿來代替。</p>
      </Pending>

      <section className="hr-card">
        <div className="hr-card-head">
          <Clock size={16} />
          <h2>加班紀錄</h2>
          <span className="muted small">
            {weekName(week.offset)} {week.label}
          </span>
        </div>
        <ul className="cg-notes">
          <li>
            <CircleAlert size={14} /> 取自 Lark「薪水總表」，只讀加班時數／天數與姓名、組別、月份；底薪、總薪資、加班費等其他欄位不讀取。只有 HR_VIEWERS 名單內的人看得到。
          </li>
        </ul>
        <SalaryOvertime state={salary} weekStart={week.start} />
      </section>
    </div>
  );
}
