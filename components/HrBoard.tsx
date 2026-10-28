"use client";
import { CircleAlert, Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatNumber } from "@/lib/aggregate";
import { OT_APPLICANT, OT_HOURS, OT_HOURS_RAW, OT_START, OT_STATUS, OT_TYPE, mondayOf, summarizeOvertime, teamSections, type OtRecord, type OtTeamLine, type OtTeamSection } from "@/lib/overtime";
import { PEOPLE_GROUP, PEOPLE_NAME, buildPeopleDirectory, type PeopleRow } from "@/lib/people";
import { weekName } from "@/lib/week";
import { useShell } from "./AppShell";
import AttendanceCards from "./AttendanceCards";
import RecruitmentSection from "./RecruitmentSection";
import { STATUS_TEXT, useSource, type SourceState } from "./useSource";

const round1 = (n: number) => formatNumber(Math.round(n * 10) / 10);

// 數字格：0 顯示「—」（平日／假日／類型待定義）；合計與卡片照實顯示。
const h1 = (n: number) => (n ? round1(n) : "—");

const OT_DAY = 86400000;
// 週鍵（週一 YYYY-MM-DD）→ 可讀的週區間。full＝完整標題「2026-10-19 ～ 10-25（週）」；
// 否則給按鈕用的短標「10-19～10-25」。非日期（未填週）原樣顯示。
function weekRangeLabel(monday: string, full = false): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) return monday;
  const start = Date.parse(`${monday}T00:00:00+08:00`);
  const end = new Date(start + 6 * OT_DAY + 8 * 3600000);
  const em = String(end.getUTCMonth() + 1).padStart(2, "0");
  const ed = String(end.getUTCDate()).padStart(2, "0");
  return full ? `${monday} ～ ${em}-${ed}（週）` : `${monday.slice(5)}～${em}-${ed}`;
}

// 組別總結（比照 R02 的 TeamSummary）：每組一列、最後全部合計；點組別列＝只看該組的人。
function TeamTable({ teams, all, selected, hasOther, onPick }: { teams: OtTeamLine[]; all: OtTeamLine; selected: string | null; hasOther: boolean; onPick: (team: string | null) => void }) {
  const cells = (l: OtTeamLine) => (
    <>
      <td>{l.people}</td>
      <td>{h1(l.weekday)}</td>
      <td>{h1(l.holiday)}</td>
      {hasOther && <td>{h1(l.other)}</td>}
      <td className="strong">{round1(l.total)}</td>
      <td>{l.count}</td>
    </>
  );
  return (
    <div className="cg-teamsum">
      <div className="cg-days-head">
        <h3>組別總結</h3>
        <span className="muted small">點一組只看該組的人；人數同一人只算一次</span>
      </div>
      <div className="cg-sheet">
        <table>
          <thead>
            <tr>
              <th>組別</th>
              <th>人數</th>
              <th>平日時數</th>
              <th>假日時數</th>
              {hasOther && <th>類型待定義</th>}
              <th>合計時數</th>
              <th>張數</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((l) => (
              <tr key={l.group} className={`cg-link ${selected === l.group ? "cg-on" : ""}`} onClick={() => onPick(l.group)}>
                <td className="cg-sheet-name">{l.group}</td>
                {cells(l)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="cg-link" onClick={() => onPick(null)}>
              <td className="cg-sheet-name">{all.group}</td>
              {cells(all)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// 人員表（比照 R02）：依組別分段，每段一列組小計，下面每人一列。
function PeopleTable({ sections, total, hasOther, team }: { sections: OtTeamSection[]; total: OtTeamLine; hasOther: boolean; team: string | null }) {
  return (
    <div className="cg-teamsum">
      <div className="cg-days-head">
        <h3>人員加班{team ? `・${team}` : ""}</h3>
        <span className="muted small">依組別分段，每段第一列是該組小計</span>
      </div>
      <div className="cg-sheet">
        <table>
          <thead>
            <tr>
              <th>姓名</th>
              <th>組別</th>
              <th>平日時數</th>
              <th>假日時數</th>
              {hasOther && <th>類型待定義</th>}
              <th>合計時數</th>
              <th>張數</th>
            </tr>
          </thead>
          <tbody>
            {sections.flatMap((sec) => [
              <tr key={`g|${sec.group}`} className="cg-team">
                <td className="cg-sheet-name">
                  {sec.group}小計・{sec.line.people} 人
                </td>
                <td>{sec.group}</td>
                <td>{h1(sec.line.weekday)}</td>
                <td>{h1(sec.line.holiday)}</td>
                {hasOther && <td>{h1(sec.line.other)}</td>}
                <td>{round1(sec.line.total)}</td>
                <td>{sec.line.count}</td>
              </tr>,
              ...sec.people.map((p) => (
                <tr key={`p|${p.group}|${p.uid}`} className="cg-person">
                  <td className="cg-sheet-name">{p.name}</td>
                  <td>{p.group}</td>
                  <td>{h1(p.weekday)}</td>
                  <td>{h1(p.holiday)}</td>
                  {hasOther && <td>{h1(p.other)}</td>}
                  <td className="strong">{round1(p.total)}</td>
                  <td>{p.count}</td>
                </tr>
              )),
            ])}
          </tbody>
          <tfoot>
            <tr>
              <td className="cg-sheet-name">合計（{team ? "此組" : "全部"} {total.people} 人）</td>
              <td />
              <td>{h1(total.weekday)}</td>
              <td>{h1(total.holiday)}</td>
              {hasOther && <td>{h1(total.other)}</td>}
              <td>{round1(total.total)}</td>
              <td>{total.count}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function SalaryOvertime({ state, peopleState, weekStart }: { state: SourceState; peopleState: SourceState; weekStart: number }) {
  const [picked, setPicked] = useState<string | null>(null);
  // 週會看上週／本週加班，所以預設「按週檢視」；一鍵切「按月檢視」。切換時清掉已選桶，
  // 讓新模式回到預設對準（週＝上方週選擇器那一週、月＝那一週所在月份）。
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const switchMode = (m: "week" | "month") => {
    setViewMode(m);
    setPicked(null);
  };
  // 組別篩選（?otTeam=）放在網址上可分享；參數名避開 R02 的 ?team=。
  const [team, setTeam] = useState<string | null>(null);
  useEffect(() => setTeam(new URLSearchParams(window.location.search).get("otTeam")), []);
  const pickTeam = (t: string | null) => {
    setTeam(t);
    const u = new URL(window.location.href);
    if (t) u.searchParams.set("otTeam", t);
    else u.searchParams.delete("otTeam");
    window.history.replaceState(null, "", u);
  };
  // 公司組織架構＝V3 人員名單：發起人 open_id → Lark帳號 → 所屬組別。讀不到（或缺欄位）就沒有組別，不亂歸。
  const directory = useMemo(() => {
    const d = peopleState.status === "ok" ? peopleState.data : undefined;
    if (!d) return null;
    const names = new Set(d.fields.map((f) => f.name));
    return names.has(PEOPLE_NAME) && names.has(PEOPLE_GROUP) ? buildPeopleDirectory(d.records as PeopleRow[]) : null;
  }, [peopleState.status, peopleState.data]);
  const view = useMemo(() => {
    const d = state.data;
    if (!d) return null;
    const names = new Set(d.fields.map((f) => f.name));
    // 發起人是主要欄（加班人只是備援），欄不見了要明講，不要悄悄全部變「—」。
    const missing = [OT_APPLICANT, OT_START, OT_TYPE, OT_STATUS].filter((n) => !names.has(n));
    const noHours = !names.has(OT_HOURS) && !names.has(OT_HOURS_RAW);
    return { missing, noHours, sum: summarizeOvertime(d.records as OtRecord[], directory) };
  }, [state.data, directory]);

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
  if (peopleState.status === "loading")
    return <p className="muted small">{STATUS_TEXT.loading}</p>;
  if (view.missing.length || view.noHours)
    return (
      <p className="muted small">
        詠翔加班缺少必要欄位，待定義：{[...view.missing, ...(view.noHours ? ["加班時數"] : [])].join("、")}（已讀取的欄位：{state.data.fields.map((f) => f.name).join("、") || "無"}）。
      </p>
    );

  const { sum } = view;
  const d = new Date(weekStart + 8 * 3600000);
  const weekMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const weekMonday = mondayOf(weekStart);
  const byWeek = viewMode === "week";
  const buckets = byWeek ? sum.byWeek : sum.byMonth;
  const keys = byWeek ? sum.weeks : sum.months;
  const preferred = byWeek ? weekMonday : weekMonth;
  // 已選桶 → 上方週選擇器對準的桶 → 最近一個有已通過加班的桶（keys 由新到舊），
  // 保證有資料時一打開就看得到真實數字。
  const current = picked && buckets.has(picked) ? picked : buckets.has(preferred) ? preferred : keys[0];
  const month = current ? buckets.get(current) : undefined;
  const periodLabel = current ? (byWeek ? weekRangeLabel(current, true) : current) : "";
  const chipLabel = (k: string) => (byWeek ? weekRangeLabel(k) : k);
  const hasOther = !!month?.all.other;
  // 選到的組別這個月沒有加班 → 當作沒篩（按鈕列只列有加班的組）。
  const activeTeam = month && sum.hasDirectory && team && month.teams.some((l) => l.group === team) ? team : null;
  const sections = month ? teamSections(month.people).filter((s) => !activeTeam || s.group === activeTeam) : [];
  const shownTotal = month ? (activeTeam ? sections[0].line : month.all) : undefined;

  return (
    <div className="hr-src">
      <div className="hr-src-head">
        詠翔加班
        <span className="muted small">
          {byWeek ? "以週為單位（依開始時間）" : "以月為單位（依開始時間）"}・只計申請狀態「已通过」・{month ? `${periodLabel}・${month.all.people} 人有加班` : "沒有已通过的加班"}
        </span>
      </div>
      <div className="cg-picker" role="group" aria-label="檢視方式">
        <button className={`cg-chip ${byWeek ? "on" : ""}`} onClick={() => switchMode("week")} aria-pressed={byWeek}>
          按週檢視
        </button>
        <button className={`cg-chip ${!byWeek ? "on" : ""}`} onClick={() => switchMode("month")} aria-pressed={!byWeek}>
          按月檢視
        </button>
      </div>
      {keys.length > 1 && (
        <div className="cg-picker" role="group" aria-label={byWeek ? "選擇週" : "選擇月份"}>
          {keys.slice(0, 12).map((k) => (
            <button key={k} className={`cg-chip ${k === current ? "on" : ""}`} onClick={() => setPicked(k)} aria-pressed={k === current} title={byWeek ? weekRangeLabel(k, true) : k}>
              {chipLabel(k)}
            </button>
          ))}
        </div>
      )}
      {!sum.hasDirectory && (
        <p className="bad-text small">
          V3 人員名單讀取失敗，暫時無法歸組別（下表組別顯示「—」）{peopleState.error ? `：${peopleState.error}` : ""}。
        </p>
      )}
      {month && (
        <div className="kpis hr-kpis">
          <div className="kpi">
            <div className="kpi-label">{byWeek ? "本週加班總時數" : "本月加班總時數"}</div>
            <div className="kpi-value">{round1(month.all.total)}</div>
            <div className="kpi-sub">
              {periodLabel}・平日 {round1(month.all.weekday)}・假日 {round1(month.all.holiday)}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">加班人數</div>
            <div className="kpi-value">{month.all.people}</div>
            <div className="kpi-sub">同一人只算一次</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">計入張數</div>
            <div className="kpi-value">{month.all.count}</div>
            <div className="kpi-sub">已通过且有時數的審批單</div>
          </div>
        </div>
      )}
      {month && sum.hasDirectory && month.teams.length > 1 && (
        <div className="cg-picker" role="group" aria-label="選擇組別">
          <button className={`cg-chip ${!activeTeam ? "on" : ""}`} onClick={() => pickTeam(null)} aria-pressed={!activeTeam}>
            全部組別
          </button>
          {month.teams.map((l) => (
            <button key={l.group} className={`cg-chip ${activeTeam === l.group ? "on" : ""}`} onClick={() => pickTeam(l.group)} aria-pressed={activeTeam === l.group}>
              {l.group}
            </button>
          ))}
        </div>
      )}
      {month && shownTotal ? (
        <>
          <TeamTable teams={month.teams} all={month.all} selected={activeTeam} hasOther={hasOther} onPick={pickTeam} />
          <PeopleTable sections={sections} total={shownTotal} hasOther={hasOther} team={activeTeam} />
        </>
      ) : (
        <p className="muted small">沒有已通过的加班紀錄。</p>
      )}
      <p className="muted small">
        口徑：逐筆加班審批單，只計申請狀態「已通过」；被排除 {sum.excludedStatus} 筆
        {sum.excludedBy.length ? `（${sum.excludedBy.map((x) => `${x.status} ${x.count}`).join("、")}）` : ""}；已通过但時數空白 {sum.noHours} 筆不計。時數＝「薪資計算加班時數」（原始時數＋人工補正；缺時用原始時數），顯示到小數 1 位。平日＝加班類型「平日」，其餘（休息日、例假日、國定假日）算假日；類型空白另列「待定義」。張數＝計入的審批單數。不讀任何金額欄位。
      </p>
      {sum.hasDirectory && (
        <p className="muted small">
          人＝「發起人」（發起人空白才用「加班人」{sum.fallbackToOvertimer > 0 ? `，這樣的單 ${sum.fallbackToOvertimer} 張` : ""}）；組別依 V3 人員名單的所屬組別（公司組織架構）：先用發起人的 open_id 對人員名單的 Lark帳號，對不到時以姓名完全相同對。未對應組別 {month?.unmapped ?? 0} 張（{periodLabel || (byWeek ? "本週" : "本月")}；全部期間 {sum.unmapped} 張）：發起人不在人員名單、名單沒填所屬組別，或同名無法判斷。
          {sum.multiPerson > 0 ? `人填了多位的單 ${sum.multiPerson} 張，整張算一列、時數不拆分；這類單的人都同組才歸該組，否則歸未對應組別。` : ""}
        </p>
      )}
    </div>
  );
}

export default function HrBoard() {
  const { week } = useShell();
  const salary = useSource("salary-overtime", { people: true });
  const people = useSource("v3-people", { people: true });

  return (
    <div className="hr">
      <RecruitmentSection />

      <AttendanceCards />

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
            <CircleAlert size={14} /> 取自薪水計算 Base 的「詠翔加班」，只讀發起人（加班人備援）、開始時間、加班類型、申請狀態與時數；組別取自 V3 人員名單（只讀姓名、Lark帳號、所屬組別、在職）。底薪、總薪資、加班費等其他欄位不讀取。誰能看由 HR_VIEWERS 設定。
          </li>
        </ul>
        <SalaryOvertime state={salary} peopleState={people} weekStart={week.start} />
      </section>
    </div>
  );
}
