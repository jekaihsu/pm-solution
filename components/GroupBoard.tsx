"use client";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, CircleAlert, Minus } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatNumber } from "@/lib/aggregate";
import { JOINED_DATE, anomalies, classifyCheck, errorRate, groupRows, joinInternal, plannedPoints, resolveScheduleFields, resolveWorkFields, type GroupRow, type WorkFields } from "@/lib/controlGroup";
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
    async (group: string, ok: boolean) => {
      const sent = tag;
      const update = (fn: (e: Record<string, SopEntry>) => Record<string, SopEntry>) =>
        setState((s) => (s && s.tag === sent ? { ...s, entries: fn(s.entries) } : s));
      let prev: SopEntry | undefined;
      update((e) => {
        prev = e[group];
        return { ...e, [group]: { ok, by: "儲存中…", at: Date.now() } };
      });
      try {
        const r = await fetch("/api/sop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report, version, weekStart, group, ok }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        update((e) => ({ ...e, [group]: j.entry }));
        if (current.current === sent) setError("");
      } catch (err) {
        update((e) => {
          const next = { ...e };
          if (prev) next[group] = prev;
          else delete next[group];
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

function SopBox({ group, entry, onToggle, disabled }: { group: string; entry?: SopEntry; onToggle: (g: string, ok: boolean) => void; disabled: boolean }) {
  return (
    <label
      className={`cg-sop ${disabled ? "readonly" : ""}`}
      title={entry ? `${entry.ok ? "符合" : "取消"}：${entry.by}・${new Date(entry.at).toLocaleString("zh-TW")}` : disabled ? "僅授權主管可勾選" : "主管確認後勾選"}
      onClick={(e) => e.stopPropagation()}
    >
      <input type="checkbox" checked={Boolean(entry?.ok)} disabled={disabled} onChange={(e) => onToggle(group, e.target.checked)} aria-label={`${group} 符合 SOP`} />
      <span>{entry?.ok ? "符合" : "未確認"}</span>
      {entry?.ok && <span className="cg-sop-by">{entry.by}</span>}
    </label>
  );
}

function OrderDetail({ row, wf, checkLabel }: { row: GroupRow; wf: WorkFields; checkLabel: string }) {
  return (
    <div className="cg-detail">
      <table>
        <thead>
          <tr>
            <th>工作單號</th>
            <th>工作編號</th>
            <th>工作項目</th>
            <th className="num">工作數量</th>
            <th className="num">營業額點數</th>
            <th>{checkLabel.replace(/（.*）/, "")}</th>
            <th>異常</th>
          </tr>
        </thead>
        <tbody>
          {row.orders.map((r) => {
            const check = classifyCheck(r, wf);
            const an = anomalies(r, wf);
            return (
              <tr key={r.id}>
                <td>{wf.orderNo ? text(r.fields[wf.orderNo.name]) : r.id}</td>
                <td>{wf.jobNo ? text(r.fields[wf.jobNo.name]) : "—"}</td>
                <td>{wf.item ? text(r.fields[wf.item.name]) : "—"}</td>
                <td className="num">{wf.qty ? text(r.fields[wf.qty.name]) || "—" : "—"}</td>
                <td className="num">{wf.revenue ? text(r.fields[wf.revenue.name]) || "—" : "—"}</td>
                <td>
                  {wf.check || wf.status ? (
                    <span className={`pill ${check === "pass" ? "pill-good" : check === "fail" ? "pill-bad" : ""}`}>{check === "pass" ? "通過" : check === "fail" ? "不通過" : "未檢核"}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>{!wf.flags.length ? <span className="muted">—</span> : an.length ? an.map((a) => <span key={a} className="tag">{a}</span>) : <span className="muted">無</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function GroupBoard({ cfg }: { cfg: BoardConfig }) {
  const { week, version: globalVersion, demo } = useShell();
  const [localVersion, setLocalVersion] = useState<DataVersion>("v3");
  const version: DataVersion = globalVersion === "all" ? localVersion : globalVersion;
  const work = useSource(cfg.workKey(version));
  // Hooks run unconditionally; boards without a cost sheet reuse the work key (cached).
  const cost = useSource(cfg.costKey ? cfg.costKey(version) : cfg.workKey(version));
  const sched = useSource(cfg.scheduleKey(version));
  const isMobile = useMedia(MOBILE);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const sop = useSop(cfg.report, version, week.start);
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
    const records = inRange(data.records, dateField, week.start, week.end);
    const sf = sched.data ? resolveScheduleFields(sched.data.fields) : {};
    const planned = plannedPoints(sched.data as TableData | undefined, sf, week.start, week.end, cfg.keepTrade);
    const rows = groupRows(records, wf, planned);
    const totals = rows.reduce(
      (t, r) => ({ orders: t.orders + r.orders.length, revenue: t.revenue + r.revenue, pass: t.pass + r.pass, fail: t.fail + r.fail, anomaly: t.anomaly + r.anomalyCount }),
      { orders: 0, revenue: 0, pass: 0, fail: 0, anomaly: 0 },
    );
    return { dateField, wf, sf, rows, totals, records, data, join };
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
        <h2>各組上週表現</h2>
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

  const { wf, sf, rows, totals, join } = view;
  const missing = [
    !wf.group && "組別",
    !wf.revenue && "營業額點數",
    !wf.check && cfg.checkLabel,
    !wf.flags.length && "⚠ 異常欄位",
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

  return (
    <section className="cg">
      {header}

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
        <div className="kpi">
          <div className="kpi-label">失誤率</div>
          <div className="kpi-value">{pct(overallRate)}</div>
          <div className="kpi-sub">{hasCheck ? `不通過 ${totals.fail} ÷ 已檢核 ${totals.pass + totals.fail}` : `找不到${cfg.checkLabel}欄位`}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">異常工作單</div>
          <div className="kpi-value">{hasFlags ? formatNumber(totals.anomaly) : "—"}</div>
          <div className="kpi-sub">{hasFlags ? `任一 ⚠ 欄位有標記（${wf.flags.length} 個欄位）` : "找不到 ⚠ 異常欄位"}</div>
        </div>
      </div>

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
              <CircleAlert size={14} /> 你可以查看 SOP 勾選，但只有授權主管能勾選。{sop.perm.reason}
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

      {rows.length === 0 ? (
        <EmptyState kind="empty" title={`${weekName(week.offset)}沒有外業工作單`} />
      ) : isMobile ? (
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
                <SopBox group={r.group} entry={sop.entries[r.group]} onToggle={sop.toggle} disabled={demo || !sop.loaded || !sop.perm.canEdit} />
                {expanded && <OrderDetail row={r} wf={wf} checkLabel={cfg.checkLabel} />}
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
                        <SopBox group={r.group} entry={sop.entries[r.group]} onToggle={sop.toggle} disabled={demo || !sop.loaded || !sop.perm.canEdit} />
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="cg-detail-row">
                        <td colSpan={10}>
                          <OrderDetail row={r} wf={wf} checkLabel={cfg.checkLabel} />
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

      <p className="cg-foot">
        失誤率＝{cfg.checkLabel}「不通過」÷ 已檢核（未檢核不計）。預排點數＝預排表{cfg.scheduleTradeLabel ? `（${cfg.scheduleTradeLabel}）` : ""}點數欄，未填以每組每天 1 點計（標 *）。差異＝營業額點數（原值）− 預排點數。
        {cfg.costKey && " 組別與工作日期取自所屬內業成本單。"}SOP 由授權主管勾選，記錄勾選人與時間，不寫回 Lark。點組別可展開工作編號、工作項目與數量。
        {view.records.length > 0 && ` 資料至 ${formatDate(Math.max(...view.records.map((r) => (r.fields[view.dateField] as number) ?? 0)))}。`}
      </p>

      {cfg.ownerProgress && <OwnerProgress data={view.data} wf={wf} dateField={view.dateField} weekStart={week.start} weekEnd={week.end} />}
    </section>
  );
}
