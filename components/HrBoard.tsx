"use client";
import { CalendarCheck, CircleAlert, Clock, Plane, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/aggregate";
import { OT_DEPT, OT_HOURS, OT_HOURS_RAW, OT_NAME, OT_START, OT_STATUS, OT_TYPE, summarizeOvertime, type OtRecord } from "@/lib/overtime";
import { weekName } from "@/lib/week";
import { useShell } from "./AppShell";
import { STATUS_TEXT, useSource, type SourceState } from "./useSource";

const round1 = (n: number) => formatNumber(Math.round(n * 10) / 10);

function SalaryOvertime({ state, weekStart }: { state: SourceState; weekStart: number }) {
  const [picked, setPicked] = useState<string | null>(null);
  const view = useMemo(() => {
    const d = state.data;
    if (!d) return null;
    const names = new Set(d.fields.map((f) => f.name));
    const missing = [OT_NAME, OT_START, OT_TYPE, OT_STATUS].filter((n) => !names.has(n));
    const noHours = !names.has(OT_HOURS) && !names.has(OT_HOURS_RAW);
    return { missing, noHours, hasDept: names.has(OT_DEPT), sum: summarizeOvertime(d.records as OtRecord[]) };
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
      {month && month.groups.length > 0 && (
        <div className="cg-focus-items">
          <span className="muted small">各{view.hasDept ? "部門（發起人部門，是否等同組別待確認）" : "組"}加班時數</span>
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
                <th>部門</th>
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
        口徑：逐筆加班審批單，只計「已通过」；未通过 {sum.excludedStatus} 筆（審批中、已撤回、已拒絕、已刪除等）不計；已通过但時數空白 {sum.noHours} 筆不計。時數＝「薪資計算加班時數」（原始時數＋人工補正；缺時用原始時數）。平日＝加班類型「平日」，其餘（休息日、例假日、國定假日）算假日；類型空白另列「待定義」。部門取自發起人部門。不讀任何金額欄位。
      </p>
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
