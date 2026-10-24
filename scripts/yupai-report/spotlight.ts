// 專案查核（黃馨加）：查核日誌紀錄存續與建立/修改時間、請假狀態。移植自 generate.py build_spotlight。
// 紀錄歷史需 lark-cli（唯讀），由 main.ts 注入 historyFetcher；對帳/乾跑時傳回空陣列即可降級。
import { Analysis, NAME_ALIAS, ordToIso, type RawRecord, type YupaiData } from "../../lib/yupaiCompliance";

export const V3_BASE = "Sdw1bG1djaHsVGsRPvmjyVWipgg";
const TBL_NEI = "tblTP5Naz52FBpFg";
const TBL_WAI = "tbl97f1uXqi7Qz0k";
const TBL_XING = "tbl2c5CLgwPZ3Pl2";

const SERIAL_BASE_MS = Date.UTC(1899, 11, 30);
const serialIso = (s: unknown): string | null => {
  const f = Number(s);
  return Number.isFinite(f) ? new Date(SERIAL_BASE_MS + Math.trunc(f) * 86400000).toISOString().slice(0, 10) : null;
};
const norm = (n: unknown): string => {
  const s = (n === null || n === undefined ? "" : String(n)).trim();
  return NAME_ALIAS[s] ?? s;
};
const arr0 = (v: unknown): string => (Array.isArray(v) ? (v.length ? String(v[0]) : "") : v == null ? "" : String(v));
const creatorsOf = (r: RawRecord): string =>
  Array.isArray(r["建立者"]) ? (r["建立者"] as { name?: string }[]).map((p) => p?.name ?? "").filter(Boolean).join(", ") : "";

export interface SpotlightSpec {
  name: string;
  vanishDates: string[]; // "MM/DD"
  leaveDates: string[]; // "MM/DD"
}
export const DEFAULT_SPOTLIGHT: SpotlightSpec[] = [{ name: "黃馨加", vanishDates: ["10/12"], leaveDates: ["10/16"] }];

export interface HistoryEvent {
  time: string; // 台北 YYYY-MM-DD HH:MM:SS
  type: string; // activity_type（create/edit…）
  operator: string;
  fields: string[];
}
export type HistoryFetcher = (base: string, table: string, recordId: string) => HistoryEvent[];

interface LogHit {
  table: string;
  label: string;
  recordId: string;
  fill: string | null;
  creator: string;
}

function findLogRecords(data: YupaiData, name: string, dateIso: string): LogHit[] {
  const out: LogHit[] = [];
  const specs: [RawRecord[], string, string, string | null, string | null][] = [
    [data.neiye, TBL_NEI, "內業", "姓名", "填報時間"],
    [data.xingzheng, TBL_XING, "行政", "營業額人員-明細", "填寫時間"],
    [data.waiye, TBL_WAI, "外業", null, null],
  ];
  for (const [records, tbl, label, namef, fillf] of specs) {
    for (const r of records) {
      let hit = false;
      let fill: string | null = null;
      if (label === "外業") {
        const wd = r["出工日期"] ? String(r["出工日期"]).slice(0, 10) : null;
        hit = wd === dateIso && String(r["此單出工人"] ?? "").includes(name);
      } else {
        const wd = serialIso(r["工作日期-營業額明細"]);
        hit = !!wd && wd === dateIso && norm(r[namef as string]) === name;
        fill = fillf ? ((r[fillf] as string | undefined) ?? null) : null;
      }
      if (hit) out.push({ table: tbl, label, recordId: r.record_id, fill, creator: creatorsOf(r) });
    }
  }
  return out;
}

export function buildSpotlight(an: Analysis, data: YupaiData, fetchHistory: HistoryFetcher, specs: SpotlightSpec[] = DEFAULT_SPOTLIGHT): string {
  const year = ordToIso(an.startOrd).slice(0, 4);
  const L: string[] = [];
  for (const spec of specs) {
    const name = spec.name;
    if (!an.active.has(name)) continue;
    const b = an.bizOf(name) ?? an.grp.get(name) ?? "?";
    L.push(`### 專案查核：${name}（${b}組）`);

    for (const md of spec.vanishDates) {
      const iso = `${year}-${md.replace("/", "-")}`;
      const recs = findLogRecords(data, name, iso);
      L.push(`\n**${md}（當事人主張表單消失）**`);
      if (!recs.length) {
        L.push(`- 查無 ${name} 於 ${md} 的任何工作單紀錄 → 目前查無可見紀錄；無法據此判定從未填寫或未曾刪除。`);
      } else {
        L.push(`- 實際查到 **${recs.length} 筆**工作單，工作日期皆為 ${md}，目前仍存在於資料庫：`);
        const createdTs: string[] = [];
        for (const rec of recs) {
          const hist = fetchHistory(V3_BASE, rec.table, rec.recordId);
          const created = hist.find((e) => e.type === "create");
          const last = hist.length ? hist[hist.length - 1] : null;
          let seg = `  - ${rec.label}工作單 \`${rec.recordId}\`：填報時間 ${(rec.fill ?? "").slice(0, 19) || "—"}，建立者 ${rec.creator || "—"}`;
          if (created) {
            seg += `；建立於 ${created.time}（${created.operator}）`;
            createdTs.push(created.time);
          }
          if (last && last !== created) {
            seg += `；最後異動 ${last.time}（${last.operator}，${last.fields.filter(Boolean).join("、") || "—"}）`;
          }
          L.push(seg);
        }
        let when = "";
        if (createdTs.length) {
          const cmin = createdTs.reduce((a, b) => (a < b ? a : b));
          const cmax = createdTs.reduce((a, b) => (a > b ? a : b));
          when = cmin.slice(0, 10) === cmax.slice(0, 10) ? `${cmin.slice(0, 10)} ${cmin.slice(11, 16)}–${cmax.slice(11, 16)}` : `${cmin.slice(0, 16)}–${cmax.slice(0, 16)}`;
        }
        L.push(
          `- 結論：${name} ${md} 之日誌目前以上述 ${recs.length} 筆紀錄存在，依此計為「已填」。` +
            (when
              ? `惟上述紀錄均於 **${when} 建立**，即在當事人反映表單消失之後；此建立時間與事後重新填寫（補登）一致。`
              : "") +
            `現有建立／異動歷史僅涵蓋目前這 ${recs.length} 筆紀錄，無法確認或否認 ${md} 當天是否曾有其他紀錄被刪除。`,
        );
      }
    }

    for (const md of spec.leaveDates) {
      const iso = `${year}-${md.replace("/", "-")}`;
      const r = an.attRecord(name, iso);
      const st = r ? String(r["出勤狀態"] ?? "") : "（考勤表無此日）";
      const appr = (r ? arr0(r["核准假別"]) : "") || "無";
      const pend = an.pendOf(name, iso);
      L.push(`\n**${md}（請假核對）**`);
      L.push(`- 每日考勤明細：出勤狀態「${st}」，核准假別：${appr}。`);
      if (pend.length) {
        for (const [status, typ] of pend) L.push(`- 詠翔請假：${typ}，狀態「${status}」。`);
        if (pend.every(([s]) => s === "审批中")) {
          L.push(`- 結論：${md} 為請假（${pend[0][1]}）但**尚在審批中、未核准**，本報告視為請假（待核准），不列為缺失。`);
        }
      } else {
        L.push(`- 詠翔請假：查無 ${md} 之假單。`);
      }
    }

    const ev = an.evaluate(name);
    const miss = ev.cells.filter((c) => c.log === "未填").map((c) => c.date.slice(5).replace("-", "/"));
    const uns = ev.cells.filter((c) => c.pre === "未排").map((c) => c.date.slice(5).replace("-", "/"));
    const extra: string[] = [];
    if (miss.length) extra.push(`日誌未填：${miss.join("、")}`);
    if (uns.length) extra.push(`未預排：${uns.join("、")}`);
    if (extra.length) L.push(`\n**本區間其他待補**：${extra.join("；")}。`);
    L.push("");
  }
  return L.join("\n");
}
