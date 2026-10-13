// R11 行政數據 — 一列一個人（行政成本單的「填表人」）的週彙總。口徑（業主 2026-10-13）：
//  - 工作單沒有日期與人員，都從「所屬成本單」帶入；人員一律用 link 的 record_id 比對。
//  - 預排取 業別＝行政；比對主鍵＝人員 record_id ＋ 日期，組別不參與。
//  - 預排點數：有填就用（按起訖天數平均分攤，一人一份）；沒填則每人每天 1 點，
//    同人同日多條只算一次，且該人該日已有填點數的條就不再補。
//  - 與預排差異只算「有預排」的人；主表列全部人（沒預排顯示「未排」），合計含全部人，差異只算有預排的人。
//  - 失誤率先不算（行政沒有檢核欄），待定義。
import type { CellValue, FieldMeta, TableData } from "./types";

type Rec = TableData["records"][number];
const DAY = 86400000;
const TZ = 8 * 3600000; // Asia/Taipei
export const taipeiDay = (t: number) => Math.floor((t + TZ) / DAY);

// 工作預排：日期一律用 field id，永不照欄名（欄名會被 UI 改）。
export const ADMIN_SCHEDULE_FID = {
  start: "fldMXOggGP", // 真起日
  end: "fldjWv1xST", // 真訖日
  person: "fld7KNCsVe",
  trade: "fldrENe4H6",
  points: "fld5lTSN1r",
} as const;
export const ADMIN_TRADE = "行政";

const text = (v: CellValue | undefined): string => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v));
const pick = (fields: FieldMeta[], names: string[]) => names.map((n) => fields.find((f) => f.name === n)).find(Boolean);
const lit = (v: CellValue | undefined) => v === true || (typeof v === "number" && v !== 0) || (Array.isArray(v) && v.length > 0) || (typeof v === "string" && v.trim() !== "" && !/^(否|false|0|無)$/i.test(v.trim()));

export interface AdminOrder {
  id: string;
  date: number | null;
  orderNo: string;
  item: string;
  qty: number | null;
  points: number | null;
  anomalies: string[];
  note: string;
}

export interface AdminRow {
  personId: string;
  name: string;
  orders: AdminOrder[];
  days: number; // 出勤天數＝所選週內該人成本單的不重複日期
  dates: number[]; // Taipei day numbers
  revenue: number;
  revenueBlank: number;
  anomalyCount: number;
  overtime: number;
  plan?: { points: number; days: number; defaulted: number };
}

export interface AdminBoard {
  rows: AdminRow[];
  totals: { orders: number; days: number; revenue: number; points: number; diff: number; plannedN: number; anomalies: number; overtime: number };
  stats: { orders: number; costSheets: number; people: number; revenue: number; planPersonDays: number; planPeople: number; overlapDays: number; unmatchedOrders: number };
  notes: string[];
}

// person identity: record_id when the link ids are there, else the name as a fallback
// (demo data / a table read without links=1).
function makePeople() {
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();
  const learn = (id: string, name: string) => {
    if (name && id) {
      if (!idByName.has(name)) idByName.set(name, id);
      if (!nameById.has(id)) nameById.set(id, name);
    }
  };
  const key = (id: string | undefined, name: string) => id || idByName.get(name) || `n:${name}`;
  return { learn, key, nameOf: (k: string, fallback: string) => nameById.get(k) || fallback };
}

// 人員欄（可多人）→ [{id, name}]；links 與名稱欄位順序一致。
function peopleOf(r: Rec, field: string): { id?: string; name: string }[] {
  const v = r.fields[field];
  const names = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
  const ids = r.links?.[field] ?? [];
  const n = Math.max(names.length, ids.length);
  return Array.from({ length: n }, (_, i) => ({ id: ids[i], name: names[i] ?? "" }));
}

export function buildAdminBoard(p: { work: TableData; cost?: TableData; sched?: TableData; start: number; end: number }): AdminBoard {
  const { work, cost, sched, start, end } = p;
  const notes: string[] = [];
  const winFirst = taipeiDay(start);
  const winLast = taipeiDay(end - 1);
  const people = makePeople();

  // ---- 成本單：人與日期 ----
  const cFields = cost?.fields ?? [];
  const cPrimary = cFields.find((f) => f.primary) ?? cFields[0];
  const cDate = pick(cFields, ["工作日期"]);
  const cWho = pick(cFields, ["填表人"]);
  const cOrders = pick(cFields, ["工作單列"]);
  const cOt = pick(cFields, ["加班時數"]);
  const rows = new Map<string, AdminRow>();
  const rowFor = (k: string, name: string) => {
    let r = rows.get(k);
    if (!r) rows.set(k, (r = { personId: k, name, orders: [], days: 0, dates: [], revenue: 0, revenueBlank: 0, anomalyCount: 0, overtime: 0 }));
    return r;
  };
  const costInfo = new Map<string, { person: string; date: number; inWeek: boolean }>(); // 全部成本單：工作單表含各週，要先對得到才能判斷在不在本週
  const byOrderNo = new Map<string, string>();
  const byTitle = new Map<string, string | null>();
  let costSheets = 0;
  if (cost && cDate && cWho) {
    for (const c of cost.records) for (const w of peopleOf(c, cWho.name)) people.learn(w.id ?? "", w.name);
    for (const c of cost.records) {
      const t = c.fields[cDate.name];
      if (typeof t !== "number") continue;
      const day = taipeiDay(t);
      const who = peopleOf(c, cWho.name)[0];
      const k = who ? people.key(who.id, who.name) : "n:（未填填表人）";
      const inWeek = day >= winFirst && day <= winLast;
      costInfo.set(c.id, { person: k, date: t, inWeek });
      if (inWeek) {
        const row = rowFor(k, people.nameOf(k, who?.name || "（未填填表人）"));
        costSheets++;
        if (!row.dates.includes(day)) row.dates.push(day);
        if (cOt && typeof c.fields[cOt.name] === "number") row.overtime += c.fields[cOt.name] as number;
      }
      const title = cPrimary ? text(c.fields[cPrimary.name]) : "";
      if (title) byTitle.set(title, byTitle.has(title) ? null : c.id);
      const list = cOrders ? c.fields[cOrders.name] : null;
      if (Array.isArray(list)) for (const no of list) byOrderNo.set(String(no), c.id);
    }
  } else notes.push("行政成本單讀不到或缺「工作日期／填表人」，工作單無法帶入人與日期");

  // ---- 工作單 → 成本單（link id 最準；其次成本單「工作單列」；標題只在唯一時備援）----
  const wf = {
    link: pick(work.fields, ["所屬成本單"]),
    no: pick(work.fields, ["工作單號"]) ?? work.fields.find((f) => f.primary),
    item: pick(work.fields, ["行政工項"]),
    qty: pick(work.fields, ["件數"]),
    pts: pick(work.fields, ["最終營業額點數", "營業額點數"]),
    flags: work.fields.filter((f) => f.name.startsWith("⚠")),
    notes: work.fields.filter((f) => /^(備註|自訂說明)$/.test(f.name)),
  };
  let unmatchedOrders = 0;
  for (const o of work.records) {
    const no = wf.no ? text(o.fields[wf.no.name]) : "";
    let cid: string | undefined;
    for (const id of (wf.link && o.links?.[wf.link.name]) || []) if (costInfo.has(id)) cid = id;
    if (!cid && no) cid = byOrderNo.get(no);
    if (!cid && wf.link) {
      const ref = o.fields[wf.link.name];
      const titles = Array.isArray(ref) ? ref : ref ? [String(ref)] : [];
      cid = titles.map((t) => byTitle.get(String(t))).find(Boolean) ?? undefined;
    }
    const info = cid ? costInfo.get(cid) : undefined;
    if (!info) {
      unmatchedOrders++;
      continue;
    }
    if (!info.inWeek) continue; // 對得到，但不是本週的單
    const row = rows.get(info.person)!;
    const pts = wf.pts && typeof o.fields[wf.pts.name] === "number" ? (o.fields[wf.pts.name] as number) : null;
    const an = wf.flags.filter((f) => lit(o.fields[f.name])).map((f) => f.name.replace(/^⚠/, ""));
    row.orders.push({
      id: o.id,
      date: info.date,
      orderNo: no,
      item: wf.item ? text(o.fields[wf.item.name]) : "",
      qty: wf.qty && typeof o.fields[wf.qty.name] === "number" ? (o.fields[wf.qty.name] as number) : null,
      points: pts,
      anomalies: an,
      note: wf.notes.map((f) => text(o.fields[f.name]).trim()).filter(Boolean).join("；"),
    });
    if (pts === null) row.revenueBlank++;
    else row.revenue += pts;
    if (an.length) row.anomalyCount++;
  }
  for (const r of rows.values()) {
    r.dates.sort((a, b) => a - b);
    r.days = r.dates.length;
    r.orders.sort((a, b) => (a.date ?? 0) - (b.date ?? 0) || a.orderNo.localeCompare(b.orderNo));
  }

  // ---- 預排（業別＝行政）：人員 record_id × 日期 ----
  let planOn = false;
  const planDays = new Map<string, Set<number>>();
  if (sched) {
    const byFid = (id: string) => sched.fields.find((f) => f.id === id);
    const [fs, fe, fp, ft, fpts] = [byFid(ADMIN_SCHEDULE_FID.start), byFid(ADMIN_SCHEDULE_FID.end), byFid(ADMIN_SCHEDULE_FID.person), byFid(ADMIN_SCHEDULE_FID.trade), byFid(ADMIN_SCHEDULE_FID.points)];
    if (fs && fp) {
      planOn = true;
      for (const r of sched.records) for (const w of peopleOf(r, fp.name)) people.learn(w.id ?? "", w.name);
      const filledDays = new Set<string>();
      const unfilled: { k: string; day: number }[] = [];
      const plan = new Map<string, { points: number; defaulted: number; name: string }>();
      const bucket = (k: string, name: string) => {
        let b = plan.get(k);
        if (!b) plan.set(k, (b = { points: 0, defaulted: 0, name }));
        return b;
      };
      for (const r of sched.records) {
        if (ft && text(r.fields[ft.name]).trim() !== ADMIN_TRADE) continue;
        const s = r.fields[fs.name];
        if (typeof s !== "number") continue;
        const e0 = fe ? r.fields[fe.name] : null;
        const e = typeof e0 === "number" && e0 >= s ? e0 : s;
        const first = taipeiDay(s);
        const last = taipeiDay(e);
        const from = Math.max(first, winFirst);
        const to = Math.min(last, winLast);
        if (to < from) continue;
        const filled = fpts ? r.fields[fpts.name] : null;
        for (const w of peopleOf(r, fp.name)) {
          if (!w.id && !w.name) continue;
          const k = people.key(w.id, w.name);
          const b = bucket(k, people.nameOf(k, w.name));
          if (!planDays.has(k)) planDays.set(k, new Set());
          for (let d = from; d <= to; d++) {
            planDays.get(k)!.add(d);
            if (typeof filled === "number") {
              b.points += filled / (last - first + 1);
              filledDays.add(`${k}|${d}`);
            } else unfilled.push({ k, day: d });
          }
        }
      }
      for (const { k, day } of unfilled) {
        const key = `${k}|${day}`;
        if (filledDays.has(key)) continue;
        filledDays.add(key); // 同人同日只補一次
        const b = plan.get(k)!;
        b.points += 1;
        b.defaulted += 1;
      }
      for (const [k, b] of plan) {
        const row = rowFor(k, b.name);
        row.plan = { points: b.points, days: planDays.get(k)!.size, defaulted: b.defaulted };
      }
    } else notes.push("預排表找不到人員或真起日欄位（以 field id 比對），預排差異無法計算");
  } else notes.push("預排表讀不到，預排差異無法計算");

  // ---- 分區與合計 ----
  const all = [...rows.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  // 主表列全部人；合計含全部人，只有預排點數與差異限有預排的人。
  const planned = planOn ? all.filter((r) => r.plan && r.plan.points > 0) : [];
  const sum = (f: (r: AdminRow) => number) => all.reduce((s, r) => s + f(r), 0);
  const revenue = sum((r) => r.revenue);
  const points = planned.reduce((s, r) => s + (r.plan?.points ?? 0), 0);
  const plannedDiff = planned.reduce((s, r) => s + r.revenue, 0) - points;
  let overlapDays = 0;
  for (const [k, ds] of planDays) for (const d of rows.get(k)?.dates ?? []) if (ds.has(d)) overlapDays++;
  return {
    rows: all,
    totals: { orders: sum((r) => r.orders.length), days: sum((r) => r.days), revenue, points, diff: plannedDiff, plannedN: planned.length, anomalies: sum((r) => r.anomalyCount), overtime: sum((r) => r.overtime) },
    stats: {
      orders: all.reduce((s, r) => s + r.orders.length, 0),
      costSheets,
      people: all.filter((r) => r.days > 0).length,
      revenue: all.reduce((s, r) => s + r.revenue, 0),
      planPersonDays: [...planDays.values()].reduce((s, d) => s + d.size, 0),
      planPeople: planDays.size,
      overlapDays,
      unmatchedOrders,
    },
    notes,
  };
}

// Field names the board requests from the server (see /api/sources projection).
// "#fld…" matches by field id: the schedule's dates must never be read by name.
export const ADMIN_WORK_FIELDS = ["工作單號", "所屬成本單", "行政工項", "件數", "最終營業額點數", "備註", "自訂說明", "⚠*"];
export const ADMIN_COST_FIELDS = ["單號", "工作日期", "填表人", "工作單列", "加班時數"];
export const ADMIN_SCHEDULE_FIELDS = Object.values(ADMIN_SCHEDULE_FID).map((id) => `#${id}`);
