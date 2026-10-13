"use client";
// R11 行政數據: one row per person (行政成本單的填表人), week summary + plan diff.
// Logic lives in lib/adminBoard.ts (pure, tested by scripts/test-admin-board.mjs).
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, CircleAlert, Minus } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { formatNumber } from "@/lib/aggregate";
import { ADMIN_COST_FIELDS, ADMIN_SCHEDULE_FIELDS, ADMIN_WORK_FIELDS, buildAdminBoard, type AdminRow } from "@/lib/adminBoard";
import type { DataVersion } from "@/lib/reports";
import { formatDate, weekName } from "@/lib/week";
import { useShell } from "./AppShell";
import EmptyState from "./EmptyState";
import { STATUS_TEXT, useSource } from "./useSource";

const r1 = (n: number) => formatNumber(Math.round(n * 100) / 100);
const dash = <span className="muted">—</span>;

function Diff({ value }: { value: number | null }) {
  if (value === null) return dash;
  const r = Math.round(value * 100) / 100;
  const Icon = r > 0 ? ArrowUpRight : r < 0 ? ArrowDownRight : Minus;
  return (
    <span className={`cg-diff ${r < 0 ? "neg" : ""}`}>
      <Icon size={13} strokeWidth={2} />
      {r > 0 ? "+" : r < 0 ? "−" : ""}
      {formatNumber(Math.abs(r))}
    </span>
  );
}

const COLS = 8;

function Detail({ row }: { row: AdminRow }) {
  return (
    <div className="cg-detail">
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>單號</th>
            <th>行政工項</th>
            <th>件數</th>
            <th>點數</th>
            <th>異常</th>
            <th>備註</th>
          </tr>
        </thead>
        <tbody>
          {row.orders.map((o) => (
            <tr key={o.id}>
              <td>{o.date ? formatDate(o.date) : "—"}</td>
              <td>{o.orderNo || "—"}</td>
              <td>{o.item || "—"}</td>
              <td>{o.qty ?? "—"}</td>
              <td>{o.points === null ? "—" : r1(o.points)}</td>
              <td>{o.anomalies.length ? <span className="bad-text">{o.anomalies.join("、")}</span> : "—"}</td>
              <td>{o.note || "—"}</td>
            </tr>
          ))}
          {!row.orders.length && (
            <tr>
              <td colSpan={7} className="muted">
                這週沒有工作單
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PersonRows({ rows, open, toggle, planOn }: { rows: AdminRow[]; open: Set<string>; toggle: (id: string) => void; planOn: boolean }) {
  return rows.map((r) => {
    const on = open.has(r.personId);
    const diff = planOn && r.plan ? r.revenue - r.plan.points : null;
    return (
      <Fragment key={r.personId}>
        <tr className="cg-link" onClick={() => toggle(r.personId)}>
          <td className="cg-sheet-name">
            {on ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {r.name}
          </td>
          <td>{r.orders.length}</td>
          <td>{r.days}</td>
          <td>{r1(r.revenue)}</td>
          <td>{r.plan ? r1(r.plan.points) : dash}</td>
          <td>
            <Diff value={diff} />
          </td>
          <td>{r.anomalyCount ? <span className="bad-text strong">{r.anomalyCount}</span> : 0}</td>
          <td>{r.overtime ? r1(r.overtime) : 0}</td>
        </tr>
        {on && (
          <tr className="cg-detail-row">
            <td colSpan={COLS} style={{ padding: 8, whiteSpace: "normal", textAlign: "left" }}>
              <Detail row={r} />
            </td>
          </tr>
        )}
      </Fragment>
    );
  });
}

const HEAD = (
  <thead>
    <tr>
      <th>人員</th>
      <th>工作單</th>
      <th>出勤天數</th>
      <th>營業額點數</th>
      <th>預排點數</th>
      <th>與預排差異</th>
      <th>⚠異常</th>
      <th>加班時數</th>
    </tr>
  </thead>
);

export default function AdminBoard() {
  const { week, version: globalVersion } = useShell();
  const [localVersion, setLocalVersion] = useState<DataVersion>("v3");
  const version: DataVersion = globalVersion === "all" ? localVersion : globalVersion;
  const work = useSource(`${version}-admin-work`, { fields: ADMIN_WORK_FIELDS, links: true });
  const cost = useSource(`${version}-admin-cost`, { fields: ADMIN_COST_FIELDS, links: true });
  const sched = useSource(`${version}-schedule`, { fields: ADMIN_SCHEDULE_FIELDS, links: true });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const board = useMemo(() => {
    if (work.status !== "ok" || !work.data) return null;
    if (cost.status === "loading" || sched.status === "loading") return null;
    return buildAdminBoard({
      work: work.data,
      cost: cost.status === "ok" ? cost.data : undefined,
      sched: sched.status === "ok" ? sched.data : undefined,
      start: week.start,
      end: week.end,
    });
  }, [work.status, work.data, cost.status, cost.data, sched.status, sched.data, week.start, week.end]);

  const header = (
    <div className="cg-head">
      <div>
        <h2>{weekName(week.offset)}行政人員表現</h2>
        <p className="muted small">
          {weekName(week.offset)} {week.label}・一列一人（成本單填表人）
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

  if (work.status !== "ok") {
    // V4 目前讀不到（1254302）：顯示原因，不報錯；V3、V4 不相加。
    return (
      <section className="cg">
        {header}
        <EmptyState kind={work.status} title={`行政工作單（${version.toUpperCase()}）：${STATUS_TEXT[work.status]}`}>
          {work.error && <div className="mono">{work.error}</div>}
        </EmptyState>
      </section>
    );
  }
  if (!board) {
    return (
      <section className="cg">
        {header}
        <EmptyState kind="empty" title="載入中" />
      </section>
    );
  }

  const planOn = sched.status === "ok" && !board.notes.some((n) => n.startsWith("預排表"));
  const notes = [...board.notes];
  if (cost.status !== "ok") notes.push(`行政成本單${STATUS_TEXT[cost.status]}${cost.error ? `：${cost.error}` : ""}`);
  if (board.stats.unmatchedOrders) notes.push(`${board.stats.unmatchedOrders} 張工作單對不到成本單（沒有人與日期，不列入任何人）`);
  const t = board.totals;
  const unplannedOrders = board.unplanned.reduce((s, r) => s + r.orders.length, 0);

  return (
    <section className="cg">
      {header}
      <div className="cg-sheet-wrap">
        <div className="cg-sheet">
          <table>
            {HEAD}
            <tbody>
              <PersonRows rows={board.planned} open={open} toggle={toggle} planOn={planOn} />
              {!board.planned.length && (
                <tr>
                  <td colSpan={COLS} className="muted">
                    這週沒有人員資料
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="cg-sheet-name">{planOn ? "合計（有預排的人）" : "合計"}</td>
                <td>{t.orders}</td>
                <td>{t.days}</td>
                <td>{r1(t.revenue)}</td>
                <td>{planOn ? r1(t.points) : dash}</td>
                <td>
                  <Diff value={planOn ? t.diff : null} />
                </td>
                <td>{t.anomalies}</td>
                <td>{r1(t.overtime)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <table className="cg-sheet-sum">
          <tbody>
            <tr>
              <td>工作單總數</td>
              <td>{board.stats.orders}</td>
            </tr>
            <tr>
              <td>成本單</td>
              <td>{board.stats.costSheets}</td>
            </tr>
            <tr>
              <td>填表人</td>
              <td>{board.stats.people}</td>
            </tr>
            <tr>
              <td>營業額點數</td>
              <td>{r1(board.stats.revenue)}</td>
            </tr>
            <tr>
              <td>失誤率</td>
              <td className="muted">待定義</td>
            </tr>
          </tbody>
        </table>
      </div>
      {planOn && board.unplanned.length > 0 && (
        <details className="cg-unplanned">
          <summary>
            沒有預排的人（{board.unplanned.length} 人・{unplannedOrders} 張工作單）
          </summary>
          <div className="cg-sheet">
            <table>
              {HEAD}
              <tbody>
                <PersonRows rows={board.unplanned} open={open} toggle={toggle} planOn={planOn} />
              </tbody>
            </table>
          </div>
        </details>
      )}
      <ul className="cg-notes">
        <li>
          <CircleAlert size={14} /> 預排取業別＝行政，以「人員＋日期」比對（組別不參與）；預排點數沒填的，每人每天 1 點（同人同日只算一次），有填就用填的值。
        </li>
        <li>
          <CircleAlert size={14} /> 失誤率、已檢核、不通過：行政沒有檢核欄，待定義，先不顯示。
        </li>
        <li>
          <CircleAlert size={14} /> 出勤天數＝所選週內該人成本單的不重複日期。V3、V4 分開看，不相加。
        </li>
        {notes.map((n) => (
          <li key={n} className="bad-text">
            <CircleAlert size={14} /> {n}
          </li>
        ))}
      </ul>
    </section>
  );
}
