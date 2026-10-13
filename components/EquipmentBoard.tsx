"use client";
// R07 儀器車輛管理詳情: 1) 儀器管理系統（清單） 2) 月租型儀器與車輛是否有檢查
// 3) TAF 與自校驗檢核紀錄. Fields are found by name so the board works once the
// 儀器管理系統 tables are located in lib/reports.ts.
import { CircleAlert, ClipboardCheck, Gauge, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/aggregate";
import { pickField } from "@/lib/controlGroup";
import type { CellValue, FieldMeta, TableData } from "@/lib/types";
import { formatDate, weekName } from "@/lib/week";
import { useShell } from "./AppShell";
import { STATUS_TEXT, useSource, type SourceState } from "./useSource";

type Rec = TableData["records"][number];
const DAY = 86400000;
const text = (v: CellValue) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v));
const firstDate = (fields: FieldMeta[], names: string[]) => pickField(fields, names, ["date"]) ?? undefined;
const val = (r: Rec, f?: FieldMeta) => (f ? text(r.fields[f.name]).trim() : "");
const num = (r: Rec, f?: FieldMeta) => (f && typeof r.fields[f.name] === "number" ? (r.fields[f.name] as number) : null);
const key = (s: string) => s.replace(/\s+/g, "").toLowerCase();

function masterFields(fields: FieldMeta[]) {
  return {
    name: pickField(fields, ["儀器名稱", "設備名稱", "名稱", "車輛名稱", "車牌", "車牌號碼"]) ?? fields.find((f) => f.primary),
    code: pickField(fields, ["儀器編號", "設備編號", "財產編號", "編號", "序號", "車牌號碼"]),
    kind: pickField(fields, ["種類", "類別", "儀器類別", "設備類別", "類型"]),
    status: pickField(fields, ["狀態", "使用狀態", "設備狀態"]),
    rent: pickField(fields, ["租賃方式", "租賃類型", "取得方式", "租用方式", "是否月租", "月租"]),
    owner: pickField(fields, ["保管組別", "保管人", "使用組別", "使用人", "負責人", "組別"]),
  };
}
type MF = ReturnType<typeof masterFields>;

const isVehicle = (r: Rec, mf: MF) => /車/.test(val(r, mf.kind)) || /車/.test(val(r, mf.name));
const isMonthly = (r: Rec, mf: MF) => {
  if (!mf.rent) return false;
  const v = r.fields[mf.rent.name];
  if (typeof v === "boolean") return v;
  return /月租/.test(text(v)) || (/^是$/.test(text(v).trim()) && /月租/.test(mf.rent.name));
};

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
  return (
    <p className={`small ${state.status === "error" ? "bad-text" : "muted"}`}>
      {label}：{STATUS_TEXT[state.status]}
      {state.error ? `：${state.error}` : ""}
      {state.status === "not-located" && "（需提供儀器管理系統的 Base 連結）"}
    </p>
  );
}

const Pill = ({ tone, children }: { tone?: "good" | "bad" | "warn"; children: React.ReactNode }) => <span className={`pill ${tone ? `pill-${tone}` : ""}`}>{children}</span>;

// 1. 儀器管理系統
function Inventory({ data, label }: { data: TableData; label: string }) {
  const mf = masterFields(data.fields);
  const [kind, setKind] = useState<string | null>(null);
  const kinds = [...new Set(data.records.map((r) => val(r, mf.kind)).filter(Boolean))];
  const rows = data.records.filter((r) => !kind || val(r, mf.kind) === kind);
  const bad = (r: Rec) => /送修|停用|損壞|故障|報廢/.test(val(r, mf.status));
  const count = (f: (r: Rec) => boolean) => data.records.filter(f).length;
  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">儀器／車輛</div>
          <div className="kpi-value">{data.records.length}</div>
          <div className="kpi-sub">取自「{label}」</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">可用</div>
          <div className="kpi-value">{mf.status ? count((r) => !bad(r)) : "—"}</div>
          <div className="kpi-sub">{mf.status ? `依「${mf.status.name}」` : "找不到狀態欄位"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">送修／停用</div>
          <div className={`kpi-value ${count(bad) ? "bad-text" : ""}`}>{mf.status ? count(bad) : "—"}</div>
          <div className="kpi-sub">狀態含送修、停用、損壞、故障</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">月租型</div>
          <div className="kpi-value">{mf.rent ? count((r) => isMonthly(r, mf)) : "—"}</div>
          <div className="kpi-sub">{mf.rent ? `依「${mf.rent.name}」` : "找不到租賃方式欄位"}</div>
        </div>
      </div>
      {kinds.length > 1 && (
        <div className="cg-picker" role="group" aria-label="種類">
          <button className={`cg-chip ${!kind ? "on" : ""}`} onClick={() => setKind(null)}>
            全部
          </button>
          {kinds.map((k) => (
            <button key={k} className={`cg-chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>
              {k}
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
              <th>種類</th>
              <th>狀態</th>
              <th>租賃方式</th>
              <th>保管</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].sort((a, b) => Number(bad(b)) - Number(bad(a))).map((r) => (
              <tr key={r.id}>
                <td className="strong">{val(r, mf.name) || "—"}</td>
                <td>{val(r, mf.code) || "—"}</td>
                <td>{val(r, mf.kind) || "—"}</td>
                <td>{mf.status ? <Pill tone={bad(r) ? "bad" : "good"}>{val(r, mf.status) || "—"}</Pill> : "—"}</td>
                <td>{val(r, mf.rent) || "—"}</td>
                <td>{val(r, mf.owner) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// 2. 月租型儀器與車輛是否有檢查（所選週）
function Inspections({ master, insp, start, end }: { master?: TableData; insp: TableData; start: number; end: number }) {
  const f = {
    target: pickField(insp.fields, ["檢查對象", "儀器", "設備", "儀器名稱", "設備名稱", "車輛", "車牌", "車牌號碼"]) ?? insp.fields.find((x) => x.primary),
    date: firstDate(insp.fields, ["檢查日期", "點檢日期", "日期"]) ?? insp.fields.find((x) => x.kind === "date"),
    result: pickField(insp.fields, ["檢查結果", "結果", "是否正常", "狀態"]),
    who: pickField(insp.fields, ["檢查人", "點檢人", "填表人", "填寫人"]),
    note: pickField(insp.fields, ["備註", "說明", "異常說明", "處理說明"]),
  };
  const mf = master ? masterFields(master.fields) : null;
  const targets = master && mf ? master.records.filter((r) => isMonthly(r, mf) || isVehicle(r, mf)) : [];
  const byTarget = new Map<string, Rec[]>();
  for (const r of insp.records) {
    const k = key(val(r, f.target));
    if (k) byTarget.set(k, [...(byTarget.get(k) ?? []), r]);
  }
  const abnormal = (r: Rec) => /異常|不合格|損壞|故障|否/.test(val(r, f.result));
  const rows = (targets.length ? targets.map((t) => ({ name: val(t, mf!.name), code: val(t, mf!.code), kind: isVehicle(t, mf!) ? "車輛" : "月租儀器" })) : [...byTarget.keys()].map((k) => ({ name: val(byTarget.get(k)![0], f.target), code: "", kind: "" }))).map((t) => {
    const recs = [...(byTarget.get(key(t.name)) ?? []), ...(t.code ? (byTarget.get(key(t.code)) ?? []) : [])];
    const dated = f.date ? recs.filter((r) => num(r, f.date) !== null && num(r, f.date)! < end).sort((a, b) => num(b, f.date)! - num(a, f.date)!) : [];
    const inWeek = dated.filter((r) => num(r, f.date)! >= start && num(r, f.date)! < end);
    const last = dated[0];
    return { ...t, inWeek, last, bad: inWeek.some(abnormal) };
  });
  const missing = rows.filter((r) => !r.inWeek.length).length;
  const bad = rows.filter((r) => r.bad).length;
  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">應檢查</div>
          <div className="kpi-value">{targets.length ? rows.length : "—"}</div>
          <div className="kpi-sub">{targets.length ? "月租型儀器＋車輛" : "儀器清單未接入，只列有紀錄的對象"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">本週已檢查</div>
          <div className="kpi-value">{rows.length - missing}</div>
          <div className="kpi-sub">依「{f.date?.name ?? "—"}」</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">本週未檢查</div>
          <div className={`kpi-value ${missing ? "bad-text" : ""}`}>{targets.length ? missing : "—"}</div>
          <div className="kpi-sub">需有儀器清單才能判斷誰漏檢</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">檢查異常</div>
          <div className={`kpi-value ${bad ? "bad-text" : ""}`}>{f.result ? bad : "—"}</div>
          <div className="kpi-sub">{f.result ? `「${f.result.name}」為異常／不合格` : "找不到檢查結果欄位"}</div>
        </div>
      </div>
      <div className="cg-detail">
        <table>
          <thead>
            <tr>
              <th>對象</th>
              <th>類別</th>
              <th>本週檢查</th>
              <th>最近一次</th>
              <th>檢查人</th>
              <th>結果</th>
              <th>備註</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .sort((a, b) => Number(!!a.inWeek.length) - Number(!!b.inWeek.length) || Number(b.bad) - Number(a.bad))
              .map((r) => {
                const l = r.inWeek[0] ?? r.last;
                return (
                  <tr key={r.name + r.code} className={!r.inWeek.length ? "cg-err" : undefined}>
                    <td className="strong">
                      {r.name}
                      {r.code && <span className="muted small"> {r.code}</span>}
                    </td>
                    <td>{r.kind || "—"}</td>
                    <td>{r.inWeek.length ? <Pill tone={r.bad ? "warn" : "good"}>已檢查 {r.inWeek.length} 次</Pill> : <Pill tone="bad">未檢查</Pill>}</td>
                    <td>{l && f.date ? formatDate(num(l, f.date)!) : "—"}</td>
                    <td>{l ? val(l, f.who) || "—" : "—"}</td>
                    <td>{l && f.result ? <Pill tone={abnormal(l) ? "bad" : "good"}>{val(l, f.result) || "—"}</Pill> : "—"}</td>
                    <td className="cg-notes-cell">{l ? val(l, f.note) || "—" : "—"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// 3. TAF 與自校驗
function Calibration({ cal }: { cal: TableData }) {
  const f = {
    target: pickField(cal.fields, ["儀器", "儀器名稱", "設備", "設備名稱", "儀器編號"]) ?? cal.fields.find((x) => x.primary),
    type: pickField(cal.fields, ["校驗類型", "校正類型", "類型", "檢核類型"]),
    date: firstDate(cal.fields, ["校驗日期", "校正日期", "檢核日期", "日期"]) ?? cal.fields.find((x) => x.kind === "date"),
    due: firstDate(cal.fields, ["有效期限", "到期日", "下次校正日", "校正到期日", "下次校驗日"]),
    result: pickField(cal.fields, ["結果", "校驗結果", "校正結果", "判定"]),
    cert: pickField(cal.fields, ["證書編號", "報告編號", "TAF證書編號"]),
  };
  const today = Date.now();
  const kindOf = (r: Rec) => {
    const t = `${val(r, f.type)} ${f.type ? "" : val(r, f.cert)}`;
    return /TAF/i.test(t) ? "TAF" : /自校|自我|內部|自主/.test(t) ? "自校" : "其他";
  };
  const items = new Map<string, { name: string; taf?: Rec; self?: Rec }>();
  const later = (a: Rec | undefined, b: Rec) => (!a || (num(b, f.date) ?? 0) > (num(a, f.date) ?? 0) ? b : a);
  for (const r of cal.records) {
    const name = val(r, f.target) || "（未填儀器）";
    const it = items.get(name) ?? { name };
    const k = kindOf(r);
    if (k === "TAF") it.taf = later(it.taf, r);
    else if (k === "自校") it.self = later(it.self, r);
    items.set(name, it);
  }
  const tafState = (r?: Rec) => {
    const due = r ? num(r, f.due) : null;
    if (!r) return { tone: "bad" as const, label: "無紀錄", days: null };
    if (due === null) return { tone: undefined, label: "無到期日", days: null };
    const days = Math.ceil((due - today) / DAY);
    return days < 0 ? { tone: "bad" as const, label: `逾期 ${-days} 天`, days } : days <= 30 ? { tone: "warn" as const, label: days === 0 ? "今天到期" : `${days} 天內到期`, days } : { tone: "good" as const, label: "有效", days };
  };
  const rows = [...items.values()].map((it) => ({ ...it, st: tafState(it.taf) }));
  const overdue = rows.filter((r) => r.st.days !== null && r.st.days < 0).length;
  const soon = rows.filter((r) => r.st.days !== null && r.st.days >= 0 && r.st.days <= 30).length;
  const failed = cal.records.filter((r) => /不合格|不通過|異常/.test(val(r, f.result))).length;
  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">儀器</div>
          <div className="kpi-value">{rows.length}</div>
          <div className="kpi-sub">有校驗紀錄的儀器</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">TAF 逾期</div>
          <div className={`kpi-value ${overdue ? "bad-text" : ""}`}>{f.due ? overdue : "—"}</div>
          <div className="kpi-sub">{f.due ? `依「${f.due.name}」` : "找不到有效期限欄位"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">30 天內到期</div>
          <div className="kpi-value">{f.due ? soon : "—"}</div>
          <div className="kpi-sub">需安排送校</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">檢核不合格</div>
          <div className={`kpi-value ${failed ? "bad-text" : ""}`}>{f.result ? failed : "—"}</div>
          <div className="kpi-sub">TAF 與自校驗合計</div>
        </div>
      </div>
      <div className="cg-detail">
        <table>
          <thead>
            <tr>
              <th>儀器</th>
              <th>TAF 校正日</th>
              <th>TAF 有效期限</th>
              <th>TAF 狀態</th>
              <th>證書編號</th>
              <th>最近自校驗</th>
              <th>自校結果</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .sort((a, b) => (a.st.days ?? 1e9) - (b.st.days ?? 1e9))
              .map((r) => {
                const sd = r.self ? num(r.self, f.date) : null;
                return (
                  <tr key={r.name} className={r.st.tone === "bad" ? "cg-err" : undefined}>
                    <td className="strong">{r.name}</td>
                    <td>{r.taf && num(r.taf, f.date) ? formatDate(num(r.taf, f.date)!) : "—"}</td>
                    <td>{r.taf && num(r.taf, f.due) ? formatDate(num(r.taf, f.due)!) : "—"}</td>
                    <td>
                      <Pill tone={r.st.tone}>{r.st.label}</Pill>
                    </td>
                    <td>{r.taf ? val(r.taf, f.cert) || "—" : "—"}</td>
                    <td>{sd ? `${formatDate(sd)}（${formatNumber(Math.floor((today - sd) / DAY))} 天前）` : <span className="muted">無紀錄</span>}</td>
                    <td>{r.self && f.result ? <Pill tone={/不合格|不通過|異常/.test(val(r.self, f.result)) ? "bad" : "good"}>{val(r.self, f.result) || "—"}</Pill> : "—"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function EquipmentBoard() {
  const { week, demo } = useShell();
  const system = useSource("equipment-system");
  const fallback = useSource("v3-equipment", { enabled: system.status !== "ok" && system.status !== "loading" });
  const insp = useSource("equipment-inspection");
  const cal = useSource("equipment-calibration");
  const master = system.status === "ok" ? system.data : fallback.status === "ok" ? fallback.data : undefined;
  const masterLabel = system.status === "ok" ? "儀器管理系統" : "V3 儀器費率（暫代，非完整台帳）";
  const notLocated = useMemo(() => [system, insp, cal].some((s) => s.status === "not-located"), [system, insp, cal]);

  return (
    <div className="hr">
      {notLocated && !demo && (
        <ul className="cg-notes">
          <li>
            <CircleAlert size={14} /> 儀器管理系統的資料表尚未接入。請提供 Base 連結，或打開右下角「示範資料」先看畫面。
          </li>
        </ul>
      )}

      <Section icon={<Wrench size={16} />} title="儀器管理系統" sub={master ? `取自「${masterLabel}」` : undefined}>
        {master ? <Inventory data={master} label={masterLabel} /> : <SourceNote state={system} label="儀器清單" />}
      </Section>

      <Section icon={<ClipboardCheck size={16} />} title="月租型儀器與車輛檢查" sub={`${weekName(week.offset)} ${week.label}`}>
        {insp.status === "ok" && insp.data ? (
          <Inspections master={master} insp={insp.data} start={week.start} end={week.end} />
        ) : (
          <SourceNote state={insp} label="檢查紀錄" />
        )}
        <p className="muted small">以所選週判斷有沒有檢查；檢查頻率（每週／每月）待確認。對象＝儀器清單中租賃方式為月租的儀器，加上所有車輛。</p>
      </Section>

      <Section icon={<Gauge size={16} />} title="TAF 與自校驗檢核紀錄">
        {cal.status === "ok" && cal.data ? <Calibration cal={cal.data} /> : <SourceNote state={cal} label="校驗紀錄" />}
        <p className="muted small">TAF 狀態依最近一次 TAF 紀錄的有效期限：逾期＝紅、30 天內到期＝黃。自校驗顯示最近一次日期與結果，週期待確認。</p>
      </Section>
    </div>
  );
}
