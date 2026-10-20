"use client";
// R09 內業報告：內業經理看上週「預排 vs 實際」。邏輯在 lib/internalReport.ts（純函式，scripts/test-internal-report.mjs 測試）。
// 內業以人為單位；人員 record_id＋日期比對，組別只顯示。成本欄位（出工成本、人力成本、方案日成本、加班費、雜支）不讀、不顯示。
import { CircleAlert, Download, Hourglass } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatNumber } from "@/lib/aggregate";
import { downloadCsv, simpleCsv } from "@/lib/csv";
import { managerOf } from "@/lib/managers";
import {
  buildInternalReport,
  dayStartMs,
  INTERNAL_CASE_FIELDS,
  INTERNAL_COST_FIELDS,
  INTERNAL_FLAGS,
  INTERNAL_SCHEDULE_FIELDS,
  INTERNAL_WORK_FIELDS,
  KIND_UNFILLED,
  KIND_UNFILLED_LEAVE,
  KIND_UNPLANNED,
  RETURNED,
  taipeiDay,
  type CaseResult,
  type ExceptionRow,
} from "@/lib/internalReport";
import type { DataVersion } from "@/lib/reports";
import { weekName } from "@/lib/week";
import { useShell } from "./AppShell";
import EmptyState from "./EmptyState";
import { STATUS_TEXT, useSource } from "./useSource";

const r2 = (n: number) => formatNumber(Math.round(n * 100) / 100);
const dash = <span className="muted">—</span>;
const md = (day: number) => {
  const d = new Date(dayStartMs(day) + 8 * 3600000);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
};
const range = (e: ExceptionRow) => (e.from === e.to ? md(e.from) : `${md(e.from)}～${md(e.to)}`);

const KIND_CLASS = (k: string) => (k === KIND_UNPLANNED ? "pill pill-warn" : k === KIND_UNFILLED ? "pill" : k === KIND_UNFILLED_LEAVE ? "pill pill-good" : "pill pill-bad");
const RESULT_CLASS: Record<CaseResult, string> = { 有排有做: "pill pill-good", 有排未做: "pill pill-warn", 未排有做: "pill" };

const EXCEPTION_FILTERS = [KIND_UNPLANNED, KIND_UNFILLED, KIND_UNFILLED_LEAVE, ...INTERNAL_FLAGS, RETURNED] as const;
const INTERNAL_MANAGER = managerOf("內業"); // 張佳斌

// Lark 假勤回應（型別就地定義，避免把 server-only 模組牽進前端 bundle）。
type LeaveResp = { status: string; days?: Record<string, { date: string; kind: string }[]> };
const CASE_FILTERS: CaseResult[] = ["有排有做", "有排未做", "未排有做"];

function Chips<T extends string>({ label, options, value, onPick, count }: { label: string; options: readonly T[]; value: T | null; onPick: (v: T | null) => void; count: (v: T | null) => number }) {
  return (
    <div className="cg-picker" role="group" aria-label={label}>
      <button className={`cg-chip ${value === null ? "on" : ""}`} onClick={() => onPick(null)} aria-pressed={value === null}>
        全部 {count(null)}
      </button>
      {options.map((o) => (
        <button key={o} className={`cg-chip ${value === o ? "on" : ""}`} onClick={() => onPick(value === o ? null : o)} aria-pressed={value === o}>
          {o} {count(o)}
        </button>
      ))}
    </div>
  );
}

export default function InternalReport() {
  const { week, version: globalVersion, demo, tick, manual } = useShell();
  const [localVersion, setLocalVersion] = useState<DataVersion>("v3");
  const version: DataVersion = globalVersion === "all" ? localVersion : globalVersion;
  const work = useSource(`${version}-internal-work`, { fields: INTERNAL_WORK_FIELDS, links: true });
  const cost = useSource(`${version}-internal-cost`, { fields: INTERNAL_COST_FIELDS, links: true });
  const sched = useSource(`${version}-schedule`, { fields: INTERNAL_SCHEDULE_FIELDS, links: true });
  const casesOn = version === "v3"; // V4 沒有對應的案件表
  const cases = useSource("v3-cases", { fields: INTERNAL_CASE_FIELDS, links: true, enabled: casesOn });
  const [exFilter, setExFilter] = useState<string | null>(null);
  const [exPerson, setExPerson] = useState<string>("");
  const [caseFilter, setCaseFilter] = useState<CaseResult | null>(null);

  // 「已請假＝正常」：抓 Lark 假勤（請假／出差／外出）的日子，自動把「有排未填」判為正常。
  // 失敗或沒權限時 leaveDays 維持 null，報表照舊（不影響其他計算）。
  const [leaveDays, setLeaveDays] = useState<Map<string, Set<number>> | null>(null);
  const [leaveState, setLeaveState] = useState<"off" | "ok" | "fail">("off");
  useEffect(() => {
    let off = false;
    const qs = new URLSearchParams({ week: String(week.start), to: String(week.end) });
    if (demo) qs.set("demo", "1");
    if (tick > 0 && manual) qs.set("refresh", "1");
    fetch(`/api/attendance/leave?${qs}`)
      .then((r) => r.json())
      .then((res: LeaveResp) => {
        if (off) return;
        if (res.status !== "ok" || !res.days) {
          setLeaveDays(null);
          setLeaveState("fail");
          return;
        }
        const m = new Map<string, Set<number>>();
        for (const [rid, list] of Object.entries(res.days)) {
          const set = new Set<number>();
          for (const d of list) set.add(taipeiDay(Date.parse(`${d.date}T00:00:00+08:00`)));
          m.set(rid, set);
        }
        setLeaveDays(m);
        setLeaveState("ok");
      })
      .catch(() => {
        if (off) return;
        setLeaveDays(null);
        setLeaveState("fail");
      });
    return () => {
      off = true;
    };
  }, [week.start, week.end, demo, tick, manual]);

  const report = useMemo(() => {
    if (work.status !== "ok" || !work.data) return null;
    if (cost.status === "loading" || sched.status === "loading" || (casesOn && cases.status === "loading")) return null;
    return buildInternalReport({
      work: work.data,
      cost: cost.status === "ok" ? cost.data : undefined,
      sched: sched.status === "ok" ? sched.data : undefined,
      cases: casesOn && cases.status === "ok" ? cases.data : undefined,
      start: week.start,
      end: week.end,
      leave: leaveDays ?? undefined,
    });
  }, [work.status, work.data, cost.status, cost.data, sched.status, sched.data, cases.status, cases.data, casesOn, week.start, week.end, leaveDays]);

  const header = (
    <div className="cg-head">
      <div>
        <h2>{weekName(week.offset)}內業預排 vs 實際</h2>
        <p className="muted small">
          {weekName(week.offset)} {week.label}・內業以人為單位，人員＋日期比對
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
      <section className="cg ir">
        {header}
        <EmptyState kind={work.status} title={`內業工作單（${version.toUpperCase()}）：${STATUS_TEXT[work.status]}`}>
          {work.error && <div className="mono">{work.error}</div>}
        </EmptyState>
      </section>
    );
  }
  if (!report) {
    return (
      <section className="cg ir">
        {header}
        <EmptyState kind="empty" title="載入中" />
      </section>
    );
  }

  const { summary: s, caseSummary: cs } = report;
  const notes = [...report.notes];
  if (cost.status !== "ok") notes.push(`內業成本單${STATUS_TEXT[cost.status]}${cost.error ? `：${cost.error}` : ""}`);
  if (sched.status !== "ok") notes.push(`工作預排${STATUS_TEXT[sched.status]}${sched.error ? `：${sched.error}` : ""}`);
  if (casesOn && cases.status !== "ok") notes.push(`案件表${STATUS_TEXT[cases.status]}${cases.error ? `：${cases.error}` : ""}`);
  if (report.stats.unmatchedOrders) notes.push(`${report.stats.unmatchedOrders} 張工作單對不到成本單（沒有人與組別，不列入任何人的人日；案件與異常表仍會列出）`);
  if (report.stats.dateMismatch) notes.push(`${report.stats.dateMismatch} 張工作單的「工作日期-營業額明細」與成本單工作日期不同，以成本單為準`);
  const leaveAutoDays = report.exceptions.filter((e) => e.kinds.includes(KIND_UNFILLED_LEAVE)).reduce((s, e) => s + e.days, 0);
  if (leaveState === "ok") notes.push(`已套用 Lark 假勤：「有排未填」當天若請假／出差／外出自動判為正常（${leaveAutoDays} 人日，顯示為「${KIND_UNFILLED_LEAVE}」）`);
  else if (leaveState === "fail" && !demo) notes.push("未套用 Lark 假勤（沒有人事查看權限或讀取失敗）：「有排未填」未自動扣除請假／出差／外出");

  const exCount = (k: string | null) => (k === null ? report.exceptions.length : report.exceptions.filter((e) => e.kinds.includes(k)).length);
  const exPeople = [...new Set(report.exceptions.map((e) => e.person))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  const exRows = report.exceptions.filter((e) => (!exFilter || e.kinds.includes(exFilter)) && (!exPerson || e.person === exPerson));
  const exportExceptions = () =>
    downloadCsv(
      `R09_異常與人工確認_${version.toUpperCase()}_${week.label.replace(/[\s/–]/g, "_")}.csv`,
      simpleCsv(
        ["項次", "類別", "負責經理", "組別", "人員", "工程編號", "日期", "天數", "營業額點數", "工程簡稱", "說明"],
        exRows.map((e, i) => [i + 1, e.kinds.join("＋"), INTERNAL_MANAGER, e.team, e.person, e.code, e.from === e.to ? md(e.from) : `${md(e.from)}~${md(e.to)}`, e.days, e.revenue === null ? "" : r2(e.revenue), e.name, e.note]),
        [`R09 內業 ${weekName(week.offset)} ${week.label}・負責經理 ${INTERNAL_MANAGER}`, `類別＝${exFilter ?? "全部"}、人員＝${exPerson || "全部"}`],
      ),
    );
  const caseCount = (k: CaseResult | null) => (k === null ? report.cases.length : report.cases.filter((c) => c.result === k).length);
  const caseRows = caseFilter ? report.cases.filter((c) => c.result === caseFilter) : report.cases;
  const pct = s.achievement === null ? null : Math.round(s.achievement * 1000) / 10;

  return (
    <section className="cg ir">
      {header}
      <p className="muted small ir-ref">內外業經理－預排及實際完成檢討：比對預排及實際完成的工程編號，判斷預排是否失誤，修改預排須備註說明原因</p>

      {/* 1. 預排 vs 實際（人日） */}
      <div className="ir-card">
        <div className="ir-card-head">
          <h3>1. 預排 vs 實際（人日）</h3>
          <span className="muted small">一列一人；預排取業別＝內業</span>
        </div>
        <div className="ir-kpis">
          <div className="kpi">
            <div className="kpi-label">預排人日</div>
            <div className="kpi-value">{s.plannedDays}</div>
            <div className="kpi-sub">{s.plannedPeople} 人</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">實際人日</div>
            <div className="kpi-value">{s.actualDays}</div>
            <div className="kpi-sub">{s.actualPeople} 人填成本單</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">吻合</div>
            <div className="kpi-value">{s.matched}</div>
            <div className="kpi-sub">
              有排未填 {s.plannedOnly}・未排有填 {s.actualOnly}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">
              人日達成率 <span className="kpi-tag">人日口徑</span>
            </div>
            <div className="kpi-value">{pct === null ? "—" : `${pct}%`}</div>
            <div className="kpi-sub">吻合 ÷ 預排人日</div>
          </div>
        </div>
        <div className="ir-scroll">
          <table className="ir-table">
            <thead>
              <tr>
                <th>人員</th>
                <th>組別</th>
                <th className="num">預排人日</th>
                <th className="num">實際人日</th>
                <th className="num">吻合</th>
                <th className="num">有排未填</th>
                <th className="num">未排有填</th>
                <th className="num">實際營業額點數</th>
              </tr>
            </thead>
            <tbody>
              {report.people.map((p) => (
                <tr key={p.personId}>
                  <td className="strong">{p.label}</td>
                  <td>{p.teamText}</td>
                  <td className="num">{p.plannedDays || dash}</td>
                  <td className="num">{p.actualDays || dash}</td>
                  <td className="num">{p.matched || dash}</td>
                  <td className="num">{p.plannedOnly ? <span className="bad-text strong">{p.plannedOnly}</span> : dash}</td>
                  <td className="num">{p.actualOnly ? <span className="warn-text strong">{p.actualOnly}</span> : dash}</td>
                  <td className="num">{p.revenue ? r2(p.revenue) : dash}</td>
                </tr>
              ))}
              {!report.people.length && (
                <tr>
                  <td colSpan={8} className="muted">
                    這週沒有內業的預排或成本單
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">合計（{report.people.length} 人）</td>
                <td />
                <td className="num strong">{s.plannedDays}</td>
                <td className="num strong">{s.actualDays}</td>
                <td className="num strong">{s.matched}</td>
                <td className="num strong">{s.plannedOnly}</td>
                <td className="num strong">{s.actualOnly}</td>
                <td className="num strong">{r2(s.revenue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 2. 預排 vs 實際（工程） */}
      <div className="ir-card">
        <div className="ir-card-head">
          <h3>2. 預排 vs 實際（工程）</h3>
          <span className="muted small">
            預排 {cs.planned} 工程：有工作單 {cs.plannedWithOrders}、沒做 {cs.plannedNoOrders}・實際有工作單 {cs.actual} 工程，其中 {cs.unplanned} 工程沒排
          </span>
        </div>
        <Chips<CaseResult> label="工程結果" options={CASE_FILTERS} value={caseFilter} onPick={setCaseFilter} count={caseCount} />
        <div className="ir-scroll">
          <table className="ir-table">
            <thead>
              <tr>
                <th>工程編號</th>
                <th>工程名稱</th>
                <th className="num">預排人日</th>
                <th className="num">實際人日</th>
                <th className="num">實際營業額點數</th>
                <th className="num">工作單</th>
                <th>結果</th>
              </tr>
            </thead>
            <tbody>
              {caseRows.map((c) => (
                <tr key={c.caseId}>
                  <td className="strong">
                    {c.code}
                    {c.dup && <span className="pill pill-warn" title="同一工程內有完整案件編號相同的不同案件記錄（或占位碼重複）"> 編號重複</span>}
                  </td>
                  <td className="ir-wrap">{c.name || dash}</td>
                  <td className="num">{c.plannedDays || dash}</td>
                  <td className="num">{c.actualDays || dash}</td>
                  <td className="num">{c.orders ? r2(c.revenue) : dash}</td>
                  <td className="num">{c.orders || dash}</td>
                  <td>
                    <span className={RESULT_CLASS[c.result]}>{c.result}</span>
                  </td>
                </tr>
              ))}
              {!caseRows.length && (
                <tr>
                  <td colSpan={7} className="muted">
                    {report.cases.length ? "此分類沒有工程" : "這週沒有預排或工作單"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. 上週異常與人工確認案件 */}
      <div className="ir-card">
        <div className="ir-card-head">
          <h3>3. {weekName(week.offset)}異常與人工確認案件</h3>
          <span className="muted small">檢核說明需在 Lark 填寫，網站唯讀</span>
        </div>
        <Chips<string> label="異常類別" options={EXCEPTION_FILTERS} value={exFilter} onPick={setExFilter} count={exCount} />
        <div className="ir-tools">
          <label className="tool tool-select">
            人員
            <select value={exPerson} onChange={(e) => setExPerson(e.target.value)} aria-label="篩選人員">
              <option value="">全部</option>
              {exPeople.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <span className="muted small">負責經理：{INTERNAL_MANAGER}（內業）</span>
          <button className="tool" onClick={exportExceptions} disabled={!exRows.length} title="匯出 CSV">
            <Download size={14} strokeWidth={1.75} /> 匯出
          </button>
        </div>
        <div className="ir-scroll">
          <table className="ir-table">
            <thead>
              <tr>
                <th className="num">項次</th>
                <th>類別</th>
                <th>負責經理</th>
                <th>組別</th>
                <th>人員</th>
                <th>工程編號</th>
                <th>日期</th>
                <th className="num">天數</th>
                <th className="num">營業額點數</th>
                <th>工程簡稱</th>
                <th>說明</th>
              </tr>
            </thead>
            <tbody>
              {exRows.map((e, i) => (
                <tr key={`${e.kinds.join("+")}|${e.personId}|${e.caseId}|${e.team}|${e.from}`}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <span className="ir-kinds">
                      {e.kinds.map((k) => (
                        <span key={k} className={KIND_CLASS(k)}>
                          {k}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="fr-nowrap">{INTERNAL_MANAGER}</td>
                  <td>{e.team}</td>
                  <td className="strong">{e.person}</td>
                  <td>{e.code}</td>
                  <td>{range(e)}</td>
                  <td className="num">{e.days}</td>
                  <td className="num">{e.revenue === null ? dash : r2(e.revenue)}</td>
                  <td className="ir-wrap">{e.name || dash}</td>
                  <td className="ir-note">{e.note || dash}</td>
                </tr>
              ))}
              {!exRows.length && (
                <tr>
                  <td colSpan={11} className="muted">
                    {report.exceptions.length ? "此分類沒有項目" : `${weekName(week.offset)}沒有需要人工確認的項目`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          ⚠亮燈：組別權重=0 {report.flagCounts["⚠組別權重=0"] ?? 0} 張・案件不符 {report.flagCounts["⚠案件不符"] ?? 0} 張・工項不符 {report.flagCounts["⚠工項不符"] ?? 0} 張・檢核狀態已退回 {report.returned} 張（同一張單可同時亮多個燈）。
        </p>
      </div>

      {/* 4. 待定義（節點期限、節點狀態、確認單營業額／執行比例只會在 V4 才有，V3 不呈現） */}
      {version === "v4" && (
      <div className="ir-card ir-pending">
        <div className="ir-card-head">
          <Hourglass size={16} />
          <h3>待定義：圖資／報告節點期限與執行比例</h3>
        </div>
        <p>口徑待業主說明（確認單營業額來源為工程確認單，目前 V4／報價 Base 尚未開放讀取）。</p>
        <p className="muted small">待定義項目：圖資／報告的期限（n+2、N+2、N+1）、節點狀態（未逾期／預計逾期／已逾期／無工作）、確認單營業額與執行比例。這些項目 V4 才有，待依 V4 邏輯實作；口徑確定前不計算、不顯示數字。</p>
      </div>
      )}

      <ul className="cg-notes">
        <li>
          <CircleAlert size={14} /> 預排取業別＝內業（ROV 一律算外業、休假條不算）；預排「人員」可多人，逐人展開，同人同日多條只算 1 人日。
        </li>
        <li>
          <CircleAlert size={14} /> 實際人日＝所選週內成本單的不重複（人，日期），沒有工作單的成本單也算。組別只顯示（取成本單的內業組別），不參與比對；本週在兩個組別填單的人，名字後面接組別。
        </li>
        <li>
          <CircleAlert size={14} /> 人日達成率＝吻合 ÷ 預排人日，是人日口徑，不是營業額或工程口徑。
        </li>
        <li>
          <CircleAlert size={14} /> 案件以「工程」為單位：工程編號＝案件編號前 7 碼（C115016、C115016A、C115016-2-1 同屬工程 C115016），案件先用 link record_id 查出案件編號再取前 7 碼；空白、全 0 占位碼（C000000）、格式不符的案件不合併，一案一列；工程內有完整編號相同的不同記錄會標「編號重複」。同人同日排或做了多個工程時各工程各算 1 天，所以工程人日、第 3 項天數的合計可能大於上方人日。
        </li>
        <li>
          <CircleAlert size={14} /> 第 3 項同人同案連續（日曆連續）日期合併成 起～迄；「說明」顯示工作單備註原文（有排未填顯示預排備註）。V3、V4 分開看，不相加。
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
