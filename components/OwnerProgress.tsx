"use client";
import { CircleAlert } from "lucide-react";
import { useMemo } from "react";
import { formatNumber } from "@/lib/aggregate";
import { pickField, type WorkFields } from "@/lib/controlGroup";
import type { CellValue, TableData } from "@/lib/types";
import { formatDate } from "@/lib/week";

const text = (v: CellValue) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v));
const round1 = (n: number) => formatNumber(Math.round(n * 10) / 10);

// 業主進度 per case (R02 item 7). Agreed so far: days = days until the due date.
// Still open: the % numerator/denominator (PM to define) and where the due date
// lives — both columns stay "待定義 / —" until then rather than guessing.
export default function OwnerProgress({ data, wf, dateField, weekStart, weekEnd }: { data: TableData; wf: WorkFields; dateField: string; weekStart: number; weekEnd: number }) {
  const caseField = pickField(data.fields, ["所屬案件", "案件", "工程名稱"]) ?? wf.jobNo;
  const dueField = pickField(data.fields, ["交期", "合約交期", "預定完成日", "完工期限", "到期日"], ["date"]);

  const cases = useMemo(() => {
    if (!caseField) return [];
    const map = new Map<string, { name: string; jobNo: string; week: number; weekOrders: number; last: number; due: number | null }>();
    for (const r of data.records) {
      const name = text(r.fields[caseField.name]) || "（未填案件）";
      const cur = map.get(name) ?? { name, jobNo: "", week: 0, weekOrders: 0, last: 0, due: null };
      if (!cur.jobNo && wf.jobNo && wf.jobNo !== caseField) cur.jobNo = text(r.fields[wf.jobNo.name]);
      const pts = wf.revenue ? r.fields[wf.revenue.name] : null;
      const d = r.fields[dateField];
      if (typeof d === "number") {
        if (d >= weekStart && d < weekEnd) {
          cur.last = Math.max(cur.last, d);
          cur.weekOrders++;
          if (typeof pts === "number") cur.week += pts;
        }
      }
      const due = dueField ? r.fields[dueField.name] : null;
      if (typeof due === "number") cur.due = due;
      map.set(name, cur);
    }
    return [...map.values()].filter((c) => c.weekOrders > 0).sort((a, b) => b.week - a.week);
  }, [data, caseField, wf, dateField, dueField, weekStart, weekEnd]);

  const today = Date.now();
  return (
    <section className="cg">
      <div className="cg-head">
        <div>
          <h2>業主進度</h2>
          <p className="muted small">只列所選週有內業工作的案件，點數只算所選週・進度以百分比與天數呈現</p>
        </div>
      </div>
      <ul className="cg-notes">
        <li>
          <CircleAlert size={14} /> 進度 % 的計算口徑待 PM 說明，暫不計算。
        </li>
        {!dueField && (
          <li>
            <CircleAlert size={14} /> 交期欄位尚未定位（天數＝距離交期幾天），暫顯示「—」。
          </li>
        )}
        {!caseField && (
          <li>
            <CircleAlert size={14} /> 找不到案件欄位，無法依案件彙整。
          </li>
        )}
      </ul>
      {cases.length > 0 && (
        <div className="cg-table">
          <table>
            <thead>
              <tr>
                <th>案件</th>
                <th>工作編號</th>
                <th className="num">本週點數</th>
                <th className="num">業主進度 %</th>
                <th className="num">距交期（天）</th>
                <th>本週最近工作日</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.name}>
                  <td className="cg-group">{c.name}</td>
                  <td>{c.jobNo || "—"}</td>
                  <td className="num">{wf.revenue ? round1(c.week) : "—"}</td>
                  <td className="num muted">待定義</td>
                  <td className="num">{c.due ? Math.ceil((c.due - today) / 86400000) : "—"}</td>
                  <td>{c.last ? formatDate(c.last) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
