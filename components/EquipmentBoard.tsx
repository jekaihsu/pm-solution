"use client";
// R07 儀器車輛管理詳情（業主同事 2026-10-13 回覆後的口徑）：
// 儀器清單＝「- 儀器總表」（編號＝ID），可借用／異常／保養中看日租＋月租兩張的「狀態」；
// 借出未歸還＝儀器借單明細 vs 已通過的歸還單；維護履歷（儀器、車輛）與 TAF 只列紀錄；車輛保養／保險提醒。
// 「資料表」（來源不明）不在這頁顯示，只留在「查看原始資料表」。純函式與口徑在 lib/equipment.ts。
import { CalendarClock, Car, CircleAlert, Gauge, PackageX, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/aggregate";
import { ALERT_DAYS, bookingStats, CONFLICT, inventoryStatus, outstandingLoans, recordLog, STATUS_KEYS, UNRESOLVED, vehicleReminders, type Due } from "@/lib/equipment";
import type { TableData } from "@/lib/types";
import { formatDate, weekName } from "@/lib/week";
import { useShell } from "./AppShell";
import { STATUS_TEXT, useSource, type SourceState } from "./useSource";

const ROLE_HINT = "需要 PM週報唯讀角色開放此表";
// 沒開放讀取時 Lark 回 1254302（進階權限）或找不到資料表；這兩類都是「還沒被開放」，不是壞掉。
const needsRole = (s: SourceState) => s.status === "error" && /1254302|RolePermNotAllow|進階權限|91402|1254041|找不到|forbidden/i.test(s.error ?? "");

function Section({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="hr-card">
      <div className="hr-card-head">
        {icon}
        <h2>{title}</h2>
        {sub && <span className="muted small">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

function SourceNote({ state, label }: { state: SourceState; label: string }) {
  if (state.status === "loading")
    return (
      <p className="small muted">
        {label}：{STATUS_TEXT.loading}
      </p>
    );
  return (
    <p className={`small ${state.status === "error" ? "bad-text" : "muted"}`}>
      {label}：{needsRole(state) ? ROLE_HINT : STATUS_TEXT[state.status]}
      {state.error && !needsRole(state) ? `：${state.error}` : ""}
    </p>
  );
}

const Pill = ({ tone, children }: { tone?: "good" | "bad" | "warn"; children: React.ReactNode }) => <span className={`pill ${tone ? `pill-${tone}` : ""}`}>{children}</span>;
const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : v);

// 1. 儀器清單：總表為主，狀態來自日租＋月租
function Inventory({ master, daily, monthly }: { master: TableData; daily?: TableData; monthly?: TableData }) {
  const inv = useMemo(() => inventoryStatus(master.records, daily?.records ?? [], monthly?.records ?? []), [master, daily, monthly]);
  const haveStatus = !!daily && !!monthly;
  const [filter, setFilter] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const bad = (st: string | null) => st === "異常" || st === "保養中" || st === CONFLICT;
  const rows = inv.rows.filter((r) => !filter || (filter === "無狀態" ? r.status === null : r.status === filter));
  const sorted = [...rows].sort((a, b) => Number(bad(b.status)) - Number(bad(a.status)));
  const shown = all ? sorted : sorted.slice(0, 40);
  const tone = (st: string | null) => (st === "可借用" ? "good" : st === null ? undefined : "bad");
  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">儀器</div>
          <div className="kpi-value">{inv.active}</div>
          <div className="kpi-sub">儀器總表{inv.archived ? `（另有 ${inv.archived} 筆系統封存不列）` : ""}</div>
        </div>
        {STATUS_KEYS.map((k) => (
          <div className="kpi" key={k}>
            <div className="kpi-label">{k === "可借用" ? "可用（可借用）" : k}</div>
            <div className={`kpi-value ${k !== "可借用" && haveStatus && inv.counts[k] ? "bad-text" : ""}`}>{haveStatus ? inv.counts[k] : "—"}</div>
            <div className="kpi-sub">{haveStatus ? "日租＋月租表的「狀態」" : ROLE_HINT}</div>
          </div>
        ))}
      </div>
      <p className="muted small">
        總表狀態「已借出」{inv.masterBorrowed} 件（總表的借用狀態，和上面的可用／異常／保養中是不同欄位，不相加）
        {haveStatus ? `；總表有、但日租與月租表都沒有狀態：${inv.noStatusRow} 件` : ""}。
      </p>
      {haveStatus && (
        <div className="cg-picker" role="group" aria-label="狀態">
          {[null, ...STATUS_KEYS, "無狀態"].map((k) => (
            <button key={k ?? "all"} className={`cg-chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>
              {k ?? "全部"}
            </button>
          ))}
        </div>
      )}
      <div className="cg-detail">
        <table>
          <thead>
            <tr>
              <th>名稱</th>
              <th>編號</th>
              <th>租賃</th>
              <th>狀態</th>
              <th>保管組</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id || r.name}>
                <td className="strong">{r.name}</td>
                <td>{dash(r.id)}</td>
                <td>{dash(r.rentType)}</td>
                <td>{r.status === null ? <span className="muted">{haveStatus ? "無資料" : "—"}</span> : <Pill tone={tone(r.status)}>{r.status}</Pill>}</td>
                <td>{dash(r.ownerGroup)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && (
        <button className="cg-chip" onClick={() => setAll(true)}>
          顯示全部 {rows.length} 筆
        </button>
      )}
      {haveStatus && (
        <p className="muted small">
          日租表 {inv.dailyReal} 件、月租表 {inv.monthlyReal} 件（兩表互斥：同編號同時出現 {inv.overlap} 件），以「ID」對儀器總表的編號
          {inv.unmatched.daily + inv.unmatched.monthly ? `；日租 ${inv.unmatched.daily}、月租 ${inv.unmatched.monthly} 件的 ID 在總表找不到，不計入上面數字` : "，全部對得上"}
          。日租／月租表另有空白占位列 {inv.dailyBlank + inv.monthlyBlank} 列（無 ID、無狀態），不算。
          {Object.keys(inv.otherStatus).length
            ? `其他狀態：${Object.entries(inv.otherStatus)
                .map(([k, n]) => `${k} ${n}`)
                .join("、")}。`
            : ""}
        </p>
      )}
    </>
  );
}

// 2. 借出未歸還：借單明細 vs 已通過的歸還單
function Outstanding({ loans, returns }: { loans: TableData; returns: TableData }) {
  const o = useMemo(() => outstandingLoans(loans.records, returns.records, Date.now()), [loans, returns]);
  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">借出未歸還</div>
          <div className={`kpi-value ${o.rows.length ? "bad-text" : ""}`}>{o.rows.length}</div>
          <div className="kpi-sub">借單明細沒有對到已通過歸還單的件數</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">已對到歸還單</div>
          <div className="kpi-value">{o.matched}</div>
          <div className="kpi-sub">借單明細共 {o.loanTotal} 列</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">沒有識別欄的列</div>
          <div className="kpi-value">{o.noKey}</div>
          <div className="kpi-sub">空白列或識別欄未填，不判斷</div>
        </div>
      </div>
      {o.rows.length > 0 ? (
        <div className="cg-detail">
          <table>
            <thead>
              <tr>
                <th>借出儀器／車輛</th>
                <th>借出日期</th>
                <th>借用組別</th>
                <th>天數</th>
              </tr>
            </thead>
            <tbody>
              {o.rows.map((r, i) => (
                <tr key={`${r.item}-${i}`} className={r.days !== null && r.days >= 30 ? "cg-err" : undefined}>
                  <td className="strong">{r.item}</td>
                  <td>{r.lentAt === null ? "—" : formatDate(r.lentAt)}</td>
                  <td>{dash(r.group)}</td>
                  <td>{r.days === null ? "無資料" : `${r.days} 天`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">目前沒有借出未歸還。</p>
      )}
      <p className="muted small">
        對應鍵：借單明細的識別欄（依序取「借出儀器/車輛」「日租ID」「月租ID」「車牌」第一個有值的）對歸還單的「借出儀器/車輛」。兩邊格式不同：歸還單的值前面多了申請人姓名與設備類別，
        所以改用「結尾相同」比對（去空白，且結尾前一字不是英數字）。只算審批狀態「已通过」的歸還單，撤回、拒絕、審批中都不算；同一儀器借多次時，只要有一張已通過歸還單就視為已歸還。
        天數＝借出日期到今天，沒借出日期顯示「無資料」。不使用借單明細的「是否已歸還」勾選，也不列申請人。
      </p>
    </>
  );
}

// 車輛：保養到期、保險到期（30 天內黃、已過紅）
const dueText = (d: Due) => (d.at === null ? "—" : formatDate(d.at));
const duePill = (d: Due) =>
  d.state === "none" ? (
    <span className="muted">無資料</span>
  ) : d.state === "overdue" ? (
    <Pill tone="bad">已過 {-d.days!} 天</Pill>
  ) : d.state === "soon" ? (
    <Pill tone="warn">{d.days === 0 ? "今天到期" : `${d.days} 天內`}</Pill>
  ) : (
    <Pill tone="good">未到期</Pill>
  );

function Vehicles({ data }: { data: TableData }) {
  const v = useMemo(() => vehicleReminders(data.records, Date.now()), [data]);
  const rank = (d: Due) => (d.state === "overdue" ? 0 : d.state === "soon" ? 1 : d.state === "ok" ? 2 : 3);
  const rows = [...v.rows].sort((a, b) => Math.min(rank(a.maintenance), rank(a.insurance)) - Math.min(rank(b.maintenance), rank(b.insurance)));
  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">車輛</div>
          <div className="kpi-value">{v.rows.length}</div>
          <div className="kpi-sub">已封存的不列</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">保養到期提醒</div>
          <div className={`kpi-value ${v.maintenanceAlerts ? "bad-text" : ""}`}>{v.maintenanceAlerts}</div>
          <div className="kpi-sub">已過或 {ALERT_DAYS} 天內（next_maintenance）</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">保險到期提醒</div>
          <div className={`kpi-value ${v.insuranceAlerts ? "bad-text" : ""}`}>{v.insuranceAlerts}</div>
          <div className="kpi-sub">已過或 {ALERT_DAYS} 天內（insurance_date）</div>
        </div>
      </div>
      <div className="cg-detail">
        <table>
          <thead>
            <tr>
              <th>車牌</th>
              <th>狀態</th>
              <th>里程</th>
              <th>下次保養</th>
              <th>保養提醒</th>
              <th>保險到期</th>
              <th>保險提醒</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.plate} className={r.maintenance.state === "overdue" || r.insurance.state === "overdue" ? "cg-err" : undefined}>
                <td className="strong">{r.plate}</td>
                <td>{r.status || "—"}</td>
                <td>{r.mileage === null ? "—" : formatNumber(r.mileage)}</td>
                <td>{dueText(r.maintenance)}</td>
                <td>{duePill(r.maintenance)}</td>
                <td>{dueText(r.insurance)}</td>
                <td>{duePill(r.insurance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// 預約與歸還（所選週）
function Bookings({ book, ret, start, end }: { book: TableData; ret: TableData; start: number; end: number }) {
  const b = useMemo(() => bookingStats(book.records, ret.records, start, end), [book, ret, start, end]);
  const cats = Object.entries(b.lentByCategory);
  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">本週借出</div>
          <div className="kpi-value">{b.lent}</div>
          <div className="kpi-sub">{cats.length ? cats.map(([k, n]) => `${k} ${n}`).join("、") : "預約單已通過、借出日期落在所選週"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">本週歸還</div>
          <div className="kpi-value">{b.returned}</div>
          <div className="kpi-sub">歸還單已通過、歸還日期落在所選週</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">已撤回</div>
          <div className="kpi-value">{b.lentWithdrawn + b.returnedWithdrawn}</div>
          <div className="kpi-sub">
            預約 {b.lentWithdrawn}、歸還 {b.returnedWithdrawn}（全部期間，不計入借出歸還）
          </div>
        </div>
      </div>
      <p className="muted small">
        全部期間共 {b.bookingTotal} 張預約單、{b.returnTotal} 張歸還單
        {b.lentNoDate + b.returnedNoDate ? `；已通過但沒填日期：預約 ${b.lentNoDate}、歸還 ${b.returnedNoDate}` : ""}。
      </p>
    </>
  );
}

// 維護履歷（儀器、車輛）與 TAF：只列紀錄，不算「是否有檢查」的合格率
function RecordLog({ data, target, date, cost, due, unit }: { data: TableData; target: string; date: string; cost?: string; due?: string; unit: string }) {
  const l = useMemo(() => recordLog(data.records, { target, date, cost, due }, Date.now()), [data, target, date, cost, due]);
  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">紀錄筆數</div>
          <div className="kpi-value">{l.total - l.empty}</div>
          <div className="kpi-sub">
            表內共 {l.total} 列{l.empty ? `，另有 ${l.empty} 列空白` : ""}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">有日期的</div>
          <div className="kpi-value">{l.dated}</div>
          <div className="kpi-sub">依「{date}」</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">最近一次</div>
          <div className="kpi-value">{l.latestAt === null ? "無資料" : formatDate(l.latestAt)}</div>
          <div className="kpi-sub">所有紀錄中最新的日期</div>
        </div>
      </div>
      {l.rows.length > 0 && (
        <div className="cg-detail">
          <table>
            <thead>
              <tr>
                <th>{unit}</th>
                <th>筆數</th>
                <th>最近一次</th>
                <th>距今</th>
                {cost && <th>費用</th>}
                {due && <th>有效期限</th>}
              </tr>
            </thead>
            <tbody>
              {l.rows.map((r) => (
                <tr key={r.key}>
                  <td className="strong">{r.unresolved ? <span className="muted">{UNRESOLVED}</span> : r.target}</td>
                  <td className="num">{r.count}</td>
                  <td>{r.lastAt === null ? <span className="muted">無資料</span> : formatDate(r.lastAt)}</td>
                  <td>{r.daysSince === null ? "—" : `${formatNumber(r.daysSince)} 天前`}</td>
                  {cost && <td className="num">{r.cost === null ? "—" : formatNumber(r.cost)}</td>}
                  {due && (
                    <td>
                      {dueText(r.due)} {duePill(r.due)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {l.unresolved > 0 && <p className="muted small">有 {l.unresolved} 筆的關聯名稱讀不到（只讀到記錄編號）：需要連同關聯的「選項」表一起開放給 PM週報唯讀角色。</p>}
    </>
  );
}

export default function EquipmentBoard() {
  const { week } = useShell();
  const system = useSource("equipment-system");
  const daily = useSource("equipment-daily");
  const monthly = useSource("equipment-monthly");
  const vehicles = useSource("equipment-vehicles");
  const bookings = useSource("equipment-bookings");
  const returns = useSource("equipment-returns");
  const loans = useSource("equipment-loans");
  const maint = useSource("equipment-maintenance");
  const taf = useSource("equipment-taf");
  const vmaint = useSource("equipment-vehicle-maintenance");
  const blocked = useMemo(
    () =>
      (
        [
          [daily, "日租儀器"],
          [monthly, "月租儀器"],
          [loans, "儀器借單明細"],
          [maint, "儀器 維護履歷"],
          [taf, "儀器 TAF"],
          [vmaint, "車輛 維護履歷"],
        ] as [SourceState, string][]
      )
        .filter(([s]) => needsRole(s))
        .map(([, label]) => label),
    [daily, monthly, loans, maint, taf, vmaint],
  );
  const ok = (s: SourceState) => s.status === "ok" && !!s.data;

  return (
    <div className="hr">
      {blocked.length > 0 && (
        <ul className="cg-notes">
          <li>
            <CircleAlert size={14} /> 目前讀不到：{blocked.join("、")}。{ROLE_HINT}（業主在 Lark 建好「PM週報唯讀」角色後即自動出現）。
          </li>
        </ul>
      )}

      <Section icon={<Wrench size={16} />} title="儀器清單" sub="以「- 儀器總表」為準，狀態看日租＋月租">
        {ok(system) ? <Inventory master={system.data!} daily={ok(daily) ? daily.data : undefined} monthly={ok(monthly) ? monthly.data : undefined} /> : <SourceNote state={system} label="儀器總表" />}
        {!ok(daily) && <SourceNote state={daily} label="日租儀器（狀態）" />}
        {!ok(monthly) && <SourceNote state={monthly} label="月租儀器（狀態）" />}
      </Section>

      <Section icon={<PackageX size={16} />} title="借出未歸還" sub="儀器借單明細 vs 歸還單">
        {ok(loans) && ok(returns) ? (
          <Outstanding loans={loans.data!} returns={returns.data!} />
        ) : (
          <>
            <SourceNote state={loans} label="儀器借單明細" />
            <SourceNote state={returns} label="歸還單" />
          </>
        )}
      </Section>

      <Section icon={<CalendarClock size={16} />} title="預約與歸還" sub={`${weekName(week.offset)} ${week.label}`}>
        {ok(bookings) && ok(returns) ? (
          <Bookings book={bookings.data!} ret={returns.data!} start={week.start} end={week.end} />
        ) : (
          <>
            <SourceNote state={bookings} label="預約申請單" />
            <SourceNote state={returns} label="歸還單" />
          </>
        )}
        <p className="muted small">只算審批狀態「已通过」；借出依借出日期、歸還依歸還日期。</p>
      </Section>

      <Section icon={<Wrench size={16} />} title="維護履歷（儀器）" sub="儀器管理系統：儀器 維護履歷">
        {ok(maint) ? <RecordLog data={maint.data!} target="設備類別" date="維修/保養日期" cost="費用" unit="儀器" /> : <SourceNote state={maint} label="儀器 維護履歷" />}
        <p className="muted small">與儀器的關聯是人工選的「關聯名稱」，沒選的列歸不到儀器。檢查頻率（每週／每月）業主未定義，所以不算「是否有檢查」，只列紀錄，待定義。</p>
      </Section>

      <Section icon={<Gauge size={16} />} title="TAF 紀錄" sub="儀器管理系統：儀器 TAF">
        {ok(taf) ? <RecordLog data={taf.data!} target="設備類別" date="TAF日期" unit="儀器" /> : <SourceNote state={taf} label="儀器 TAF" />}
        <p className="muted small">「儀器 TAF」只有 TAF日期、TAF文件、備註與關聯儀器，沒有有效期限欄，所以不判斷到期（待業主定義有效期間）；沒填日期的顯示「無資料」。</p>
      </Section>

      <Section icon={<Car size={16} />} title="車輛（保養與保險）" sub="取自「儀器管理系統：車輛」，與 V4 車輛主檔分開">
        {ok(vehicles) ? <Vehicles data={vehicles.data!} /> : <SourceNote state={vehicles} label="車輛" />}
        <p className="muted small">下次保養＝next_maintenance、保險到期＝insurance_date；已過＝紅、{ALERT_DAYS} 天內＝黃，只做提醒，不推算里程保養。</p>
      </Section>

      <Section icon={<Car size={16} />} title="維護履歷（車輛）" sub="儀器管理系統：車輛 維護履歷">
        {ok(vmaint) ? <RecordLog data={vmaint.data!} target="車牌" date="維修/保養日期" cost="費用" unit="車牌" /> : <SourceNote state={vmaint} label="車輛 維護履歷" />}
        <p className="muted small">與車輛的關聯是人工選的「車牌」；只列紀錄，不判斷是否按時保養。</p>
      </Section>
    </div>
  );
}
