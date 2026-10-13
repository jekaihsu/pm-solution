"use client";
import { ArrowDownRight, ArrowUpRight, CheckCheck, ChevronDown, ChevronRight, CircleAlert, CircleCheck, Minus } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatNumber } from "@/lib/aggregate";
import { COST_FIELDS, JOINED_DATE, SCHEDULE_FIELDS, WORK_FIELDS, anomalies, classifyCheck, dayOfWeek, errorRate, fixDiffs, groupRows, orderNotes, violatesSop, joinInternal, plannedPoints, resolveFixFields, resolveScheduleFields, resolveWorkFields, type FixFields, type GroupRow, type WorkFields } from "@/lib/controlGroup";
import { inRange, resolveDateField } from "@/lib/metrics";
import { sourceByKey, type DataVersion } from "@/lib/reports";
import type { CellValue, TableData } from "@/lib/types";
import { formatDate, weekName } from "@/lib/week";
import { useShell } from "./AppShell";
import EmptyState from "./EmptyState";
import { MOBILE, useMedia } from "./useMedia";
import OwnerProgress from "./OwnerProgress";
import { STATUS_TEXT, useSource } from "./useSource";

export interface BoardConfig {
  report: "r01" | "r02";
  workKey: (v: DataVersion) => string;
  workLabel: string;
  costKey?: (v: DataVersion) => string; // internal work: group + date come from the linked cost sheet
  scheduleKey: (v: DataVersion) => string;
  keepTrade: (trade: string) => boolean; // which schedule rows (by 業別) belong to this board
  keepWorkTrade?: (trade: string) => boolean; // when the work sheet has a 業別 field, which rows belong here
  needsTrade: boolean; // true when the board can't work without a 業別 field
  scheduleTradeLabel?: string;
  checkNames: string[];
  checkLabel: string;
  ownerProgress?: boolean;
}

export const BOARDS: Record<"r01" | "r02", BoardConfig> = {
  r01: {
    report: "r01",
    workKey: (v) => `${v}-field-work`,
    workLabel: "外業工作單",
    scheduleKey: (v) => `${v}-schedule`,
    keepTrade: (t) => !/內業/.test(t),
    keepWorkTrade: (t) => !/內業/.test(t), // 控制組只看外業
    needsTrade: false,
    scheduleTradeLabel: "業別不是內業",
    checkNames: ["控制組檢核"],
    checkLabel: "控制組檢核",
  },
  r02: {
    report: "r02",
    workKey: (v) => `${v}-internal-work`,
    workLabel: "內業工作單",
    costKey: (v) => `${v}-internal-cost`,
    scheduleKey: (v) => `${v}-schedule`,
    keepTrade: (t) => /內業/.test(t),
    needsTrade: true,
    scheduleTradeLabel: "業別為內業",
    checkNames: ["雅雯檢核"],
    checkLabel: "雅雯檢核（數量檢查）",
    ownerProgress: true,
  },
};

interface SopEntry {
  ok: boolean;
  by: string;
  at: number;
}

const round1 = (n: number) => formatNumber(Math.round(n * 10) / 10);
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const text = (v: CellValue) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : typeof v === "number" ? formatNumber(v) : String(v));

function Diff({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">—</span>;
  const r = Math.round(value * 10) / 10;
  const Icon = r > 0 ? ArrowUpRight : r < 0 ? ArrowDownRight : Minus;
  return (
    <span className={`cg-diff ${r < 0 ? "neg" : ""}`}>
      <Icon size={13} strokeWidth={2} />
      {r > 0 ? "+" : r < 0 ? "−" : ""}
      {formatNumber(Math.abs(r))}
    </span>
  );
}

function useSop(report: string, version: DataVersion, weekStart: number) {
  // Everything is tagged with the version + week it belongs to: a switch shows
  // nothing (and allows no ticks) until that week's sign-offs are loaded, and a
  // late response for another week is dropped.
  const tag = `${report}|${version}|${weekStart}`;
  const current = useRef(tag);
  current.current = tag;
  const [state, setState] = useState<{
    tag: string;
    entries: Record<string, SopEntry>;
    persistent: boolean;
    perm: { canEdit: boolean; reason?: string; openId?: string };
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetch(`/api/sop?report=${report}&version=${version}&week=${weekStart}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.error) setError(j.error);
        setState({ tag, entries: j.entries ?? {}, persistent: j.persistent !== false, perm: { canEdit: Boolean(j.canEdit), reason: j.reason, openId: j.openId } });
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [report, version, weekStart, tag]);

  const ready = state?.tag === tag ? state : null;

  const toggle = useCallback(
    async (keys: string[], ok: boolean) => {
      const sent = tag;
      const update = (fn: (e: Record<string, SopEntry>) => Record<string, SopEntry>) =>
        setState((s) => (s && s.tag === sent ? { ...s, entries: fn(s.entries) } : s));
      const prev: Record<string, SopEntry | undefined> = {};
      update((e) => {
        const next = { ...e };
        for (const k of keys) {
          prev[k] = e[k];
          next[k] = { ok, by: "儲存中…", at: Date.now() };
        }
        return next;
      });
      try {
        const r = await fetch("/api/sop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report, version, weekStart, groups: keys, ok }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        update((e) => ({ ...e, ...Object.fromEntries(keys.map((k) => [k, j.entry])) }));
        if (current.current === sent) setError("");
      } catch (err) {
        update((e) => {
          const next = { ...e };
          for (const k of keys) {
            const p = prev[k];
            if (p) next[k] = p;
            else delete next[k];
          }
          return next;
        });
        if (current.current === sent) setError(String((err as Error).message ?? err));
      }
    },
    [tag, report, version, weekStart],
  );

  return {
    loaded: Boolean(ready),
    entries: ready?.entries ?? {},
    persistent: ready?.persistent ?? true,
    perm: ready?.perm ?? { canEdit: false },
    error,
    toggle,
  };
}

// SOP is ticked per work order; the group only shows how many are done.
const orderKey = (id: string) => `order:${id}`;
type Sop = ReturnType<typeof useSop>;

function sopCount(row: GroupRow, entries: Record<string, SopEntry>) {
  return row.orders.filter((r) => entries[orderKey(r.id)]?.ok).length;
}

function SopStatus({ done, total }: { done: number; total: number }) {
  if (total > 0 && done === total)
    return (
      <span className="pill pill-good cg-sop-done">
        <CircleCheck size={12} /> SOP 完成
      </span>
    );
  if (done > 0) return <span className="pill pill-warn">SOP {done}/{total}</span>;
  return <span className="pill">未確認</span>;
}

// When the 日報 has「是否違反SOP」(filled in Lark) that is the answer; the site's
// own ticks are only used for tables without it.
function sopSummary(row: GroupRow, wf: WorkFields) {
  let viol = 0;
  let filled = 0;
  for (const o of row.orders) {
    const v = violatesSop(o, wf);
    if (v !== null) filled++;
    if (v) viol++;
  }
  return { viol, filled, total: row.orders.length };
}

function GroupSop({ row, wf, entries }: { row: GroupRow; wf: WorkFields; entries: Record<string, SopEntry> }) {
  if (!wf.sopViolation) return <SopStatus done={sopCount(row, entries)} total={row.orders.length} />;
  const { viol, filled, total } = sopSummary(row, wf);
  if (viol)
    return (
      <span className="pill pill-bad">
        <CircleAlert size={12} /> 違反 SOP {viol} 張
      </span>
    );
  if (filled === total && total > 0)
    return (
      <span className="pill pill-good cg-sop-done">
        <CircleCheck size={12} /> SOP 完成
      </span>
    );
  return <span className="pill">{filled ? `已填 ${filled}/${total}，無違反` : "未填"}</span>;
}

function SopBox({ id, label, entry, onToggle, disabled }: { id: string; label: string; entry?: SopEntry; onToggle: (keys: string[], ok: boolean) => void; disabled: boolean }) {
  return (
    <label
      className={`cg-sop ${disabled ? "readonly" : ""} ${entry?.ok ? "ok" : ""}`}
      title={entry ? `${entry.ok ? "符合" : "取消"}：${entry.by}・${new Date(entry.at).toLocaleString("zh-TW")}` : disabled ? "目前無法勾選" : "確認符合 SOP 後勾選"}
      onClick={(e) => e.stopPropagation()}
    >
      <input type="checkbox" checked={Boolean(entry?.ok)} disabled={disabled} onChange={(e) => onToggle([orderKey(id)], e.target.checked)} aria-label={`${label} 符合 SOP`} />
      <span>{entry?.ok ? "符合" : "未確認"}</span>
      {entry?.ok && <span className="cg-sop-by">{entry.by}</span>}
    </label>
  );
}

function OrderDetail({ row, wf, checkLabel, sop, disabled, ff, dateField, onlyDay, weekStart }: { row: GroupRow; wf: WorkFields; checkLabel: string; sop: Sop; disabled: boolean; ff: FixFields; dateField: string; onlyDay?: number | null; weekStart: number }) {
  const done = sopCount(row, sop.entries);
  const orders = onlyDay == null ? row.orders : row.orders.filter((r) => typeof r.fields[dateField] === "number" && dayOfWeek(r.fields[dateField] as number, weekStart) === onlyDay);
  const allDone = done === row.orders.length;
  return (
    <div className="cg-detail">
      {!disabled && !wf.sopViolation && (
        <div className="cg-detail-bar">
          <span className="muted small">
            SOP 已確認 {done}/{row.orders.length} 張
          </span>
          <button
            className="btn btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              sop.toggle(row.orders.map((r) => orderKey(r.id)), !allDone);
            }}
          >
            <CheckCheck size={14} /> {allDone ? "整組取消勾選" : "整組全部符合"}
          </button>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>工作單號</th>
            <th>工作編號</th>
            <th>工作項目</th>
            <th className="num">工作數量</th>
            <th className="num">營業額點數</th>
            <th>修改（出錯）</th>
            <th>{checkLabel.replace(/（.*）/, "")}</th>
            <th>異常</th>
            <th>備註</th>
            <th>符合 SOP</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((r) => {
            const check = classifyCheck(r, wf);
            const an = anomalies(r, wf);
            const fixes = fixDiffs(r, ff);
            const no = wf.orderNo ? text(r.fields[wf.orderNo.name]) || r.id : r.id;
            const d = r.fields[dateField];
            return (
              <tr key={r.id} className={fixes.length ? "cg-err" : undefined}>
                <td>{typeof d === "number" ? `${formatDate(d).slice(5)}（${WEEKDAYS[dayOfWeek(d, weekStart)] ?? ""}）` : "—"}</td>
                <td>{no}</td>
                <td>{wf.jobNo ? text(r.fields[wf.jobNo.name]) : "—"}</td>
                <td>{wf.item ? text(r.fields[wf.item.name]) : "—"}</td>
                <td className="num">{wf.qty ? text(r.fields[wf.qty.name]) || "—" : "—"}</td>
                <td className="num">{wf.revenue ? text(r.fields[wf.revenue.name]) || "—" : "—"}</td>
                <td>
                  {fixes.length ? (
                    fixes.map((f) => (
                      <span key={f.kind} className="pill pill-bad cg-fix">
                        {f.kind} {formatNumber(f.from)} → {formatNumber(f.to)}
                      </span>
                    ))
                  ) : (
                    <span className="muted">無</span>
                  )}
                </td>
                <td>
                  {wf.check || wf.status ? (
                    <span className={`pill ${check === "pass" ? "pill-good" : check === "fail" ? "pill-bad" : ""}`}>{check === "pass" ? "通過" : check === "fail" ? "不通過" : "未檢核"}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>{!wf.flags.length ? <span className="muted">—</span> : an.length ? an.map((a) => <span key={a} className="tag">{a}</span>) : <span className="muted">無</span>}</td>
                <td>
                  <Notes r={r} wf={wf} />
                </td>
                <td>
                  {wf.sopViolation ? (
                    (() => {
                      const v = violatesSop(r, wf);
                      return v === null ? <span className="muted">未填</span> : v ? <span className="pill pill-bad">違反</span> : <span className="pill pill-good">符合</span>;
                    })()
                  ) : (
                    <SopBox id={r.id} label={no} entry={sop.entries[orderKey(r.id)]} onToggle={sop.toggle} disabled={disabled} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

interface DayCell {
  orders: number;
  errors: number;
}

function dayCells(row: GroupRow, ff: FixFields, dateField: string, weekStart: number): DayCell[] {
  const cells = WEEKDAYS.map(() => ({ orders: 0, errors: 0 }));
  for (const r of row.orders) {
    const t = r.fields[dateField];
    if (typeof t !== "number") continue;
    const c = cells[dayOfWeek(t, weekStart)];
    if (!c) continue;
    c.orders++;
    if (fixDiffs(r, ff).length) c.errors++;
  }
  return cells;
}

function Notes({ r, wf }: { r: TableData["records"][number]; wf: WorkFields }) {
  if (!wf.notes.length) return <span className="muted">—</span>;
  const notes = orderNotes(r, wf);
  if (!notes.length) return <span className="muted">—</span>;
  return (
    <div className="cg-notes-cell">
      {notes.map((n, i) => (
        <div key={i}>
          {n.label && <span className="muted">{n.label}：</span>}
          {n.text}
        </div>
      ))}
    </div>
  );
}

function DayCellView({ c, on, onClick }: { c: DayCell; on?: boolean; onClick?: () => void }) {
  const cls = !c.orders ? "none" : c.errors ? "err" : "ok";
  return (
    <button className={`cg-day ${cls} ${on ? "on" : ""}`} onClick={onClick} disabled={!c.orders} title={!c.orders ? "沒有工作單" : c.errors ? `${c.errors}／${c.orders} 張被修改` : `${c.orders} 張，沒有修改`}>
      {!c.orders ? "·" : c.errors ? `${c.errors} 錯` : "✓"}
    </button>
  );
}

function dayHead(i: number, weekStart: number) {
  return `${WEEKDAYS[i]} ${formatDate(weekStart + i * 86400000).slice(5)}`;
}

// 每組每天有沒有出錯：rows = groups, columns = Mon–Sun.
function DayGrid({ rows, ff, dateField, weekStart, onPick }: { rows: GroupRow[]; ff: FixFields; dateField: string; weekStart: number; onPick: (g: string, day: number) => void }) {
  return (
    <div className="cg-days">
      <div className="cg-days-head">
        <h3>每日出錯</h3>
        <span className="muted small">營業額或數量被修改＝出錯・點格子看該組當天的工作單</span>
      </div>
      <div className="cg-days-scroll">
        <table>
          <thead>
            <tr>
              <th>組別</th>
              {WEEKDAYS.map((_, i) => (
                <th key={i}>{dayHead(i, weekStart)}</th>
              ))}
              <th className="num">本週出錯</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cells = dayCells(r, ff, dateField, weekStart);
              const err = cells.reduce((s, c) => s + c.errors, 0);
              const errDays = cells.filter((c) => c.errors).length;
              return (
                <tr key={r.group}>
                  <td className="cg-group">{r.group}</td>
                  {cells.map((c, i) => (
                    <td key={i}>
                      <DayCellView c={c} onClick={() => onPick(r.group, i)} />
                    </td>
                  ))}
                  <td className="num">{err ? <span className="bad-text">{err} 張・{errDays} 天</span> : <span className="muted">0</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 失誤明細：哪一組、誰的工作單被檢核「不通過」。
function FailPanel({ rows, wf, cfg, dateField, weekStart, onPick }: { rows: GroupRow[]; wf: WorkFields; cfg: BoardConfig; dateField: string; weekStart: number; onPick?: (g: string) => void }) {
  const fails = rows.map((r) => ({ row: r, orders: r.orders.filter((o) => classifyCheck(o, wf) === "fail") })).filter((x) => x.orders.length);
  const people = new Map<string, { fails: number; groups: Set<string> }>();
  for (const { row, orders } of fails)
    for (const o of orders) {
      const names = wf.person ? (Array.isArray(o.fields[wf.person.name]) ? (o.fields[wf.person.name] as string[]) : [text(o.fields[wf.person.name])]).filter(Boolean) : [];
      for (const n of names.length ? names : ["（未填出工人）"]) {
        const p = people.get(n) ?? { fails: 0, groups: new Set<string>() };
        p.fails++;
        p.groups.add(row.group);
        people.set(n, p);
      }
    }
  const label = cfg.checkLabel.replace(/（.*）/, "");
  if (!fails.length) return <div className="cg-fail"><p className="muted small">這週沒有{label}「不通過」的工作單。</p></div>;
  return (
    <div className="cg-fail">
      <div className="cg-fail-cols">
        <div>
          <h4>依組別</h4>
          <table>
            <thead>
              <tr>
                <th>組別</th>
                <th className="num">不通過</th>
                <th className="num">已檢核</th>
                <th className="num">失誤率</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].filter((r) => r.pass + r.fail > 0).sort((a, b) => (errorRate(b) ?? 0) - (errorRate(a) ?? 0)).map((r) => (
                <tr key={r.group} className={onPick ? "cg-link" : undefined} onClick={onPick ? () => onPick(r.group) : undefined}>
                  <td className="cg-group">{r.group}</td>
                  <td className={`num ${r.fail ? "bad-text" : ""}`}>{r.fail}</td>
                  <td className="num">{r.pass + r.fail}</td>
                  <td className="num">{pct(errorRate(r))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h4>依人員{wf.person ? `（${wf.person.name}）` : ""}</h4>
          {wf.person ? (
            <table>
              <thead>
                <tr>
                  <th>人員</th>
                  <th className="num">不通過張數</th>
                  <th>組別</th>
                </tr>
              </thead>
              <tbody>
                {[...people].sort((a, b) => b[1].fails - a[1].fails).map(([n, p]) => (
                  <tr key={n}>
                    <td className="strong">{n}</td>
                    <td className="num bad-text">{p.fails}</td>
                    <td>{[...p.groups].join("、")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted small">找不到出工人欄位，無法依人員列出。</p>
          )}
        </div>
      </div>
      <h4>不通過的工作單</h4>
      <div className="cg-detail">
        <table>
          <thead>
            <tr>
              <th>組別</th>
              <th>日期</th>
              <th>工作單號</th>
              <th>出工人</th>
              <th>工作編號</th>
              <th>工作項目</th>
              <th className="num">工作數量</th>
              <th className="num">營業額點數</th>
              <th>備註</th>
            </tr>
          </thead>
          <tbody>
            {fails.flatMap(({ row, orders }) =>
              orders.map((o) => {
                const d = o.fields[dateField];
                return (
                  <tr key={o.id}>
                    <td className="cg-group">{row.group}</td>
                    <td>{typeof d === "number" ? `${formatDate(d).slice(5)}（${WEEKDAYS[dayOfWeek(d, weekStart)] ?? ""}）` : "—"}</td>
                    <td>{wf.orderNo ? text(o.fields[wf.orderNo.name]) || o.id : o.id}</td>
                    <td className="strong">{wf.person ? text(o.fields[wf.person.name]) || "—" : "—"}</td>
                    <td>{wf.jobNo ? text(o.fields[wf.jobNo.name]) || "—" : "—"}</td>
                    <td>{wf.item ? text(o.fields[wf.item.name]) || "—" : "—"}</td>
                    <td className="num">{wf.qty ? text(o.fields[wf.qty.name]) || "—" : "—"}</td>
                    <td className="num">{wf.revenue ? text(o.fields[wf.revenue.name]) || "—" : "—"}</td>
                    <td>
                      <Notes r={o} wf={wf} />
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 簡表: the boss's preferred layout — one row per group, plain counts, a 合計 row
// and a summary block underneath. Clicking a group opens it.
function SheetTable({ rows, wf, ff, hasCheck, hasFix, onPick }: { rows: GroupRow[]; wf: WorkFields; ff: FixFields; hasCheck: boolean; hasFix: boolean; onPick: (g: string) => void }) {
  const data = rows.map((r) => {
    const fixed = r.orders.filter((o) => fixDiffs(o, ff).length).length;
    const sop = wf.sopViolation ? sopSummary(r, wf) : null;
    return { r, fixed, viol: sop ? sop.viol : null, diff: r.planned && wf.revenue ? r.revenue - r.planned.points : null };
  });
  const sum = (f: (d: (typeof data)[number]) => number) => data.reduce((s, d) => s + f(d), 0);
  const t = {
    orders: sum((d) => d.r.orders.length),
    checked: sum((d) => d.r.pass + d.r.fail),
    fail: sum((d) => d.r.fail),
    unchecked: sum((d) => d.r.unchecked),
    fixed: sum((d) => d.fixed),
    viol: sum((d) => d.viol ?? 0),
    revenue: sum((d) => d.r.revenue),
    planned: sum((d) => d.r.planned?.points ?? 0),
    hasPlan: data.some((d) => d.r.planned),
  };
  const n = (v: number | null, bad = false) => (v === null ? <span className="muted">—</span> : <span className={bad && v > 0 ? "bad-text strong" : undefined}>{formatNumber(Math.round(v * 10) / 10)}</span>);
  return (
    <div className="cg-sheet-wrap">
      <div className="cg-sheet">
        <table>
          <thead>
            <tr>
              <th>組別</th>
              <th>工作單</th>
              <th>已檢核</th>
              <th>不通過</th>
              <th>失誤率</th>
              <th>被修改</th>
              <th>違反 SOP</th>
              <th>營業額點數</th>
              <th>預排點數</th>
              <th>與預排差異</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.r.group} onClick={() => onPick(d.r.group)} className="cg-link">
                <td className="cg-sheet-name">{d.r.group}</td>
                <td>{d.r.orders.length}</td>
                <td>{hasCheck ? d.r.pass + d.r.fail : "—"}</td>
                <td>{hasCheck ? n(d.r.fail, true) : "—"}</td>
                <td>{pct(errorRate(d.r))}</td>
                <td>{hasFix ? n(d.fixed, true) : "—"}</td>
                <td>{n(d.viol, true)}</td>
                <td>{wf.revenue ? n(d.r.revenue) : "—"}</td>
                <td>{d.r.planned ? n(d.r.planned.points) : "—"}</td>
                <td>
                  <Diff value={d.diff} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="cg-sheet-name">合計</td>
              <td>{t.orders}</td>
              <td>{hasCheck ? t.checked : "—"}</td>
              <td>{hasCheck ? n(t.fail, true) : "—"}</td>
              <td>{pct(t.checked ? t.fail / t.checked : null)}</td>
              <td>{hasFix ? n(t.fixed, true) : "—"}</td>
              <td>{wf.sopViolation ? n(t.viol, true) : "—"}</td>
              <td>{wf.revenue ? n(t.revenue) : "—"}</td>
              <td>{t.hasPlan ? n(t.planned) : "—"}</td>
              <td>
                <Diff value={t.hasPlan && wf.revenue ? t.revenue - t.planned : null} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <table className="cg-sheet-sum">
        <tbody>
          <tr><td>工作單總數</td><td>{t.orders}</td></tr>
          <tr><td>已檢核</td><td>{hasCheck ? t.checked : "—"}</td></tr>
          <tr><td>待檢核</td><td>{hasCheck ? t.unchecked : "—"}</td></tr>
          <tr><td>不通過</td><td>{hasCheck ? n(t.fail, true) : "—"}</td></tr>
          <tr><td>被修改</td><td>{hasFix ? n(t.fixed, true) : "—"}</td></tr>
          <tr><td>違反 SOP</td><td>{wf.sopViolation ? n(t.viol, true) : "—"}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

// One group, one week: every R01 item for that group on a single screen.
function GroupFocus({ row, group, wf, cfg, sop, disabled, hasCheck, hasFlags, ff, hasFix, dateField, weekStart, day, setDay }: { row?: GroupRow; group: string; wf: WorkFields; cfg: BoardConfig; sop: Sop; disabled: boolean; hasCheck: boolean; hasFlags: boolean; ff: FixFields; hasFix: boolean; dateField: string; weekStart: number; day: number | null; setDay: (d: number | null) => void }) {
  const [failOpen, setFailOpen] = useState(false);
  if (!row) return <EmptyState kind="empty" title={`${group} 這週沒有${cfg.workLabel}`} />;
  const diff = row.planned && wf.revenue ? row.revenue - row.planned.points : null;
  const cells = dayCells(row, ff, dateField, weekStart);
  const errOrders = cells.reduce((s, c) => s + c.errors, 0);
  const errDays = cells.filter((c) => c.errors).length;
  return (
    <div className="cg-focus">
      <div className="cg-focus-head">
        <h3>{row.group}</h3>
        <span className="muted small">{row.orders.length} 張工作單</span>
        <span className="cg-focus-sop">
          <span className="muted small">符合 SOP（可派新工作）</span>
          <GroupSop row={row} wf={wf} entries={sop.entries} />
        </span>
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">營業額點數</div>
          <div className="kpi-value">{wf.revenue ? round1(row.revenue) : "—"}</div>
          <div className="kpi-sub">{row.revenueBlank ? `${row.revenueBlank} 張未填點數` : "原值加總"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">與預排差異</div>
          <div className="kpi-value">
            <Diff value={diff} />
          </div>
          <div className="kpi-sub">
            預排 {row.planned ? round1(row.planned.points) : "—"} 點{row.planned?.defaulted ? `（${row.planned.defaulted} 天以 1 點計）` : ""}
          </div>
        </div>
        <button className={`kpi kpi-btn ${failOpen ? "on" : ""}`} onClick={() => setFailOpen(!failOpen)} disabled={!hasCheck} aria-expanded={failOpen}>
          <div className="kpi-label">
            失誤率 {hasCheck && <ChevronDown size={13} className="kpi-caret" />}
          </div>
          <div className="kpi-value">{pct(errorRate(row))}</div>
          <div className="kpi-sub">{hasCheck ? `不通過 ${row.fail} ÷ 已檢核 ${row.pass + row.fail}・未檢核 ${row.unchecked}` : `找不到${cfg.checkLabel}欄位`}</div>
        </button>
        <div className="kpi">
          <div className="kpi-label">異常狀態</div>
          <div className="kpi-value">{hasFlags ? `${row.anomalyCount} 張` : "—"}</div>
          <div className="kpi-sub">{hasFlags ? ([...row.anomalyKinds].map(([k, n]) => `${k.replace(/^⚠/, "")} ${n}`).join("、") || "無異常") : "找不到 ⚠ 異常欄位"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">出錯（被修改）</div>
          <div className={`kpi-value ${errOrders ? "bad-text" : ""}`}>{hasFix ? `${errOrders} 張` : "—"}</div>
          <div className="kpi-sub">{hasFix ? `${errDays} 天有出錯` : "找不到修改後數量／營業額欄位"}</div>
        </div>
      </div>
      {failOpen && <FailPanel rows={[row]} wf={wf} cfg={cfg} dateField={dateField} weekStart={weekStart} />}
      {hasFix && (
        <div className="cg-strip" role="group" aria-label="依日期篩選">
          {cells.map((c, i) => (
            <div key={i} className="cg-strip-day">
              <span className="muted small">{dayHead(i, weekStart)}</span>
              <DayCellView c={c} on={day === i} onClick={() => setDay(day === i ? null : i)} />
            </div>
          ))}
          {day !== null && (
            <button className="btn btn-sm cg-strip-all" onClick={() => setDay(null)}>
              看整週
            </button>
          )}
        </div>
      )}
      <div className="cg-focus-items">
        <span className="muted small">工作項目</span>
        {row.items.length ? row.items.map((i) => <span key={i} className="tag">{i}</span>) : <span className="muted">—</span>}
        <span className="muted small cg-focus-qty">工作數量合計 {wf.qty ? round1(row.qty) : "—"}</span>
      </div>
      <OrderDetail row={row} wf={wf} checkLabel={cfg.checkLabel} sop={sop} disabled={disabled} ff={ff} dateField={dateField} onlyDay={day} weekStart={weekStart} />
    </div>
  );
}

export default function GroupBoard({ cfg }: { cfg: BoardConfig }) {
  const { week, version: globalVersion, demo } = useShell();
  const [localVersion, setLocalVersion] = useState<DataVersion>("v3");
  const version: DataVersion = globalVersion === "all" ? localVersion : globalVersion;
  const work = useSource(cfg.workKey(version), { fields: WORK_FIELDS });
  // Hooks run unconditionally; boards without a cost sheet reuse the work key (cached).
  const cost = useSource(cfg.costKey ? cfg.costKey(version) : cfg.workKey(version), { fields: cfg.costKey ? COST_FIELDS : WORK_FIELDS });
  const sched = useSource(cfg.scheduleKey(version), { fields: SCHEDULE_FIELDS });
  const isMobile = useMedia(MOBILE);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const sop = useSop(cfg.report, version, week.start);
  // Selected group stays put across weeks (so you can step through one group's
  // weeks) and lives in the URL (?group=) so the view can be shared.
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => setFocus(new URLSearchParams(window.location.search).get("group")), []);
  const [day, setDay] = useState<number | null>(null);
  const [failOpen, setFailOpen] = useState(false);
  const [layout, setLayout] = useState<"sheet" | "detail">("sheet");
  useEffect(() => setDay(null), [version, week.start]);
  const pick = (g: string | null, d: number | null = null) => {
    setFocus(g);
    setDay(d);
    const u = new URL(window.location.href);
    if (g) u.searchParams.set("group", g);
    else u.searchParams.delete("group");
    window.history.replaceState(null, "", u);
  };
  useEffect(() => setOpen(new Set()), [version, week.start]);

  const view = useMemo(() => {
    if (!work.data) return null;
    if (cfg.costKey && cost.status === "loading") return null;
    const join = cfg.costKey ? joinInternal(work.data, cost.status === "ok" ? cost.data : undefined) : null;
    const data = join ? join.data : work.data;
    const src = sourceByKey(cfg.workKey(version))!;
    const dateField = resolveDateField(src, data.fields, cfg.costKey ? JOINED_DATE : undefined);
    if (!dateField) return { error: "找不到可用的日期欄位" as const };
    const wf = resolveWorkFields(data.fields, cfg.checkNames);
    const inWeek = inRange(data.records, dateField, week.start, week.end);
    const records = cfg.keepWorkTrade && wf.trade ? inWeek.filter((r) => cfg.keepWorkTrade!(text(r.fields[wf.trade!.name]))) : inWeek;
    const sf = sched.data ? resolveScheduleFields(sched.data.fields) : {};
    const planned = plannedPoints(sched.data as TableData | undefined, sf, week.start, week.end, cfg.keepTrade);
    const rows = groupRows(records, wf, planned);
    const totals = rows.reduce(
      (t, r) => ({ orders: t.orders + r.orders.length, revenue: t.revenue + r.revenue, pass: t.pass + r.pass, fail: t.fail + r.fail, anomaly: t.anomaly + r.anomalyCount }),
      { orders: 0, revenue: 0, pass: 0, fail: 0, anomaly: 0 },
    );
    const ff = resolveFixFields(data.fields);
    return { dateField, wf, ff, sf, rows, totals, records, data, join };
  }, [work.data, cost.data, cost.status, sched.data, version, week.start, week.end, cfg]);

  const toggleOpen = (g: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  const header = (
    <div className="cg-head">
      <div>
        <h2>{weekName(week.offset)}各組表現</h2>
        <p className="muted small">
          {weekName(week.offset)} {week.label}
          {view && "dateField" in view && view.dateField ? `・依「${view.dateField}」` : ""}
        </p>
      </div>
      {globalVersion === "all" && (
        <div className="seg" role="group" aria-label="資料版本">
          {(["v3", "v4"] as const).map((v) => (
            <button key={v} className={version === v ? "on" : ""} onClick={() => setLocalVersion(v)} aria-pressed={version === v}>
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (work.status !== "ok" || !work.data) {
    return (
      <section className="cg">
        {header}
        <EmptyState kind={work.status} title={`${cfg.workLabel}（${version.toUpperCase()}）：${STATUS_TEXT[work.status]}`}>
          {work.error && <div className="mono">{work.error}</div>}
        </EmptyState>
      </section>
    );
  }
  if (!view || "error" in view) {
    return (
      <section className="cg">
        {header}
        <EmptyState kind="empty" title={view && "error" in view ? (view.error as string) : "載入中"} />
      </section>
    );
  }

  const { wf, ff, sf, rows, totals, join, dateField } = view;
  const hasFix = Boolean((ff.qtyOrig && ff.qtyFixed) || (ff.revOrig && ff.revFixed && ff.revOrig !== ff.revFixed));
  const missing = [
    !wf.group && "組別",
    !wf.revenue && "營業額點數",
    !wf.check && cfg.checkLabel,
    !wf.flags.length && "⚠ 異常欄位",
    !hasFix && "修改後數量／修改後營業額（每日出錯）",
  ].filter(Boolean) as string[];
  const schedNote =
    sched.status !== "ok"
      ? `預排表${STATUS_TEXT[sched.status]}，預排差異無法計算`
      : !sf.group || !sf.start
        ? "預排表找不到組別或日期欄位，預排差異無法計算"
        : cfg.needsTrade && !sf.trade
          ? "預排表找不到「業別」欄位，無法篩出內業預排"
          : null;
  const joinNote =
    cfg.costKey && join
      ? cost.status !== "ok"
        ? `內業成本單${STATUS_TEXT[cost.status]}，組別與工作日期無法帶入`
        : !join.costLink
          ? "內業工作單找不到「所屬成本單」欄位，組別與工作日期無法帶入"
          : join.joined < view.data.records.length
            ? `${view.data.records.length - join.joined} 張工作單對不到內業成本單，沒有組別與工作日期`
            : null
      : null;
  const overallRate = errorRate(totals);
  const hasCheck = Boolean(wf.check || wf.status);
  const hasFlags = wf.flags.length > 0;
  const sopLocked = demo || !sop.loaded || !sop.perm.canEdit;

  return (
    <section className="cg">
      {header}

      {!focus && (
        <div className="kpis">
          <div className="kpi">
            <div className="kpi-label">工作單數</div>
            <div className="kpi-value">{formatNumber(totals.orders)}</div>
            <div className="kpi-sub">{rows.length} 組</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">
              營業額點數 <span className="kpi-tag">原值</span>
            </div>
            <div className="kpi-value">{wf.revenue ? round1(totals.revenue) : "—"}</div>
            <div className="kpi-sub">{wf.revenue ? `取自「${wf.revenue.name}」` : "找不到營業額點數欄位"}</div>
          </div>
          <button className={`kpi kpi-btn ${failOpen ? "on" : ""}`} onClick={() => setFailOpen(!failOpen)} disabled={!hasCheck} aria-expanded={failOpen}>
            <div className="kpi-label">
              失誤率 {hasCheck && <ChevronDown size={13} className="kpi-caret" />}
            </div>
            <div className="kpi-value">{pct(overallRate)}</div>
            <div className="kpi-sub">{hasCheck ? `不通過 ${totals.fail} ÷ 已檢核 ${totals.pass + totals.fail}・點開看哪組、誰` : `找不到${cfg.checkLabel}欄位`}</div>
          </button>
          <div className="kpi">
            <div className="kpi-label">異常工作單</div>
            <div className="kpi-value">{hasFlags ? formatNumber(totals.anomaly) : "—"}</div>
            <div className="kpi-sub">{hasFlags ? `任一 ⚠ 欄位有標記（${wf.flags.length} 個欄位）` : "找不到 ⚠ 異常欄位"}</div>
          </div>
        </div>
      )}

      {!focus && failOpen && hasCheck && <FailPanel rows={rows} wf={wf} cfg={cfg} dateField={dateField} weekStart={week.start} onPick={(g) => pick(g)} />}

      {(missing.length > 0 || schedNote || joinNote || sop.error || !sop.persistent || (sop.loaded && !sop.perm.canEdit && !demo)) && (
        <ul className="cg-notes">
          {missing.length > 0 && (
            <li>
              <CircleAlert size={14} /> 此資料表找不到欄位：{missing.join("、")}，相關數字顯示為「—」。
            </li>
          )}
          {joinNote && (
            <li>
              <CircleAlert size={14} /> {joinNote}
            </li>
          )}
          {schedNote && (
            <li>
              <CircleAlert size={14} /> {schedNote}
            </li>
          )}
          {sop.error && (
            <li className="bad-text">
              <CircleAlert size={14} /> SOP 勾選：{sop.error}
            </li>
          )}
          {sop.loaded && !sop.perm.canEdit && !demo && (
            <li>
              <CircleAlert size={14} /> 你目前不能勾選 SOP。{sop.perm.reason}
              {sop.perm.openId && (
                <>
                  {" "}你的 Lark ID：<code className="mono">{sop.perm.openId}</code>（如需勾選權限，請提供給管理員）
                </>
              )}
            </li>
          )}
          {!sop.persistent && (
            <li>
              <CircleAlert size={14} /> SOP 勾選目前存在暫存空間，網站重新部署後會遺失（管理員需在 Zeabur 掛載硬碟並設定 DATA_DIR）。
            </li>
          )}
        </ul>
      )}

      {(rows.length > 0 || focus) && (
        <div className="cg-picker" role="group" aria-label="選擇組別">
          <button className={`cg-chip ${!focus ? "on" : ""}`} onClick={() => pick(null)} aria-pressed={!focus}>
            全部組別
          </button>
          {[...rows.map((r) => r.group), ...(focus && !rows.some((r) => r.group === focus) ? [focus] : [])].map((g) => (
            <button key={g} className={`cg-chip ${focus === g ? "on" : ""}`} onClick={() => pick(g)} aria-pressed={focus === g}>
              {g}
            </button>
          ))}
        </div>
      )}

      {focus ? (
        <GroupFocus row={rows.find((r) => r.group === focus)} group={focus} wf={wf} cfg={cfg} sop={sop} disabled={sopLocked} hasCheck={hasCheck} hasFlags={hasFlags} ff={ff} hasFix={hasFix} dateField={dateField} weekStart={week.start} day={day} setDay={setDay} />
      ) : rows.length === 0 ? (
        <EmptyState kind="empty" title={`${weekName(week.offset)}沒有${cfg.workLabel}`} />
      ) : null}

      {!focus && rows.length > 0 && (
        <div className="cg-layout">
          <div className="seg" role="group" aria-label="版面">
            <button className={layout === "sheet" ? "on" : ""} onClick={() => setLayout("sheet")} aria-pressed={layout === "sheet"}>
              簡表
            </button>
            <button className={layout === "detail" ? "on" : ""} onClick={() => setLayout("detail")} aria-pressed={layout === "detail"}>
              詳細
            </button>
          </div>
          <span className="muted small">點組別看該組這週的每張工作單</span>
        </div>
      )}

      {!focus && rows.length > 0 && layout === "sheet" && <SheetTable rows={rows} wf={wf} ff={ff} hasCheck={hasCheck} hasFix={hasFix} onPick={(g) => pick(g)} />}

      {focus || rows.length === 0 || layout === "sheet" ? null : isMobile ? (
        <div className="cg-cards">
          {rows.map((r) => {
            const diff = r.planned && wf.revenue ? r.revenue - r.planned.points : null;
            const expanded = open.has(r.group);
            return (
              <article key={r.group} className="cg-card">
                <button className="cg-card-head" onClick={() => toggleOpen(r.group)} aria-expanded={expanded}>
                  <span className="cg-group">{r.group}</span>
                  <span className="muted small">{r.orders.length} 張工作單</span>
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <dl className="cg-metrics">
                  <div>
                    <dt>營業額點數</dt>
                    <dd>{wf.revenue ? round1(r.revenue) : "—"}</dd>
                  </div>
                  <div>
                    <dt>與預排差異</dt>
                    <dd>
                      <Diff value={diff} />
                    </dd>
                  </div>
                  <div>
                    <dt>失誤率</dt>
                    <dd>
                      {pct(errorRate(r))} {hasCheck && <span className="muted small">{r.fail}/{r.pass + r.fail}</span>}
                    </dd>
                  </div>
                  <div>
                    <dt>異常</dt>
                    <dd>{!hasFlags ? "—" : r.anomalyCount ? `${r.anomalyCount} 張` : "無"}</dd>
                  </div>
                </dl>
                <div className="cg-card-sop">
                  <span className="muted small">符合 SOP</span>
                  <GroupSop row={r} wf={wf} entries={sop.entries} />
                </div>
                {expanded && <OrderDetail row={r} wf={wf} checkLabel={cfg.checkLabel} sop={sop} disabled={sopLocked} ff={ff} dateField={dateField} weekStart={week.start} />}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="cg-table">
          <table>
            <thead>
              <tr>
                <th aria-label="展開" />
                <th>組別</th>
                <th className="num">營業額點數</th>
                <th className="num">預排點數</th>
                <th className="num">與預排差異</th>
                <th className="num">失誤率</th>
                <th>異常狀態</th>
                <th>工作項目</th>
                <th className="num">工作數量</th>
                <th>符合 SOP（可派新工作）</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const diff = r.planned && wf.revenue ? r.revenue - r.planned.points : null;
                const expanded = open.has(r.group);
                return (
                  <Fragment key={r.group}>
                    <tr className={`cg-row ${expanded ? "open" : ""}`} onClick={() => toggleOpen(r.group)}>
                      <td className="cg-caret">{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                      <td>
                        <span className="cg-group">{r.group}</span>
                        <span className="muted small"> {r.orders.length} 張</span>
                      </td>
                      <td className="num strong">
                        {wf.revenue ? round1(r.revenue) : "—"}
                        {wf.revenue && r.revenueBlank > 0 && <span className="muted small"> ({r.revenueBlank} 空白)</span>}
                      </td>
                      <td className="num" title={r.planned?.defaulted ? `${r.planned.defaulted} 天未填點數，以每天 1 點計` : undefined}>
                        {r.planned ? formatNumber(Math.round(r.planned.points * 10) / 10) : "—"}
                        {r.planned?.defaulted ? <span className="muted small">*</span> : null}
                      </td>
                      <td className="num">
                        <Diff value={diff} />
                      </td>
                      <td className="num">
                        {pct(errorRate(r))}
                        {hasCheck && <span className="muted small"> {r.fail}/{r.pass + r.fail}</span>}
                      </td>
                      <td>
                        {!hasFlags ? (
                          <span className="muted">—</span>
                        ) : r.anomalyCount ? (
                          <span className="pill pill-warn">
                            <CircleAlert size={12} /> {r.anomalyCount} 張
                          </span>
                        ) : (
                          <span className="pill">無異常</span>
                        )}
                        {hasCheck && r.unchecked > 0 && <span className="muted small"> 未檢核 {r.unchecked}</span>}
                      </td>
                      <td className="cg-items" title={r.items.join("、")}>
                        {r.items.slice(0, 2).join("、") || "—"}
                        {r.items.length > 2 && <span className="muted"> 等 {r.items.length} 項</span>}
                      </td>
                      <td className="num">{wf.qty ? formatNumber(Math.round(r.qty * 10) / 10) : "—"}</td>
                      <td>
                        <GroupSop row={r} wf={wf} entries={sop.entries} />
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="cg-detail-row">
                        <td colSpan={10}>
                          <OrderDetail row={r} wf={wf} checkLabel={cfg.checkLabel} sop={sop} disabled={sopLocked} ff={ff} dateField={dateField} weekStart={week.start} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!focus && rows.length > 0 && hasFix && <DayGrid rows={rows} ff={ff} dateField={dateField} weekStart={week.start} onPick={(g, d) => pick(g, d)} />}

      <p className="cg-foot">
        失誤率＝{cfg.checkLabel}「不通過」÷ 已檢核（未檢核不計）。預排點數＝預排表{cfg.scheduleTradeLabel ? `（${cfg.scheduleTradeLabel}）` : ""}點數欄，未填以每組每天 1 點計（標 *）。差異＝營業額點數（原值）− 預排點數。
        {cfg.keepWorkTrade && view.wf.trade && ` 只計${cfg.workLabel}中業別不是內業的工作單。`}{cfg.costKey && " 組別與工作日期取自所屬內業成本單。"}出錯＝工作單的{[ff.qtyFixed && `「${ff.qtyFixed.name}」≠「${ff.qtyOrig?.name ?? "數量"}」`, ff.revFixed && ff.revOrig && ff.revFixed !== ff.revOrig && `「${ff.revFixed.name}」≠「${ff.revOrig.name}」`].filter(Boolean).join(" 或 ") || "修改後數值與原填不同"}（兩邊都有值才比較）。{wf.sopViolation ? `SOP 取自日報「${wf.sopViolation.name}」：有任一張違反顯示紅色，全部填寫且沒有違反顯示綠色「SOP 完成」。` : "SOP 由控制組成員在每張工作單上勾選（展開組別），整組都勾完才顯示綠色「SOP 完成」；記錄勾選人與時間，不寫回 Lark。"}
        {view.records.length > 0 && ` 資料至 ${formatDate(Math.max(...view.records.map((r) => (r.fields[view.dateField] as number) ?? 0)))}。`}
      </p>

      {cfg.ownerProgress && <OwnerProgress data={view.data} wf={wf} dateField={view.dateField} weekStart={week.start} weekEnd={week.end} />}
    </section>
  );
}
