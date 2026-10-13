"use client";
import { CalendarCheck, ChevronDown, ChevronRight, CircleAlert, Clock, Plane, UserPlus } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { formatNumber } from "@/lib/aggregate";
import { OVERTIME_FIELDS, pickField } from "@/lib/controlGroup";
import { inRange, resolveDateField } from "@/lib/metrics";
import { sourceByKey, sourceLabel } from "@/lib/reports";
import type { CellValue, TableData } from "@/lib/types";
import { formatDate, weekName } from "@/lib/week";
import { showSource, useShell } from "./AppShell";
import EmptyState from "./EmptyState";
import { STATUS_TEXT, useSource, type SourceState } from "./useSource";

const text = (v: CellValue) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v));
const round1 = (n: number) => formatNumber(Math.round(n * 10) / 10);
const yes = (v: CellValue) => v === true || (typeof v === "string" && /^(是|有|加班|true|y)$/i.test(v.trim())) || (Array.isArray(v) && v.some((x) => /^(是|有)$/.test(x)));

// Cost sheets that record overtime (是否加班／加班時數／加班類型), one hook each in a fixed order.
const OVERTIME_SOURCES = ["v3-internal-cost", "v4-field-cost", "v4-internal-cost"];

interface OtRow {
  group: string;
  sheets: TableData["records"];
  hours: number;
  hoursFilled: number;
  types: Map<string, number>;
  people: Set<string>;
}

function OvertimeSection({ srcKey, state, start, end }: { srcKey: string; state: SourceState; start: number; end: number }) {
  const src = sourceByKey(srcKey)!;
  const [open, setOpen] = useState<string | null>(null);

  const view = useMemo(() => {
    const d = state.data;
    if (!d) return null;
    const f = {
      flag: pickField(d.fields, ["是否加班"]),
      hours: pickField(d.fields, ["加班時數"], ["number"]),
      type: pickField(d.fields, ["加班類型"]),
      group: pickField(d.fields, ["內業組別", "所屬組別", "組別"]),
      person: pickField(d.fields, ["填報人", "組長", "姓名"]),
      no: d.fields.find((x) => x.primary) ?? d.fields[0],
    };
    const dateField = resolveDateField(src, d.fields);
    if (!dateField || (!f.flag && !f.hours)) return { f, dateField, rows: [] as OtRow[], total: 0, sheets: 0 };
    const week = inRange(d.records, dateField, start, end).filter(
      (r) => (f.flag && yes(r.fields[f.flag.name])) || (f.hours && typeof r.fields[f.hours.name] === "number" && (r.fields[f.hours.name] as number) > 0),
    );
    const map = new Map<string, OtRow>();
    for (const r of week) {
      const g = (f.group && text(r.fields[f.group.name])) || "（未填組別）";
      const row: OtRow = map.get(g) ?? { group: g, sheets: [], hours: 0, hoursFilled: 0, types: new Map(), people: new Set() };
      row.sheets.push(r);
      const h = f.hours ? r.fields[f.hours.name] : null;
      if (typeof h === "number") {
        row.hours += h;
        row.hoursFilled++;
      }
      const t = f.type ? text(r.fields[f.type.name]) : "";
      if (t) row.types.set(t, (row.types.get(t) ?? 0) + 1);
      const p = f.person ? text(r.fields[f.person.name]) : "";
      if (p) row.people.add(p);
      map.set(g, row);
    }
    const rows = [...map.values()].sort((a, b) => b.hours - a.hours || b.sheets.length - a.sheets.length);
    return { f, dateField, rows, total: rows.reduce((s, r) => s + r.hours, 0), sheets: week.length };
  }, [state.data, src, start, end]);

  if (state.status !== "ok" || !state.data) {
    return (
      <div className="hr-src">
        <div className="hr-src-head">{sourceLabel(src)}</div>
        <p className={`small ${state.status === "error" ? "bad-text" : "muted"}`}>
          {STATUS_TEXT[state.status]}
          {state.error ? `：${state.error}` : ""}
        </p>
      </div>
    );
  }
  if (!view) return null;
  const { f } = view;
  if (!f.flag && !f.hours) {
    return (
      <div className="hr-src">
        <div className="hr-src-head">{sourceLabel(src)}</div>
        <p className="muted small">此資料表沒有「是否加班」或「加班時數」欄位。</p>
      </div>
    );
  }

  return (
    <div className="hr-src">
      <div className="hr-src-head">
        {sourceLabel(src)}
        <span className="muted small">
          {view.sheets} 張加班成本單・{f.hours ? `${round1(view.total)} 小時` : "無加班時數欄位"}・依「{view.dateField}」
        </span>
      </div>
      {view.rows.length === 0 ? (
        <p className="muted small">本期沒有加班紀錄。</p>
      ) : (
        <div className="cg-table">
          <table>
            <thead>
              <tr>
                <th aria-label="展開" />
                <th>組別</th>
                <th className="num">加班單數</th>
                <th className="num">加班時數</th>
                <th>加班類型</th>
                <th>填報人</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <Fragment key={r.group}>
                  <tr className={`cg-row ${open === r.group ? "open" : ""}`} onClick={() => setOpen(open === r.group ? null : r.group)}>
                    <td className="cg-caret">{open === r.group ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                    <td className="cg-group">{r.group}</td>
                    <td className="num">{r.sheets.length}</td>
                    <td className="num strong">{f.hours && r.hoursFilled ? round1(r.hours) : "—"}</td>
                    <td>{[...r.types].map(([t, n]) => <span key={t} className="tag">{`${t} ${n}`}</span>)}</td>
                    <td className="cg-items">{[...r.people].join("、") || "—"}</td>
                  </tr>
                  {open === r.group && (
                    <tr className="cg-detail-row">
                      <td colSpan={6}>
                        <div className="cg-detail">
                          <table>
                            <thead>
                              <tr>
                                <th>單號</th>
                                <th>日期</th>
                                <th>填報人</th>
                                <th className="num">加班時數</th>
                                <th>加班類型</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.sheets.map((s) => (
                                <tr key={s.id}>
                                  <td>{text(s.fields[f.no.name]) || s.id}</td>
                                  <td>{typeof s.fields[view.dateField!] === "number" ? formatDate(s.fields[view.dateField!] as number) : "—"}</td>
                                  <td>{f.person ? text(s.fields[f.person.name]) || "—" : "—"}</td>
                                  <td className="num">{f.hours && typeof s.fields[f.hours.name] === "number" ? round1(s.fields[f.hours.name] as number) : "—"}</td>
                                  <td>{f.type ? text(s.fields[f.type.name]) || "—" : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
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
  const { week, version } = useShell();
  // Fixed list → stable hook order.
  const states = OVERTIME_SOURCES.map((k) => [k, useSource(k, { fields: OVERTIME_FIELDS })] as const);
  const visible = states.filter(([k]) => showSource(sourceByKey(k)!, version));

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
            <CircleAlert size={14} /> 取自成本單的「是否加班／加班時數／加班類型」；時數是整張成本單（一組一天）的填報值，不是每人實際時數。V3 與 V4 分開列，不相加。
          </li>
        </ul>
        {visible.length === 0 ? (
          <EmptyState kind="empty" title="此版本沒有加班資料來源" />
        ) : (
          visible.map(([k, s]) => <OvertimeSection key={k} srcKey={k} state={s} start={week.start} end={week.end} />)
        )}
      </section>
    </div>
  );
}
