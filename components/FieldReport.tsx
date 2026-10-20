"use client";
// R10 外業報告（外業經理用）：預排 vs 實際（以案件為單位）、異常與人工確認案件、檢核待辦。
// 邏輯在 lib/fieldReport.ts（純函式，scripts/test-field-report.mjs 測試）。網站唯讀：檢核說明要到 Lark 填。
import { CircleAlert, Download, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatNumber } from "@/lib/aggregate";
import { downloadCsv, simpleCsv } from "@/lib/csv";
import { buildFieldReport, FIELD_CASE_FIELDS, FIELD_SCHEDULE_FIELDS, FIELD_WORK_FIELDS, fmtRange, NO_CASE_LABEL, taipeiDay, type CaseResult, type ExceptionKind } from "@/lib/fieldReport";
import { managerOf } from "@/lib/managers";
import { sourceByKey, type DataVersion } from "@/lib/reports";
import { weekName } from "@/lib/week";

type LeaveResp = { status: string; days?: Record<string, { date: string; kind: string }[]>; rangeClamped?: boolean };
const FIELD_MANAGER = managerOf("外業"); // 吳科翰
import { useShell } from "./AppShell";
import EmptyState from "./EmptyState";
import { STATUS_TEXT, useSource } from "./useSource";

const r2 = (n: number) => formatNumber(Math.round(n * 100) / 100);
const dash = <span className="muted">—</span>;

const RESULT_PILL: Record<CaseResult, string> = { 有排有做: "pill-good", 有排未做: "pill-bad", 未排有做: "pill-warn", 有排未到期: "", 預排讀不到: "" };
const KIND_PILL: Record<ExceptionKind, string> = { 未排有做: "pill-warn", 有排未做: "pill-bad", "有排未做（已請假）": "pill-good", 工作單異常: "pill-bad" };

function Chips<T extends string>({ value, onChange, options, label }: { value: T | "全部"; onChange: (v: T | "全部") => void; options: { key: T | "全部"; n: number }[]; label: string }) {
  return (
    <div className="cg-picker" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} className={`cg-chip ${value === o.key ? "on" : ""}`} aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
          {o.key} {o.n}
        </button>
      ))}
    </div>
  );
}

export default function FieldReport() {
  const { week, version: globalVersion, demo, tick, manual } = useShell();
  const [localVersion, setLocalVersion] = useState<DataVersion>("v3");
  const version: DataVersion = globalVersion === "all" ? localVersion : globalVersion;
  const work = useSource(`${version}-field-work`, { fields: FIELD_WORK_FIELDS, links: true });
  const sched = useSource(`${version}-schedule`, { fields: FIELD_SCHEDULE_FIELDS, links: true });
  // 案件表只有 V3（案件編號、案件名稱）；V4 沒有對應來源，名稱就用工作單／預排上的標題。
  const cases = useSource("v3-cases", { fields: FIELD_CASE_FIELDS, enabled: version === "v3" });
  const [caseFilter, setCaseFilter] = useState<CaseResult | "全部">("全部");
  const [excFilter, setExcFilter] = useState<ExceptionKind | "全部">("全部");
  const [excGroup, setExcGroup] = useState<string>("全部");

  // 「已請假＝正常」：抓 Lark 假勤，把當天預排的人都請假／出差／外出的「有排未做」自動判為正常。
  const [leaveDays, setLeaveDays] = useState<Map<string, Set<number>> | null>(null);
  const [leaveState, setLeaveState] = useState<"off" | "ok" | "fail">("off");
  const [leaveClamped, setLeaveClamped] = useState(false);
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
          setLeaveClamped(false);
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
        setLeaveClamped(!!res.rangeClamped);
      })
      .catch(() => !off && (setLeaveDays(null), setLeaveState("fail"), setLeaveClamped(false)));
    return () => {
      off = true;
    };
  }, [week.start, week.end, demo, tick, manual]);

  const casesState = version === "v3" ? cases.status : "skipped";
  const report = useMemo(() => {
    if (work.status !== "ok" || !work.data) return null;
    if (sched.status === "loading" || casesState === "loading") return null;
    return buildFieldReport({
      work: work.data,
      sched: sched.status === "ok" ? sched.data : undefined,
      cases: casesState === "ok" ? cases.data : undefined,
      start: week.start,
      end: week.end,
      leave: leaveDays ?? undefined,
    });
  }, [work.status, work.data, sched.status, sched.data, casesState, cases.data, week.start, week.end, leaveDays]);

  const wk = weekName(week.offset);
  const header = (
    <div className="cg-head">
      <div>
        <h2>{wk}預排及實際完成檢討（外業）</h2>
        <p className="muted small">
          {wk} {week.label}・比對預排及實際完成的工程，判斷預排是否失誤；修改預排須在 Lark 備註說明原因
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
      <section className="cg fr">
        {header}
        <EmptyState kind={work.status} title={`外業工作單（${version.toUpperCase()}）：${STATUS_TEXT[work.status]}`}>
          {work.error && <div className="mono">{work.error}</div>}
        </EmptyState>
      </section>
    );
  }
  if (!report) {
    return (
      <section className="cg fr">
        {header}
        <EmptyState kind="empty" title="載入中" />
      </section>
    );
  }

  const s = report.summary;
  const notes = [...report.notes];
  if (sched.status !== "ok") notes.push(`工作預排（${version.toUpperCase()}）${STATUS_TEXT[sched.status]}${sched.error ? `：${sched.error}` : ""}`);
  if (casesState !== "ok" && casesState !== "skipped") notes.push(`案件表${STATUS_TEXT[cases.status]}：沒有案件名稱，改用工作單與預排上的案件標題${cases.error ? `（${cases.error}）` : ""}`);
  if (casesState === "skipped") notes.push("V4 沒有案件表來源，案件名稱空白");
  if (report.hiddenGroups.length) notes.push(`不列入（非外業組）：${report.hiddenGroups.map((h) => `${/^rec/.test(h.group) ? "未對應組別" : h.group}（${h.orders} 張）`).join("、")}`);
  if (work.data?.stale) notes.push("工作單為上次成功讀取的快照");

  const caseResults = ["有排有做", "有排未做", "未排有做", "有排未到期"] as const;
  const caseRows = caseFilter === "全部" ? report.cases : report.cases.filter((c) => c.result === caseFilter);
  const excKinds = ["未排有做", "有排未做", "有排未做（已請假）", "工作單異常"] as const;
  const excGroups = [...new Set(report.exceptions.map((e) => e.group))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  const excRows = report.exceptions.filter((e) => (excFilter === "全部" || e.kind === excFilter) && (excGroup === "全部" || e.group === excGroup));
  const leaveAutoN = report.exceptions.filter((e) => e.kind === "有排未做（已請假）").length;
  const exportExceptions = () =>
    downloadCsv(
      `R10_異常與人工確認_${version.toUpperCase()}_${week.label.replace(/[\s/–]/g, "_")}.csv`,
      simpleCsv(
        ["項次", "類型", "負責經理", "組別", "工程編號", "出工日期", "實際出工天數", "營業額點數", "工程簡稱", "說明"],
        excRows.map((e) => [e.n, e.kind, FIELD_MANAGER, e.group, e.no, fmtRange(e.from, e.to), e.days, e.orders ? r2(e.points) : "", e.name, e.desc.join("；")]),
        [`R10 外業 ${weekName(week.offset)} ${week.label}・負責經理 ${FIELD_MANAGER}`, `類型＝${excFilter}、組別＝${excGroup}`],
      ),
    );
  const larkUrl = sourceByKey(`${version}-field-work`)?.url;
  const t = report.checksTotal;
  const noMgr = !report.hasFields.manager;
  const noCtrl = !report.hasFields.control;

  return (
    <section className="cg fr">
      {header}

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">預排組日</div>
          <div className="kpi-value">{report.scheduleOn ? s.planGroupDays : "—"}</div>
          <div className="kpi-sub">外業＋ROV，一組一天算 1</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">命中組日</div>
          <div className="kpi-value">{report.scheduleOn ? s.hitGroupDays : "—"}</div>
          <div className="kpi-sub">{report.scheduleOn ? `預排的組日當天有出工（未出工 ${s.missedGroupDays}）` : "預排讀不到"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">計畫外出工組日</div>
          <div className="kpi-value">{report.scheduleOn ? s.unplannedGroupDays : "—"}</div>
          <div className="kpi-sub">
            {report.scheduleOn ? (report.unplannedByGroup.length ? report.unplannedByGroup.map((g) => `${g.group} ${g.days}`).join("、") : "實際出工 " + s.actualGroupDays + " 組日，都有預排") : "預排讀不到"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">工程交集數</div>
          <div className="kpi-value">{report.scheduleOn ? s.caseOverlap : "—"}</div>
          <div className="kpi-sub">
            預排 {report.scheduleOn ? s.planCases : "—"} 工程・出工 {s.actualCases} 工程
          </div>
        </div>
      </div>
      <p className="muted small fr-lead">
        實際出工 {s.actualGroupDays} 組日・工作單 {s.orders} 張・營業額 {r2(s.points)} 點{s.blankPoints ? `（${s.blankPoints} 張未填點數）` : ""}
      </p>

      <div className="fr-sec">
        <div className="fr-sec-head">
          <h3>預排 vs 實際（以工程為單位）</h3>
          <span className="muted small">一工程一列；同組同日同工程才算吻合</span>
        </div>
        {report.scheduleOn && (
          <Chips
            label="結果分類"
            value={caseFilter}
            onChange={setCaseFilter}
            options={[{ key: "全部", n: report.cases.length }, ...caseResults.map((k) => ({ key: k, n: report.cases.filter((c) => c.result === k).length })).filter((o) => o.n > 0 || o.key === caseFilter)]}
          />
        )}
        <div className="fr-scroll">
          <table>
            <thead>
              <tr>
                <th>工程編號</th>
                <th>工程名稱</th>
                <th>結果</th>
                <th>預排組別</th>
                <th className="num">預排組日</th>
                <th>實際出工組別</th>
                <th className="num">實際出工組日</th>
                <th className="num">吻合組日</th>
                <th className="num">營業額點數</th>
                <th className="num">工作單</th>
              </tr>
            </thead>
            <tbody>
              {caseRows.map((c) => (
                <tr key={c.caseId}>
                  <td className="fr-nowrap">
                    {c.no}
                    {c.dup && <span className="pill pill-warn fr-dup" title="同一工程內有完整案件編號相同的不同案件記錄（或占位碼重複）">編號重複</span>}
                  </td>
                  <td className="fr-name">{c.name || dash}</td>
                  <td>
                    <span className={`pill ${RESULT_PILL[c.result]}`}>{c.result}</span>
                  </td>
                  <td>{c.planGroups.join("、") || dash}</td>
                  <td className="num">{report.scheduleOn ? c.planGroupDays : dash}</td>
                  <td>{c.actualGroups.join("、") || dash}</td>
                  <td className="num">{c.actualGroupDays}</td>
                  <td className="num">{report.scheduleOn ? c.matchedGroupDays : dash}</td>
                  <td className="num">{c.orders ? r2(c.points) : dash}</td>
                  <td className="num">{c.orders || dash}</td>
                </tr>
              ))}
              {!caseRows.length && (
                <tr>
                  <td colSpan={10} className="muted">
                    這週沒有符合的工程
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="fr-sec">
        <div className="fr-sec-head">
          <h3>{wk}異常與人工確認案件</h3>
          <span className="muted small">
            未排有做、有排未做，以及工作單有「突發狀況」、已退回、修改後數量≠完成數量；同組同案連續日期合併成 起～迄
          </span>
        </div>
        <Chips label="異常類型" value={excFilter} onChange={setExcFilter} options={[{ key: "全部", n: report.exceptions.length }, ...excKinds.map((k) => ({ key: k, n: report.exceptions.filter((e) => e.kind === k).length })).filter((o) => o.n > 0 || o.key === excFilter)]} />
        {excGroups.length > 1 && (
          <Chips label="組別" value={excGroup} onChange={setExcGroup} options={[{ key: "全部", n: report.exceptions.length }, ...excGroups.map((g) => ({ key: g, n: report.exceptions.filter((e) => e.group === g).length }))]} />
        )}
        <div className="fr-tools">
          <span className="muted small">負責經理：{FIELD_MANAGER}（外業）</span>
          <button className="tool" onClick={exportExceptions} disabled={!excRows.length} title="匯出 CSV">
            <Download size={14} strokeWidth={1.75} /> 匯出
          </button>
        </div>
        <div className="fr-scroll">
          <table>
            <thead>
              <tr>
                <th className="num">項次</th>
                <th>類型</th>
                <th>負責經理</th>
                <th>組別</th>
                <th>工程編號</th>
                <th>出工日期</th>
                <th className="num">實際出工天數</th>
                <th className="num">營業額點數</th>
                <th>工程簡稱</th>
                <th>說明（工作單原文）</th>
              </tr>
            </thead>
            <tbody>
              {excRows.map((e) => (
                <tr key={e.n}>
                  <td className="num">{e.n}</td>
                  <td>
                    <span className={`pill ${KIND_PILL[e.kind]}`}>{e.kind}</span>
                  </td>
                  <td className="fr-nowrap">{FIELD_MANAGER}</td>
                  <td className="fr-nowrap">{e.group}</td>
                  <td className="fr-nowrap">{e.no === NO_CASE_LABEL ? <span className="muted">{e.no}</span> : e.no}</td>
                  <td className="fr-nowrap">
                    {fmtRange(e.from, e.to)}
                    {(e.kind === "有排未做" || e.kind === "有排未做（已請假）") && <span className="muted small">　預排</span>}
                  </td>
                  <td className="num">{e.days}</td>
                  <td className="num">{e.orders ? r2(e.points) : dash}</td>
                  <td className="fr-name">{e.name || dash}</td>
                  <td>
                    <div className="fr-desc">
                      {e.desc.map((d, i) => (
                        <div key={i}>{d}</div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {!excRows.length && (
                <tr>
                  <td colSpan={10} className="muted">
                    {report.scheduleOn ? "這週沒有符合的異常" : "預排讀不到，只列得出工作單異常"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {leaveState === "ok" && leaveAutoN > 0 && <p className="muted small">已套用 Lark 假勤：{leaveAutoN} 筆「有排未做」因當天預排的人都請假／出差／外出，自動判為正常（顯示為「有排未做（已請假）」）。</p>}
        {leaveState === "fail" && !demo && <p className="muted small">未套用 Lark 假勤（沒有人事查看權限或讀取失敗）：「有排未做」未自動扣除請假。</p>}
        {leaveClamped && <p className="muted small">查詢區間超過今天 +60 天上限，Lark 假勤只抓到上限為止；超出的日子未套用請假判定。</p>}
        <p className="muted small">
          檢核說明需在 Lark 填寫，網站唯讀。
          {larkUrl && (
            <>
              {" "}
              <a href={larkUrl} target="_blank" rel="noreferrer" className="fr-link">
                開啟 Lark 外業工作單 <ExternalLink size={12} />
              </a>
            </>
          )}
        </p>
      </div>

      <div className="fr-sec">
        <div className="fr-sec-head">
          <h3>檢核待辦</h3>
          <span className="muted small">{wk}工作單，依組統計</span>
        </div>
        <div className="fr-scroll">
          <table>
            <thead>
              <tr>
                <th>組別</th>
                <th className="num">工作單</th>
                <th className="num">外業經理檢核未勾</th>
                <th className="num">控制組檢核未勾</th>
                <th className="num">已退回</th>
              </tr>
            </thead>
            <tbody>
              {report.checks.map((c) => (
                <tr key={c.group}>
                  <td className="fr-nowrap">{c.group}</td>
                  <td className="num">{c.orders}</td>
                  <td className="num">{noMgr ? dash : c.managerUnchecked ? <span className="bad-text strong">{c.managerUnchecked}</span> : 0}</td>
                  <td className="num">{noCtrl ? dash : c.controlUnchecked ? <span className="bad-text strong">{c.controlUnchecked}</span> : 0}</td>
                  <td className="num">{!report.hasFields.status ? dash : c.returned ? <span className="bad-text strong">{c.returned}</span> : 0}</td>
                </tr>
              ))}
              {!report.checks.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    這週沒有工作單
                  </td>
                </tr>
              )}
            </tbody>
            {report.checks.length > 0 && (
              <tfoot>
                <tr>
                  <td>合計</td>
                  <td className="num">{t.orders}</td>
                  <td className="num">{noMgr ? dash : t.managerUnchecked}</td>
                  <td className="num">{noCtrl ? dash : t.controlUnchecked}</td>
                  <td className="num">{!report.hasFields.status ? dash : t.returned}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="fr-pending">
        <h3>圖資／報告節點期限與狀態</h3>
        <p>
          <span className="pill">待定義</span> 圖資／報告節點期限（N+1／N+2）與節點狀態（未逾期／預計逾期／已逾期／無工作）：口徑待業主說明，這次不計算、不顯示數字。
        </p>
      </div>

      <ul className="cg-notes">
        <li>
          <CircleAlert size={14} /> 外業以「組」為單位；預排只取業別＝外業，ROV 組一律算外業；預排組名去尾「組」比對（水深A組＝水深A）。排除行政、業務、內業、資訊組與未對應組別。
        </li>
        <li>
          <CircleAlert size={14} /> 工作單與預排以「工程」為單位比對：工程編號＝案件編號前 7 碼（C115016、C115016A、C115016-2-1 同屬工程 C115016），案件先用 link record_id 查出案件編號再取前 7 碼。空白、全 0 占位碼（C000000）、格式不符的案件不合併，一案一列；工程內有完整編號相同的不同記錄會標「編號重複」。
        </li>
        <li>
          <CircleAlert size={14} /> 組日＝一組一天。預排日晚於今天的不納入（尚未到期不算「沒做」）；條類型為休假的預排不算；預排沒填案件的只算組日，不進案件比對。預排日期依欄位 id 取，不看欄名。
        </li>
        <li>
          <CircleAlert size={14} /> 外業經理檢核、控制組檢核是核取方塊，沒勾＝未勾；已退回＝檢核狀態「已退回」。網站只讀 Lark、不寫回，V3、V4 分開看、不相加。
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
