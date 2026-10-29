"use client";
import { buildInternalScheduleExecution, buildPersonAttendanceAndBackfill, type GroupRow, type WorkFields, type PersonScheduleFields } from "@/lib/controlGroup";
import R02Anomalies from "./R02Anomalies";
import React, { type ReactNode } from "react";
import type { TableData } from "@/lib/types";
import { formatNumber } from "@/lib/aggregate";
import { msToDateStr } from "@/lib/week";
import { sortR02Attendance } from "@/lib/r02AttendanceSort";
import { prepareR02Cases } from "@/lib/r02CaseNames";
const n=(x:number|null)=>x===null?"—":formatNumber(x);
function Table({heads,rows,wrapColumn}:{heads:string[];rows:(string|number)[][];wrapColumn?:number}) {return <div className="cg-table"><table><thead><tr>{heads.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j} style={j===wrapColumn?{whiteSpace:"normal",minWidth:220,maxWidth:320}:undefined}>{v}</td>)}</tr>)}</tbody></table></div>}
export default function R02Sections({rows,wf,dateField,sched,cost,cases,sf,start,end,leave={},roster=[],projectProgress,anomaliesOnly=false,anomalyNotes=[],comparisonReady,attendanceReady}:{comparisonReady?:boolean;attendanceReady?:boolean;anomaliesOnly?:boolean;anomalyNotes?:string[];projectProgress?:ReactNode;rows:GroupRow[];wf:WorkFields;dateField:string;sched?:TableData;cost?:TableData;cases?:TableData;sf:PersonScheduleFields;start:number;end:number;leave?:Record<string,Record<string,string>>;roster?:Array<{name:string;team:string}>}) {
 const caseInputs=prepareR02Cases(cases,sched?.records ?? [],rows.flatMap(r=>r.orders),{start,end,startField:sf.start?.name ?? "開始日期",endField:sf.end?.name ?? "結束日期"});
 const comparison=buildInternalScheduleExecution(caseInputs.schedule,caseInputs.work,sf,wf,start,end,undefined,caseInputs.caseNameByCode); const attendance=buildPersonAttendanceAndBackfill(rows,cost?.records ?? [],wf,dateField,msToDateStr(start),msToDateStr(Date.now()),leave,roster); const t=attendance.totals;
 if (anomaliesOnly) return <R02Anomalies rows={rows} wf={wf} comparison={comparison} attendance={attendance} notes={anomalyNotes} comparisonReady={comparisonReady} attendanceReady={attendanceReady} />;
 const cards=(items:[string,string|number][]) => <div className="kpis">{items.map(([label,value])=><div className="kpi" key={label}><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div></div>)}</div>;
 return <>
 <section className="cg"><h2>2. 內業實際出工天與營業額效率（僅展示內業｜基準 1 點/天＝100%）</h2><Table heads={["組別","人員","實際出工天","執行工作數量","當週營業額點數","日均營業額點數（點/天）","效率達標率（1點/天=100%）"]} rows={[...attendance.people.map(r=>[r.team,r.person,r.actualWorkDays,n(r.qty),n(r.revenue),n(r.dailyAvgRevenue),r.efficiencyRate===null?"—":`${n(r.efficiencyRate*100)}%`]),["","合計",t.actualWorkDays,n(t.totalQty),n(t.totalRevenue),n(t.dailyAvgRevenue),t.efficiencyRate===null?"—":`${n(t.efficiencyRate*100)}%`]]}/></section>
 <section className="cg"><h2>3. 預排案件與實際案件執行率・多增加的工作單件數</h2>
 {cards([["預排案件數",comparison.plannedCaseCount],["實際執行預排案件數",comparison.executedPlannedCaseCount],["預排案件執行率",comparison.executionRate===null?"—":`${n(comparison.executionRate*100)}%`],["多增加的工作單件數",comparison.extraWorkOrderCount]])}
 <Table wrapColumn={1} heads={["案件編號","工程名稱","預排人員","預排點數","是否執行","實際工作單數","實際執行數量","實際營業額點數"]} rows={comparison.plannedCases.map(r=>[r.caseCode,r.caseName || "—（待確認）",r.people.join("、"),n(r.plannedPoints),r.executed?"是":"否",r.actualOrders,n(r.actualQty),n(r.actualRevenue)])}/><details><summary>多增加的工作單明細（{comparison.extraWorkOrderCount}）</summary><Table heads={["工作單號","日期","組別","人員","案件／工編","內業工項","執行數量","營業額點數"]} rows={comparison.extraWorkOrders.map(r=>[r.orderNo,r.date,r.team,r.person,r.caseCode,r.item,n(r.qty),n(r.revenue)])}/></details><p className="muted">工程名稱依所選版本案件表；無法對應時留白；同工程有多筆相關案件時列出其名稱。</p></section>
 {projectProgress}
 <section className="cg"><h2>5. 內業有無出工、未填日報與次日 10:30 前補填件數</h2>
 {cards([["實際出工天",t.actualWorkDays],["未填日報天數（含缺填日）",t.missingReportDays],["次日 10:30 前補填件數",t.before1030Count],["超過次日 10:30 逾時補填件數",t.after1030Count]])}
 <Table heads={["組別","人員","實際出工天","未填日報天數（含缺填日）","次日 10:30 前補填件數","超過次日 10:30 逾時補填件數","出工日期"]} rows={sortR02Attendance(attendance.people).map(r=>[r.team,r.person,r.actualWorkDays,`${r.missingReportDays} (${r.missingDates.join("、") || "—"})`,r.before1030Count,r.after1030Count,r.workDates.join("、") || "—"])}/></section></>;
}
