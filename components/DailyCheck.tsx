"use client";
// R04 管理工具（item 3）：每日檢查 — 選一天，列出誰沒填日誌（成本單）、沒排（預排）、沒打卡，以及是否請假／出差／外出。
// 資料範圍＝所選週（週選擇器），日期在該週內挑。純函式在 lib/scheduleCheck.ts。
import { CalendarCheck2, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { downloadCsv, simpleCsv } from "@/lib/csv";
import { dailyStatus, loggedPersonIds, parseRoster, scheduledPersonIds, taipeiDay, type CostSource } from "@/lib/scheduleCheck";
import { useShell } from "./AppShell";
import { STATUS_TEXT, useSource } from "./useSource";

const DAY = 86400000;
const TZ = 8 * 3600000;
const WD = ["一", "二", "三", "四", "五", "六", "日"];
const SCHED_FIELDS = ["#fldMXOggGP", "#fldjWv1xST", "#fld7KNCsVe", "#fld78OmLVn", "開始日期", "結束日期", "人員", "條類型"];
const LEAVE_TEXT: Record<string, string> = { leave: "請假", trip: "出差", out: "外出" };
type DailyResp = { status: string; leave?: Record<string, { date: string; kind: string }[]>; punch?: Record<string, string[]>; members?: string[] };

const yes = <span className="att-tag ok">✓</span>;
const no = <span className="att-tag bad">✗</span>;

export default function DailyCheck() {
  const { week, demo, tick, manual } = useShell();
  const people = useSource("v3-people");
  const sched = useSource("v3-schedule", { fields: SCHED_FIELDS, links: true });
  const iCost = useSource("v3-internal-cost", { fields: ["工作日期", "填報人"], links: true });
  const fCost = useSource("v3-field-cost", { fields: ["工作日期", "組長", "實際出工人", "組員"], links: true });
  const aCost = useSource("v3-admin-cost", { fields: ["工作日期", "填表人"], links: true });

  // 所選週的 7 天（台北），預設今天（不在本週就選週一）。
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(week.start + i * DAY + TZ).toISOString().slice(0, 10)), [week.start]);
  const todayStr = new Date(Date.now() + TZ).toISOString().slice(0, 10);
  const [date, setDate] = useState(days.includes(todayStr) ? todayStr : days[0]);
  useEffect(() => setDate(days.includes(todayStr) ? todayStr : days[0]), [days, todayStr]);
  const [onlyMissing, setOnlyMissing] = useState(true);

  const [daily, setDaily] = useState<DailyResp | null>(null);
  const [dailyState, setDailyState] = useState<"off" | "ok" | "fail">("off");
  useEffect(() => {
    let off = false;
    const qs = new URLSearchParams({ week: String(week.start) });
    if (demo) qs.set("demo", "1");
    if (tick > 0 && manual) qs.set("refresh", "1");
    fetch(`/api/attendance/daily?${qs}`)
      .then((r) => r.json())
      .then((res: DailyResp) => {
        if (off) return;
        setDaily(res.status === "ok" ? res : null);
        setDailyState(res.status === "ok" ? "ok" : "fail");
      })
      .catch(() => !off && (setDaily(null), setDailyState("fail")));
    return () => {
      off = true;
    };
  }, [week.start, demo, tick, manual]);

  const rows = useMemo(() => {
    if (people.status !== "ok" || !people.data) return null;
    const roster = parseRoster(people.data);
    const dayNo = taipeiDay(Date.parse(`${date}T00:00:00+08:00`));
    const dayStart = Date.parse(`${date}T00:00:00+08:00`);
    const planned = sched.status === "ok" && sched.data ? scheduledPersonIds(sched.data, dayStart, dayStart + DAY) : new Set<string>();
    const costSources: CostSource[] = [
      iCost.status === "ok" && iCost.data ? { data: iCost.data, dateNames: ["工作日期"], personNames: ["填報人"] } : null,
      fCost.status === "ok" && fCost.data ? { data: fCost.data, dateNames: ["工作日期"], personNames: ["組長", "實際出工人", "組員"] } : null,
      aCost.status === "ok" && aCost.data ? { data: aCost.data, dateNames: ["工作日期"], personNames: ["填表人"] } : null,
    ].filter((x): x is CostSource => Boolean(x));
    const logged = loggedPersonIds(costSources, dayNo);
    const members = new Set(daily?.members ?? []);
    const punched = new Set<string>();
    for (const [rid, ds] of Object.entries(daily?.punch ?? {})) if (ds.includes(date)) punched.add(rid);
    const leaveByRecord = new Map<string, "leave" | "trip" | "out">();
    for (const [rid, list] of Object.entries(daily?.leave ?? {})) {
      const hit = list.find((l) => l.date === date);
      if (hit) leaveByRecord.set(rid, hit.kind as "leave" | "trip" | "out");
    }
    return dailyStatus(roster, planned, logged, punched, members, leaveByRecord);
  }, [people.status, people.data, sched.status, sched.data, iCost.status, iCost.data, fCost.status, fCost.data, aCost.status, aCost.data, daily, date]);

  const title = (
    <div className="hr-card-head">
      <CalendarCheck2 size={16} />
      <h2>每日檢查</h2>
      <span className="muted small">選一天看誰沒填日誌／沒排／沒打卡</span>
    </div>
  );

  if (people.status === "forbidden")
    return (
      <section className="hr-card">
        {title}
        <p className="muted small">{people.error ?? "沒有查看人員名單的權限"}（每日檢查需要人事查看權限）。</p>
      </section>
    );
  if (!rows)
    return (
      <section className="hr-card">
        {title}
        <p className={`small ${people.status === "error" ? "bad-text" : "muted"}`}>人員名單{STATUS_TEXT[people.status]}{people.error ? `：${people.error}` : ""}</p>
      </section>
    );

  const shown = onlyMissing ? rows.filter((r) => r.missing) : rows;
  const missingCount = rows.filter((r) => r.missing).length;
  const leaveCount = rows.filter((r) => r.leave).length;
  const exportCsv = () =>
    downloadCsv(
      `每日檢查_${date}.csv`,
      simpleCsv(
        ["姓名", "組別", "預排", "日誌", "打卡", "請假/出差/外出"],
        shown.map((r) => [r.name, r.group, r.planned ? "有" : "無", r.logged ? "有" : "無", r.isMember ? (r.punched ? "有" : "無") : "不打卡", r.leave ? LEAVE_TEXT[r.leave] : ""]),
        [`每日檢查 ${date}`, onlyMissing ? "只列有缺漏的" : "全部在職", `缺漏 ${missingCount} 人、請假／出差／外出 ${leaveCount} 人`],
      ),
    );

  return (
    <section className="hr-card">
      {title}
      <div className="toolbar" style={{ gap: 12, flexWrap: "wrap" }}>
        <label className="tool tool-select">
          日期
          <select value={date} onChange={(e) => setDate(e.target.value)} aria-label="選擇日期">
            {days.map((d, i) => (
              <option key={d} value={d}>
                週{WD[i]} {d.slice(5).replace("-", "/")}
              </option>
            ))}
          </select>
        </label>
        <label className="switch" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          <span className="switch-ui" aria-hidden />
          只列有缺漏的
        </label>
        <div className="toolbar-right">
          <span className="count-text">
            缺漏 <strong>{missingCount}</strong>・請假出差外出 <strong>{leaveCount}</strong>・在職 {rows.length}
          </span>
          <button className="tool" onClick={exportCsv} disabled={!shown.length} title="匯出 CSV">
            <Download size={14} strokeWidth={1.75} /> 匯出
          </button>
        </div>
      </div>
      {dailyState === "fail" && !demo && <p className="warn-text small">打卡與請假資料讀取失敗或沒有人事查看權限：打卡欄與請假欄可能不準。</p>}
      <div className="cg-sheet">
        <table>
          <thead>
            <tr>
              <th>姓名</th>
              <th>組別</th>
              <th>預排</th>
              <th>日誌</th>
              <th>打卡</th>
              <th>請假/出差/外出</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.recordId} className={r.missing ? "" : ""}>
                <td className="att-name">{r.name}</td>
                <td>{r.group}</td>
                <td>{r.planned ? yes : no}</td>
                <td>{r.logged ? yes : no}</td>
                <td>{r.isMember ? (r.punched ? yes : no) : <span className="muted small">不打卡</span>}</td>
                <td>{r.leave ? <span className="att-tag">{LEAVE_TEXT[r.leave]}</span> : <span className="muted">—</span>}</td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={6} className="muted">
                  {onlyMissing ? "這天沒有缺漏（或資料未讀取）。" : "這天沒有在職人員資料。"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ul className="cg-notes">
        <li>
          日誌＝當天有內業／外業／行政成本單（外業算組長與實際出工人）；預排＝當天工作預排的「人員」（排除休假）；打卡＝考勤組成員當天有有效打卡（非考勤組的外業同事以日誌為準，顯示「不打卡」）。請假／出差／外出取自 Lark 假勤，當天請假／出差／外出者不列為缺漏。
        </li>
        <li>資料範圍＝所選週（上方週選擇器），只看 V3；需要人事查看權限才有打卡與請假欄。</li>
      </ul>
    </section>
  );
}
