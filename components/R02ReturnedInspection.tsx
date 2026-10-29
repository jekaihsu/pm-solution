import React from "react";
import { formatNumber } from "@/lib/aggregate";
import { r02InspectionRows, type WorkFields } from "@/lib/controlGroup";
import type { TableData } from "@/lib/types";

export default function R02ReturnedInspection({ orders, wf, dateField }: {
  orders: TableData["records"]; wf: WorkFields; dateField: string;
}) {
  const statusField = wf.status?.name ?? "檢核狀態";
  const returnedOrders = orders.filter((order) => {
    const status = order.fields[statusField];
    return typeof status === "string" && status.trim() === "已退回";
  });
  const returned = r02InspectionRows(returnedOrders, wf, dateField);
  const value = (n: number | null) => n === null ? "—" : formatNumber(n);
  return <section className="cg">
    <div className="cg-head"><div><h2>6. 雅雯檢核表｜退回狀態</h2>
      <p className="muted small">已退回 {returned.length} 張</p></div></div>
    {returned.length === 0 ? <p className="muted">目前範圍內無已退回工作單。</p> :
      <div className="cg-table"><table><thead><tr>{["工作單號", "工作日期", "填報人", "組別", "案件編號", "內業工項", "執行工作數量", "計價數量", "修改後數量", "營業額點數", "修改後營業額", "退回狀態", "退回原因"].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>
        {returned.map((r) => <tr key={r.id}><td>{r.workOrderNo || "—"}</td><td>{r.date || "—"}</td><td>{r.people || "—"}</td><td>{r.group || "—"}</td><td>{r.caseCode || "—"}</td><td>{r.workItem || "—"}</td><td>{value(r.executedQty)}</td><td>{value(r.pricingQty)}</td><td>{value(r.modifiedQty)}</td><td>{value(r.revenuePoints)}</td><td>{value(r.modifiedRevenue)}</td><td><span className="tag" style={{ background: "#fee2e2", color: "#991b1b" }}>已退回</span></td><td>{r.returnReason || "—"}</td></tr>)}
      </tbody></table></div>}
  </section>;
}
