"use client";
import { CircleAlert, Clock, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/aggregate";
import { OT_HOURS, OT_HOURS_RAW, OT_NAME, OT_START, OT_STATUS, OT_TYPE, summarizeOvertime, type OtRecord } from "@/lib/overtime";
import { PEOPLE_GROUP, PEOPLE_NAME, buildPeopleDirectory, type PeopleRow } from "@/lib/people";
import { weekName } from "@/lib/week";
import { useShell } from "./AppShell";
import AttendanceCards from "./AttendanceCards";
import { STATUS_TEXT, useSource, type SourceState } from "./useSource";

const round1 = (n: number) => formatNumber(Math.round(n * 10) / 10);

function SalaryOvertime({ state, peopleState, weekStart }: { state: SourceState; peopleState: SourceState; weekStart: number }) {
  const [picked, setPicked] = useState<string | null>(null);
  // 公司組織架構＝V3 人員名單：加班人 open_id → Lark帳號 → 所屬組別。讀不到（或缺欄位）就沒有組別，不亂歸。
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
    const missing = [OT_NAME, OT_START, OT_TYPE, OT_STATUS].filter((n) => !names.has(n));
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
  const current = picked && sum.byMonth.has(picked) ? picked : sum.byMonth.has(weekMonth) ? weekMonth : sum.months[0];
  const month = current ? sum.byMonth.get(current) : undefined;
  const hasOther = !!month?.people.some((p) => p.other > 0);

  return (
    <div className="hr-src">
      <div className="hr-src-head">
        詠翔加班
        <span className="muted small">
          以月為單位（依開始時間）・只計申請狀態「已通过」・{month ? `${month.people.length} 人有加班` : "沒有已通过的加班"}
        </span>
      </div>
      {sum.months.length > 1 && (
        <div className="cg-picker" role="group" aria-label="選擇月份">
          {sum.months.slice(0, 12).map((m) => (
            <button key={m} className={`cg-chip ${m === current ? "on" : ""}`} onClick={() => setPicked(m)} aria-pressed={m === current}>
              {m}
            </button>
          ))}
        </div>
      )}
      {!sum.hasDirectory && (
        <p className="bad-text small">
          V3 人員名單讀取失敗，暫時無法歸組別（下表組別顯示「—」）{peopleState.error ? `：${peopleState.error}` : ""}。
        </p>
      )}
      {month && sum.hasDirectory && month.groups.length > 0 && (
        <div className="cg-focus-items">
          <span className="muted small">各組加班時數</span>
          {month.groups.map((g) => (
            <span key={g.group} className="tag">
              {g.group} {round1(g.hours)}
            </span>
          ))}
        </div>
      )}
      {month ? (
        <div className="cg-detail">
          <table>
            <thead>
              <tr>
                <th>姓名</th>
                <th>組別</th>
                <th className="num">平日</th>
                <th className="num">假日</th>
                {hasOther && <th className="num">類型待定義</th>}
                <th className="num">加班時數合計</th>
              </tr>
            </thead>
            <tbody>
              {month.people.map((p) => (
                <tr key={`${p.name}|${p.group}`}>
                  <td className="strong">{p.name}</td>
                  <td>{p.group}</td>
                  <td className="num">{p.weekday ? round1(p.weekday) : "—"}</td>
                  <td className="num">{p.holiday ? round1(p.holiday) : "—"}</td>
                  {hasOther && <td className="num">{p.other ? round1(p.other) : "—"}</td>}
                  <td className="num strong">{round1(p.total)}</td>
                </tr>
              ))}
              <tr>
                <td className="strong">合計</td>
                <td />
                <td className="num strong">{round1(month.people.reduce((s, p) => s + p.weekday, 0))}</td>
                <td className="num strong">{round1(month.people.reduce((s, p) => s + p.holiday, 0))}</td>
                {hasOther && <td className="num strong">{round1(month.people.reduce((s, p) => s + p.other, 0))}</td>}
                <td className="num strong">{round1(month.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">沒有已通过的加班紀錄。</p>
      )}
      <p className="muted small">
        口徑：逐筆加班審批單，只計「已通过」；未通过 {sum.excludedStatus} 筆（審批中、已撤回、已拒絕、已刪除等）不計；已通过但時數空白 {sum.noHours} 筆不計。時數＝「薪資計算加班時數」（原始時數＋人工補正；缺時用原始時數）。平日＝加班類型「平日」，其餘（休息日、例假日、國定假日）算假日；類型空白另列「待定義」。不讀任何金額欄位。
      </p>
      {sum.hasDirectory && (
        <p className="muted small">
          組別依 V3 人員名單的所屬組別（公司組織架構）：先用加班人的 open_id 對人員名單的 Lark帳號，對不到時以姓名完全相同對。未對應組別 {month?.unmapped ?? 0} 張（{current ?? "本月"}；全部月份 {sum.unmapped} 張）：加班人不在人員名單、名單沒填所屬組別，或同名無法判斷。
          {sum.multiPerson > 0 ? `加班人填了多位的單 ${sum.multiPerson} 張，整張算一列、時數不拆分；這類單的人都同組才歸該組，否則歸未對應組別。` : ""}
        </p>
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
  const salary = useSource("salary-overtime", { people: true });
  const people = useSource("v3-people", { people: true });

  return (
    <div className="hr">
      <Pending icon={<UserPlus size={16} />} title="招聘">
        <p>暫無。</p>
      </Pending>

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
            <CircleAlert size={14} /> 取自薪水計算 Base 的「詠翔加班」，只讀加班人、開始時間、加班類型、申請狀態與時數；組別取自 V3 人員名單（只讀姓名、Lark帳號、所屬組別、在職）。底薪、總薪資、加班費等其他欄位不讀取。誰能看由 HR_VIEWERS 設定。
          </li>
        </ul>
        <SalaryOvertime state={salary} peopleState={people} weekStart={week.start} />
      </section>
    </div>
  );
}
