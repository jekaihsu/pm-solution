// R09 內業報告 — 內業經理看的「預排 vs 實際」檢討頁。口徑（業主裁示 2026-10-13）：
//  - 內業以「人」為單位。實際人日＝所選週內成本單的不重複（人員 record_id，日期）；
//    預排人日＝預排表（業別＝內業、ROV 一律算外業、條類型＝休假不算）逐人展開後的不重複（人員 record_id，日期）。
//    比對主鍵＝人員 record_id＋日期，組別不參與 join，只做顯示（顯示用成本單的「內業組別」）。
//  - 內業工作單沒有組別與日期，經「所屬成本單」link 的 record_id 帶入（成本單單號有重複，不用單號文字）。
//    link 完全讀不到（示範資料）才用成本單標題備援，且標題不唯一就不猜。
//  - 預排日期一律用 field id（真起日 fldMXOggGP、真訖日 fldjWv1xST），不照欄名。
//  - 案件以「工程」為單位比對（業主 2026-10-13：工程編號＝案件編號前 7 碼；C115016、C115016A、C115016-2-1 同屬工程 C115016）。
//    案件先用 link record_id 查案件表取得案件編號，再套 engineeringCode：符合 ^[A-Z]\d{6}(?!\d)（trim、轉大寫，第 8 碼是數字不取）
//    且不是 C000000 → 工程鍵＝前 7 碼；否則（空白、C000000、格式不符）不合併，一案一列（鍵＝record_id）。
//    案件表查得到該記錄 → 只認案件表的編號（空白就不合併）；記錄不在案件表、或沒有案件表 → 才用 link 標題文字備援。
//    工程名稱與「等 n 案」只看本週預排或工作單實際連到的案件記錄。「編號重複」＝本週涉及的案件中，有任一筆的完整編號在案件表出現 ≥2 筆；
//    沒有案件表時改看畫面上是否有兩列以上顯示相同完整編號。
//  - 同人同案連續（日曆連續）日期合併成 起～迄。
//  - 圖資／報告的期限、節點狀態、確認單營業額與執行比例口徑尚未定義，這裡不算。
// 輸出刻意不含任何成本欄位（出工成本、人力成本、方案日成本、加班費、雜支）：輸入的欄位也不向伺服器要。
import type { CellValue, FieldMeta, TableData } from "./types";

type Rec = TableData["records"][number];
const DAY = 86400000;
const TZ = 8 * 3600000; // Asia/Taipei
export const taipeiDay = (t: number) => Math.floor((t + TZ) / DAY);
export const dayStartMs = (d: number) => d * DAY - TZ;

// 工作預排 tblN8c3WN44233aG 的欄位 id（fid↔語意永遠不變，欄名會被 UI 改）。
export const INTERNAL_SCHEDULE_FID = {
  start: "fldMXOggGP", // 真起日
  end: "fldjWv1xST", // 真訖日
  person: "fld7KNCsVe",
  trade: "fldrENe4H6",
  group: "fldNDUy2XP",
  kind: "fld78OmLVn", // 條類型（出工／休假）
  case: "fldnzMsrzZ",
  note: "fldpFvkV6G",
} as const;

export const INTERNAL_FLAGS = ["⚠組別權重=0", "⚠案件不符", "⚠工項不符"] as const;
export const RETURNED = "已退回";
export const KIND_UNPLANNED = "未排有填";
export const KIND_UNFILLED = "有排未填";
export type CaseResult = "有排有做" | "有排未做" | "未排有做";

const NO_TEAM = "（未填組別）";
const NO_PERSON = "（對不到成本單）";
const NO_REPORTER = "（未填填報人）";
const NO_CASE = "（未填案件）";
const NO_ORDER = "（無工作單）";

const text = (v: CellValue | undefined): string => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v));
const lit = (v: CellValue | undefined) => v === true || (typeof v === "number" && v !== 0) || (Array.isArray(v) && v.length > 0) || (typeof v === "string" && v.trim() !== "" && !/^(否|false|0|無)$/i.test(v.trim()));
const named = (fields: FieldMeta[], names: string[]) => names.map((n) => fields.find((f) => f.name === n)).find(Boolean);
const groupKey = (g: string) => g.trim().replace(/組$/, "");
const isRov = (g: string) => groupKey(g).toUpperCase() === "ROV";
const keepInternal = (trade: string, group: string) => !isRov(group) && /內業/.test(trade);

export interface DayRun {
  from: number;
  to: number;
  days: number;
}

// 日序號 → 連續區間（日曆連續；重複的日子只算一次）。
export function mergeDayRuns(days: Iterable<number>): DayRun[] {
  const list = [...new Set(days)].sort((a, b) => a - b);
  const out: DayRun[] = [];
  for (const d of list) {
    const last = out[out.length - 1];
    if (last && d === last.to + 1) {
      last.to = d;
      last.days++;
    } else out.push({ from: d, to: d, days: 1 });
  }
  return out;
}

export interface PersonRow {
  personId: string;
  name: string;
  label: string; // 同週跨組：「名字・控制／圖報A」
  teams: string[]; // 本週成本單的內業組別（張數多的在前）
  teamText: string; // 組別欄：單一組別／「跨組」／（沒填單的人）預排上的組別
  plannedDays: number;
  actualDays: number;
  matched: number;
  plannedOnly: number; // 有排未填
  actualOnly: number; // 未排有填
  orders: number;
  revenue: number;
}

// 工程編號＝案件編號前 7 碼（R10 的 lib/fieldReport.ts 另存一份同規則，測試比對兩者輸出一致）。
export function engineeringCode(no: string | null | undefined): string | null {
  const m = /^[A-Z]\d{6}(?!\d)/.exec(String(no ?? "").trim().toUpperCase());
  return m && m[0] !== "C000000" ? m[0] : null;
}

export interface CaseRow {
  caseId: string; // 工程鍵 P:前7碼；不合併的案件為 record_id（讀不到時為 t:標題）
  code: string; // 工程編號（前 7 碼；不合併的案件為案件編號原文）
  dup?: boolean; // 工程內有完整案件編號相同的不同記錄（或 C000000 等占位碼重複）
  name: string;
  plannedDays: number;
  actualDays: number;
  orders: number;
  revenue: number;
  result: CaseResult;
}

export interface ExceptionRow {
  kinds: string[]; // 未排有填／有排未填／⚠…／已退回
  team: string;
  person: string;
  personId: string;
  caseId: string;
  code: string;
  name: string;
  from: number; // 台北日序號
  to: number;
  days: number;
  revenue: number | null; // 有排未填沒有營業額
  note: string;
}

export interface InternalReport {
  people: PersonRow[];
  summary: {
    plannedDays: number;
    actualDays: number;
    matched: number;
    plannedOnly: number;
    actualOnly: number;
    achievement: number | null; // 吻合 ÷ 預排人日
    plannedPeople: number;
    actualPeople: number;
    orders: number;
    revenue: number;
  };
  cases: CaseRow[];
  caseSummary: { planned: number; plannedWithOrders: number; plannedNoOrders: number; actual: number; unplanned: number };
  exceptions: ExceptionRow[];
  flagCounts: Record<string, number>;
  returned: number;
  stats: { costSheets: number; unmatchedOrders: number; dateMismatch: number; planRowsNoCase: number; ordersNoCase: number };
  notes: string[];
}

// 人員身分：有 record_id 就用 id，沒有（示範資料）就用名字；兩邊一邊有 id 一邊沒有時，靠名字對上。
function makePeople() {
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();
  const learn = (id: string | undefined, name: string) => {
    if (name && id) {
      if (!idByName.has(name)) idByName.set(name, id);
      if (!nameById.has(id)) nameById.set(id, name);
    }
  };
  const key = (id: string | undefined, name: string) => id || idByName.get(name) || `n:${name}`;
  return { learn, key, nameOf: (k: string, fallback: string) => nameById.get(k) || fallback };
}

// link 欄（可多筆）→ [{id, title}]；record_id 在 links、標題在 fields，兩者一一對應。
function refs(r: Rec, field: string | undefined): { id?: string; title: string }[] {
  if (!field) return [];
  const v = r.fields[field];
  const titles = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
  const ids = r.links?.[field] ?? [];
  const n = Math.max(titles.length, ids.length);
  return Array.from({ length: n }, (_, i) => ({ id: ids[i], title: titles[i] ?? "" }));
}

export function buildInternalReport(p: { work: TableData; cost?: TableData; sched?: TableData; cases?: TableData; start: number; end: number }): InternalReport {
  const { work, cost, sched, cases: caseTable, start, end } = p;
  const notes: string[] = [];
  const winFirst = taipeiDay(start);
  const winLast = taipeiDay(end - 1);
  const inWin = (d: number) => d >= winFirst && d <= winLast;
  const people = makePeople();

  // ---- 案件資料（案件編號＝案件記錄主欄；工程名稱＝案件名稱；工程＝案件編號前 7 碼）----
  const caseById = new Map<string, { code: string; name: string }>();
  const caseByCode = new Map<string, { id: string; code: string; name: string } | null>(); // 完整編號（trim、大寫）→ 案件表唯一記錄（出現不只一筆＝null）；記錄不在表或只有編號文字時備援
  const codeCount = new Map<string, number>(); // 完整案件編號（trim、大寫）出現次數
  if (caseTable) {
    const primary = caseTable.fields.find((f) => f.primary) ?? named(caseTable.fields, ["案件編號"]);
    const nameField = named(caseTable.fields, ["案件名稱", "工程名稱"]);
    for (const c of caseTable.records) {
      const info = { code: primary ? text(c.fields[primary.name]).trim() : "", name: nameField ? text(c.fields[nameField.name]).trim() : "" };
      caseById.set(c.id, info);
      const full = info.code.toUpperCase();
      if (full) {
        caseByCode.set(full, caseByCode.has(full) ? null : { id: c.id, ...info });
        codeCount.set(full, (codeCount.get(full) ?? 0) + 1);
      }
    }
  } else notes.push("案件資料讀不到，工程名稱先留白（只顯示案件編號）");
  const caseInfo = new Map<string, { code: string; name: string; dup?: boolean }>();
  const involved = new Map<string, Set<string>>(); // 工程鍵 → 本週實際涉及的案件鍵（record_id 或 t:標題）
  const involvedRefs = new Map<string, { id?: string; title: string }>(); // 案件鍵 → 原始參照（含不合併的單列）
  const fullCodeOf = (rawKey: string) => {
    const ref = involvedRefs.get(rawKey)!;
    const byId = ref.id ? caseById.get(ref.id) : undefined;
    return (byId ? byId.code : ref.title).trim().toUpperCase();
  };
  const caseKeyOf = (ref: { id?: string; title: string }) => {
    if (!ref.id && !ref.title) {
      if (!caseInfo.has("__nocase")) caseInfo.set("__nocase", { code: NO_CASE, name: "" });
      return "__nocase";
    }
    const rawKey = ref.id ?? `t:${ref.title}`;
    if (!involvedRefs.has(rawKey)) involvedRefs.set(rawKey, ref);
    // 案件表查得到這筆記錄 → 只認案件表的編號（空白就不合併）；查不到或沒有案件表 → 才用 link 標題文字
    const pc = engineeringCode(fullCodeOf(rawKey));
    if (pc) {
      const key = `P:${pc}`;
      if (!involved.has(key)) involved.set(key, new Set());
      involved.get(key)!.add(rawKey);
      return key;
    }
    return rawKey;
  };

  // ---- 成本單：人、日期、內業組別 ----
  const cFields = cost?.fields ?? [];
  const cPrimary = cFields.find((f) => f.primary) ?? cFields[0];
  const cDate = named(cFields, ["工作日期"]);
  const cWho = named(cFields, ["填報人"]);
  const cTeams = ["內業組別", "組別", "所屬組別"].map((n) => cFields.find((f) => f.name === n)).filter((f): f is FieldMeta => Boolean(f));
  const costInfo = new Map<string, { pk: string; day: number; team: string }>(); // 全部成本單（工作單含各週，要先對得到才能判斷在不在本週）
  const byTitle = new Map<string, string | null>();
  const actual = new Map<string, Map<number, string[]>>(); // pk → 日序號 → 當天填單的內業組別
  const teamSheets = new Map<string, Map<string, { n: number; first: number }>>(); // pk → 組別 → 張數、最早日
  let costSheets = 0;
  if (cost && cDate && cWho) {
    for (const c of cost.records) for (const w of refs(c, cWho.name)) people.learn(w.id, w.title);
    for (const c of cost.records) {
      const t = c.fields[cDate.name];
      if (typeof t !== "number") continue;
      const day = taipeiDay(t);
      const who = refs(c, cWho.name)[0];
      const pk = who ? people.key(who.id, who.title) : "n:" + NO_REPORTER;
      const team = cTeams.map((f) => text(c.fields[f.name]).trim()).find(Boolean) || NO_TEAM;
      costInfo.set(c.id, { pk, day, team });
      const title = cPrimary ? text(c.fields[cPrimary.name]) : "";
      if (title) byTitle.set(title, byTitle.has(title) ? null : c.id);
      if (!inWin(day)) continue;
      costSheets++;
      if (!actual.has(pk)) actual.set(pk, new Map());
      const days = actual.get(pk)!;
      days.set(day, [...(days.get(day) ?? []), team]);
      if (!teamSheets.has(pk)) teamSheets.set(pk, new Map());
      const ts = teamSheets.get(pk)!;
      const cur = ts.get(team);
      ts.set(team, { n: (cur?.n ?? 0) + 1, first: Math.min(cur?.first ?? day, day) });
    }
  } else notes.push("內業成本單讀不到或缺「工作日期／填報人」，實際人日與工作單的人、組別無法帶入");

  // ---- 工作單 → 成本單（link record_id；沒有 link 才用唯一標題備援）----
  const wf = {
    link: named(work.fields, ["所屬成本單"]),
    no: named(work.fields, ["工作單號"]) ?? work.fields.find((f) => f.primary),
    caseLink: named(work.fields, ["所屬案件"]),
    caseNo: named(work.fields, ["案件編號"]),
    pts: named(work.fields, ["最終營業額點數", "營業額點數"]),
    note: named(work.fields, ["備註"]),
    status: named(work.fields, ["檢核狀態"]),
    fdate: named(work.fields, ["工作日期-營業額明細"]),
    flags: INTERNAL_FLAGS.map((n) => work.fields.find((f) => f.name === n)).filter((f): f is FieldMeta => Boolean(f)),
  };
  interface Ord {
    pk: string | null;
    day: number;
    team: string;
    caseKey: string;
    points: number | null;
    flags: string[];
    returned: boolean;
    note: string;
  }
  const orders: Ord[] = [];
  const flagCounts: Record<string, number> = Object.fromEntries(INTERNAL_FLAGS.map((n) => [n, 0]));
  let returned = 0;
  let unmatchedOrders = 0;
  let dateMismatch = 0;
  for (const o of work.records) {
    // 1) 對成本單
    const linkIds = (wf.link && o.links?.[wf.link.name]) || [];
    let cid: string | undefined = linkIds.find((id) => costInfo.has(id));
    if (!cid && !linkIds.length && wf.link) {
      // 完全沒有 record_id（示範資料）：標題唯一才備援
      cid = refs(o, wf.link.name).map((r) => byTitle.get(r.title)).find(Boolean) ?? undefined;
    }
    const info = cid ? costInfo.get(cid) : undefined;
    // 2) 日期：成本單的工作日期為準，對不到成本單才用工作單自己的「工作日期-營業額明細」
    const fd = wf.fdate ? o.fields[wf.fdate.name] : null;
    const day = info ? info.day : typeof fd === "number" ? taipeiDay(fd) : null;
    if (info && typeof fd === "number" && taipeiDay(fd) !== info.day && inWin(info.day)) dateMismatch++;
    if (!info && (day === null || inWin(day))) unmatchedOrders++; // 對不到成本單，又無法證明不是本週
    if (day === null || !inWin(day)) continue;
    // 3) 案件、點數、亮燈、退回
    const caseRef = refs(o, wf.caseLink?.name)[0] ?? { title: wf.caseNo ? text(o.fields[wf.caseNo.name]).trim() : "" };
    const raw = wf.pts ? o.fields[wf.pts.name] : null;
    const flags = wf.flags.filter((f) => lit(o.fields[f.name])).map((f) => f.name);
    const isReturned = wf.status ? /退回/.test(text(o.fields[wf.status.name])) : false;
    for (const f of flags) flagCounts[f]++;
    if (isReturned) returned++;
    orders.push({
      pk: info ? info.pk : null,
      day,
      team: info ? info.team : "—",
      caseKey: caseKeyOf(caseRef),
      points: typeof raw === "number" ? raw : null,
      flags,
      returned: isReturned,
      note: wf.note ? text(o.fields[wf.note.name]).trim() : "",
    });
  }

  // ---- 預排：人員 record_id × 日期 × 案件 ----
  let planOn = false;
  const planDays = new Map<string, Set<number>>(); // pk → 日序號
  const planCases = new Map<string, Map<number, Map<string, string[]>>>(); // pk → 日 → 案件 → 預排備註
  const planHint = new Map<string, string>(); // pk → 預排上的組別（只用於沒填單的人顯示）
  let planRowsNoCase = 0;
  if (sched) {
    const byId = (id: string) => sched.fields.find((f) => f.id === id);
    const sf = {
      start: byId(INTERNAL_SCHEDULE_FID.start) ?? named(sched.fields, ["開始日期", "預排開始日", "預排日期"]),
      end: byId(INTERNAL_SCHEDULE_FID.end) ?? named(sched.fields, ["結束日期", "預排結束日"]),
      person: byId(INTERNAL_SCHEDULE_FID.person) ?? named(sched.fields, ["人員"]),
      trade: byId(INTERNAL_SCHEDULE_FID.trade) ?? named(sched.fields, ["業別"]),
      group: byId(INTERNAL_SCHEDULE_FID.group) ?? named(sched.fields, ["組別"]),
      kind: byId(INTERNAL_SCHEDULE_FID.kind) ?? named(sched.fields, ["條類型"]),
      case: byId(INTERNAL_SCHEDULE_FID.case) ?? named(sched.fields, ["案件"]),
      note: byId(INTERNAL_SCHEDULE_FID.note) ?? named(sched.fields, ["備註"]),
    };
    if (sf.start && sf.person) {
      planOn = true;
      for (const r of sched.records) for (const w of refs(r, sf.person.name)) people.learn(w.id, w.title);
      for (const r of sched.records) {
        const s = r.fields[sf.start.name];
        if (typeof s !== "number") continue;
        if (sf.kind && /休假|請假/.test(text(r.fields[sf.kind.name]))) continue; // 休假不是預排出工
        const e0 = sf.end ? r.fields[sf.end.name] : null;
        const e = typeof e0 === "number" && e0 >= s ? e0 : s;
        const from = Math.max(taipeiDay(s), winFirst);
        const to = Math.min(taipeiDay(e), winLast);
        if (to < from) continue;
        const trade = sf.trade ? text(r.fields[sf.trade.name]) : "";
        const groups = sf.group ? (Array.isArray(r.fields[sf.group.name]) ? (r.fields[sf.group.name] as string[]) : [text(r.fields[sf.group.name])]).filter(Boolean) : [];
        if (!(groups.length ? groups.some((g) => keepInternal(trade, g)) : keepInternal(trade, ""))) continue; // 非內業或 ROV
        const who = refs(r, sf.person.name).filter((w) => w.id || w.title);
        if (!who.length) continue; // 沒有人員的預排條不貢獻人日，也不算涉及案件
        const caseRefs = refs(r, sf.case?.name);
        if (!caseRefs.length) planRowsNoCase++;
        const caseKeys = caseRefs.length ? caseRefs.map(caseKeyOf) : [caseKeyOf({ title: "" })];
        const note = sf.note ? text(r.fields[sf.note.name]).trim() : "";
        const seen = new Set<string>();
        for (const w of who) {
          const pk = people.key(w.id, w.title);
          if (seen.has(pk)) continue;
          seen.add(pk);
          if (!planDays.has(pk)) planDays.set(pk, new Set());
          if (!planCases.has(pk)) planCases.set(pk, new Map());
          if (!planHint.has(pk) && groups[0]) planHint.set(pk, groupKey(groups[0]));
          for (let d = from; d <= to; d++) {
            planDays.get(pk)!.add(d);
            const byCase = planCases.get(pk)!.get(d) ?? new Map<string, string[]>();
            planCases.get(pk)!.set(d, byCase);
            for (const ck of caseKeys) {
              const list = byCase.get(ck) ?? [];
              if (note && !list.includes(note)) list.push(note);
              byCase.set(ck, list);
            }
          }
        }
      }
    } else notes.push("預排表找不到人員或真起日欄位（以 field id 比對），預排無法計算");
  } else notes.push("預排表讀不到，預排人日與有排未填／未排有填無法計算");

  // ---- 每人一列 ----
  const teamsOf = (pk: string) =>
    [...(teamSheets.get(pk) ?? [])].sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first || a[0].localeCompare(b[0])).map(([t]) => t);
  const personKeys = new Set<string>([...actual.keys(), ...planDays.keys()]);
  const ordersByPerson = new Map<string, Ord[]>();
  for (const o of orders) if (o.pk) ordersByPerson.set(o.pk, [...(ordersByPerson.get(o.pk) ?? []), o]);
  const nameOf = (pk: string) => people.nameOf(pk, pk.startsWith("n:") ? pk.slice(2) : pk);
  const primaryTeam = (pk: string) => teamsOf(pk)[0] ?? planHint.get(pk) ?? NO_TEAM;
  const peopleRows: PersonRow[] = [];
  for (const pk of personKeys) {
    const a = new Set(actual.get(pk)?.keys() ?? []);
    const pl = planDays.get(pk) ?? new Set<number>();
    const matched = [...pl].filter((d) => a.has(d)).length;
    const teams = teamsOf(pk);
    const mine = ordersByPerson.get(pk) ?? [];
    const name = nameOf(pk);
    peopleRows.push({
      personId: pk,
      name,
      label: teams.length > 1 ? `${name}・${teams.join("／")}` : name,
      teams,
      teamText: teams.length > 1 ? "跨組" : (teams[0] ?? planHint.get(pk) ?? "—"),
      plannedDays: pl.size,
      actualDays: a.size,
      matched,
      plannedOnly: pl.size - matched,
      actualOnly: a.size - matched,
      orders: mine.length,
      revenue: mine.reduce((s, o) => s + (o.points ?? 0), 0),
    });
  }
  peopleRows.sort((x, y) => x.teamText.localeCompare(y.teamText) || y.actualDays - x.actualDays || x.name.localeCompare(y.name));
  const sum = (f: (r: PersonRow) => number) => peopleRows.reduce((s, r) => s + f(r), 0);
  const plannedDays = sum((r) => r.plannedDays);
  const matchedAll = sum((r) => r.matched);
  const summary = {
    plannedDays,
    actualDays: sum((r) => r.actualDays),
    matched: matchedAll,
    plannedOnly: sum((r) => r.plannedOnly),
    actualOnly: sum((r) => r.actualOnly),
    achievement: planOn && plannedDays > 0 ? matchedAll / plannedDays : null,
    plannedPeople: peopleRows.filter((r) => r.plannedDays > 0).length,
    actualPeople: peopleRows.filter((r) => r.actualDays > 0).length,
    orders: orders.length,
    revenue: orders.reduce((s, o) => s + (o.points ?? 0), 0),
  };

  // ---- 每案一列 ----
  // 工程的名稱與編號重複：只看本週實際涉及的案件（依案件編號排序第一個有名稱的；涉及不只一案才加「等 n 案」，同一案件只算 1）
  // 同一案件：record_id 就是它自己；純文字能在案件表以完整編號找到唯一記錄就視同那筆，找不到就看有沒有同編號的 record_id，都沒有以完整編號去重。
  const entOf = new Map<string, string>();
  {
    const idByCode = new Map<string, string>();
    for (const k of [...involvedRefs.keys()].sort()) if (!k.startsWith("t:")) {
      const c = fullCodeOf(k);
      if (c && !idByCode.has(c)) idByCode.set(c, k);
    }
    for (const k of involvedRefs.keys()) {
      const c = fullCodeOf(k);
      entOf.set(k, !k.startsWith("t:") || !c ? k : caseByCode.get(c)?.id ?? idByCode.get(c) ?? `c:${c}`);
    }
  }
  // 編號重複（R09／R10 相同）：(i) 涉及的某筆完整編號在案件表出現 ≥2 筆；(ii) 涉及的不同案件（不同 record_id）卻有相同完整編號（不在案件表的 record_id 也算）
  const dupCodes = new Set<string>();
  {
    const entsByCode = new Map<string, Set<string>>();
    for (const k of involvedRefs.keys()) {
      const c = fullCodeOf(k);
      if (!c) continue;
      if ((codeCount.get(c) ?? 0) > 1) dupCodes.add(c);
      if (!entsByCode.has(c)) entsByCode.set(c, new Set());
      entsByCode.get(c)!.add(entOf.get(k)!);
    }
    for (const [c, ents] of entsByCode) if (ents.size > 1) dupCodes.add(c);
  }
  const nameOfRaw = (rawKey: string) => {
    const ref = involvedRefs.get(rawKey)!;
    const byId = ref.id ? caseById.get(ref.id) : undefined;
    return byId ? byId.name : caseByCode.get(fullCodeOf(rawKey))?.name ?? "";
  };
  for (const [key, m] of involved) {
    const ents = new Map<string, { code: string; name: string }>();
    for (const k of m) {
      const e = entOf.get(k)!;
      if (!ents.has(e)) ents.set(e, { code: fullCodeOf(k), name: caseById.get(e)?.name ?? nameOfRaw(k) });
    }
    const list = [...ents].sort(([ea, a], [eb, b]) => (a.code < b.code ? -1 : a.code > b.code ? 1 : ea < eb ? -1 : 1)).map(([, v]) => v);
    const first = list.find((x) => x.name)?.name ?? "";
    caseInfo.set(key, { code: key.slice(2), name: list.length > 1 && first ? `${first}等 ${list.length} 案` : first, dup: [...m].some((k) => dupCodes.has(fullCodeOf(k))) });
  }
  for (const [rawKey, ref] of involvedRefs) {
    if (caseInfo.has(rawKey) || [...involved.values()].some((m) => m.has(rawKey))) continue;
    const byId = ref.id ? caseById.get(ref.id) : undefined;
    caseInfo.set(rawKey, { code: byId?.code || ref.title || rawKey, name: nameOfRaw(rawKey), dup: dupCodes.has(fullCodeOf(rawKey)) });
  }
  const casePlan = new Map<string, Set<string>>(); // 案件 → 預排的（人，日）
  for (const [pk, byDay] of planCases) for (const [d, byCase] of byDay) for (const ck of byCase.keys()) casePlan.set(ck, (casePlan.get(ck) ?? new Set()).add(`${pk}|${d}`));
  const caseActual = new Map<string, { days: Set<string>; orders: number; revenue: number }>();
  const ordersNoCase = orders.filter((o) => o.caseKey === "__nocase").length;
  if (ordersNoCase) notes.push(`${ordersNoCase} 張工作單沒有填案件，不列入案件比對`);
  if (planRowsNoCase) notes.push(`${planRowsNoCase} 條預排沒有填案件，不列入案件比對（人日仍照算）`);
  for (const o of orders) {
    const cur = caseActual.get(o.caseKey) ?? { days: new Set<string>(), orders: 0, revenue: 0 };
    cur.days.add(`${o.pk ?? "?"}|${o.day}`);
    cur.orders++;
    cur.revenue += o.points ?? 0;
    caseActual.set(o.caseKey, cur);
  }
  const RANK: Record<CaseResult, number> = { 有排有做: 0, 有排未做: 1, 未排有做: 2 };
  const caseRows: CaseRow[] = [];
  for (const key of new Set([...casePlan.keys(), ...caseActual.keys()])) {
    if (key === "__nocase") continue; // 沒填案件的預排／工作單無法比對案件，只在註腳計數
    const info = caseInfo.get(key)!;
    const a = caseActual.get(key);
    const planned = casePlan.get(key)?.size ?? 0;
    caseRows.push({
      caseId: key,
      code: info.code,
      name: info.name,
      dup: Boolean(info.dup),
      plannedDays: planned,
      actualDays: a?.days.size ?? 0,
      orders: a?.orders ?? 0,
      revenue: a?.revenue ?? 0,
      result: planned > 0 ? (a ? "有排有做" : "有排未做") : "未排有做",
    });
  }
  caseRows.sort((x, y) => RANK[x.result] - RANK[y.result] || y.revenue - x.revenue || y.plannedDays - x.plannedDays || x.code.localeCompare(y.code));
  const plannedCases = caseRows.filter((r) => r.plannedDays > 0);
  const caseSummary = {
    planned: plannedCases.length,
    plannedWithOrders: plannedCases.filter((r) => r.orders > 0).length,
    plannedNoOrders: plannedCases.filter((r) => r.orders === 0).length,
    actual: caseRows.filter((r) => r.orders > 0).length,
    unplanned: caseRows.filter((r) => r.plannedDays === 0 && r.orders > 0).length,
  };

  // ---- 上週異常與人工確認案件 ----
  interface Acc {
    kinds: string[];
    team: string;
    pk: string | null;
    caseKey: string;
    days: Set<number>;
    revenue: number | null;
    notes: string[];
  }
  const accs = new Map<string, Acc>();
  const addAcc = (kinds: string[], team: string, pk: string | null, caseKey: string, day: number, points: number | null, note: string) => {
    const k = [kinds.join("+"), pk ?? "?", caseKey, team].join("\u0001");
    const cur = accs.get(k) ?? { kinds, team, pk, caseKey, days: new Set<number>(), revenue: null, notes: [] };
    cur.days.add(day);
    if (points !== null) cur.revenue = (cur.revenue ?? 0) + points;
    if (note && !cur.notes.includes(note)) cur.notes.push(note);
    accs.set(k, cur);
  };
  if (planOn) {
    // 有排未填：預排了、那天沒有成本單
    for (const [pk, byDay] of planCases) {
      const a = actual.get(pk);
      for (const [d, byCase] of byDay) {
        if (a?.has(d)) continue;
        for (const [ck, ns] of byCase) addAcc([KIND_UNFILLED], primaryTeam(pk), pk, ck, d, null, ns.length ? `預排備註：${ns.join("；")}` : "");
      }
    }
    // 未排有填：有成本單、那天沒有預排
    for (const [pk, byDay] of actual) {
      const pl = planDays.get(pk);
      const mine = ordersByPerson.get(pk) ?? [];
      for (const [d, teams] of byDay) {
        if (pl?.has(d)) continue;
        const todays = mine.filter((o) => o.day === d);
        if (!todays.length) {
          caseInfo.set("__noorder", { code: NO_ORDER, name: "" }); // 有成本單但沒有工作單
          addAcc([KIND_UNPLANNED], teams[0], pk, "__noorder", d, 0, "");
        }
        for (const o of todays) addAcc([KIND_UNPLANNED], teams[0], pk, o.caseKey, d, o.points ?? 0, o.note);
      }
    }
  }
  // ⚠ 亮燈、已退回
  for (const o of orders) {
    const kinds = [...o.flags, ...(o.returned ? [RETURNED] : [])];
    if (kinds.length) addAcc(kinds, o.team, o.pk, o.caseKey, o.day, o.points ?? 0, o.note);
  }
  const kindRank = (k: string[]) => (k[0] === KIND_UNPLANNED ? 0 : k[0] === KIND_UNFILLED ? 1 : 2);
  const exceptions: ExceptionRow[] = [];
  for (const a of accs.values()) {
    const info = caseInfo.get(a.caseKey) ?? { code: a.caseKey, name: "" };
    for (const run of mergeDayRuns(a.days)) {
      exceptions.push({
        kinds: a.kinds,
        team: a.team,
        person: a.pk ? nameOf(a.pk) : NO_PERSON,
        personId: a.pk ?? "__none",
        caseId: a.caseKey,
        code: info.code,
        name: info.name,
        from: run.from,
        to: run.to,
        days: run.days,
        revenue: a.revenue,
        note: a.notes.join("；"),
      });
    }
  }
  exceptions.sort((x, y) => kindRank(x.kinds) - kindRank(y.kinds) || x.team.localeCompare(y.team) || x.person.localeCompare(y.person) || x.from - y.from || x.code.localeCompare(y.code));

  return {
    people: peopleRows,
    summary,
    cases: caseRows,
    caseSummary,
    exceptions,
    flagCounts,
    returned,
    stats: { costSheets, unmatchedOrders, dateMismatch, planRowsNoCase, ordersNoCase },
    notes,
  };
}

// 向伺服器要的欄位（/api/sources 投影）。「#fld…」依 field id：預排的日期絕不照欄名讀。
// 成本單只要人、日期、組別；出工成本、人力成本、方案日成本、加班費、雜支一律不要。
export const INTERNAL_WORK_FIELDS = ["工作單號", "所屬成本單", "所屬案件", "案件編號", "最終營業額點數", "營業額點數", "備註", "檢核狀態", "工作日期-營業額明細", ...INTERNAL_FLAGS];
export const INTERNAL_COST_FIELDS = ["單號", "工作日期", "填報人", "內業組別", "組別", "所屬組別"];
export const INTERNAL_SCHEDULE_FIELDS = Object.values(INTERNAL_SCHEDULE_FID).map((id) => `#${id}`);
export const INTERNAL_CASE_FIELDS = ["案件編號", "案件名稱"];
