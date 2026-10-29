import { anomalies, type GroupRow, type WorkFields, type buildInternalScheduleExecution, type buildPersonAttendanceAndBackfill } from './controlGroup';
import { projectDueDates, isDueSoon, taipeiDate } from './r02ProjectDates';
import type { TableData } from './types';

export type AnomalyTag = { rule: string; severity: number; text: string };
export type AnomalyPerson = { name: string; tags: AnomalyTag[]; dataRepair: boolean };
export type AnomalyInput = {
  rows?: GroupRow[]; wf?: WorkFields;
  comparison?: ReturnType<typeof buildInternalScheduleExecution>;
  attendance?: ReturnType<typeof buildPersonAttendanceAndBackfill>;
  comparisonReady?: boolean; attendanceReady?: boolean;
  dueCases?: TableData; today?: string;
};
const percent = (v: number) => Number((v * 100).toFixed(1));
export function buildR02Anomalies({rows = [], wf, comparison, attendance, comparisonReady = true, attendanceReady = true, dueCases, today = taipeiDate(Date.now())}: AnomalyInput) {
  const people = new Map<string, AnomalyPerson>();
  const person = (name: string) => { if (!people.has(name)) people.set(name, {name, tags: [], dataRepair:false}); return people.get(name)!; };
  const add = (p: AnomalyPerson, rule: string, severity: number, text: string) => p.tags.push({rule,severity,text});
  const errors = new Map<string, Set<string>>(), errorIds = new Set<string>();
  const returned = new Map<string, Set<string>>(), extras = new Map<string, Set<string>>();
  const extraIds = new Set(comparison?.extraWorkOrders.map(o=>o.id));
  for (const row of rows) {
    const p = person(row.group);
    for (const order of row.orders) {
      if (wf) {
        for (const label of anomalies(order,wf).filter(label=>!/補填/.test(label))) {
          if (!errors.has(label)) errors.set(label,new Set());
          errors.get(label)!.add(order.id); errorIds.add(order.id); p.dataRepair=true;
        }
        if (String(order.fields[wf.status?.name ?? '檢核狀態'] ?? '').trim() === '已退回') {
          if (!returned.has(p.name)) returned.set(p.name,new Set()); returned.get(p.name)!.add(order.id);
        }
      }
      if (comparisonReady && extraIds.has(order.id)) {
        if (!extras.has(p.name)) extras.set(p.name,new Set()); extras.get(p.name)!.add(order.id);
      }
    }
  }
  // Merge cross-team person rows using date sets, so neither days nor missing days double count.
  const attendanceByPerson = new Map<string, NonNullable<AnomalyInput['attendance']>['people']>();
  for (const a of attendance?.people ?? []) {person(a.person); const list=attendanceByPerson.get(a.person) ?? []; list.push(a); attendanceByPerson.set(a.person,list);}
  for (const [name, list] of attendanceByPerson) {
    if (!attendanceReady) continue;
    const p=person(name), dates=new Set(list.flatMap(a=>a.workDates)), missing=new Set(list.flatMap(a=>a.missingDates).filter(d=>!dates.has(d)));
    const days=dates.size, revenue=list.reduce((s,a)=>s+a.revenue,0), late=list.reduce((s,a)=>s+a.after1030Count,0), efficiency=days ? revenue/days : null;
    if (missing.size>=1) add(p,'missing',2,`未填日報 ${missing.size} 天`);
    if (late>=2) add(p,'late',late>=4?2:1,`逾時補填 ${late} 次`);
    if (efficiency!==null && efficiency<0.8) add(p,'efficiency',efficiency<0.6?2:1,`效率達標率 ${percent(efficiency)}%`);
    if (days>=2 && revenue===0) add(p,'zeroRevenue',2,`有出工 ${days} 天，營業額 0 點`);
  }
  for (const [name,ids] of returned) add(person(name),'returned',1,`工作單被退回 ${ids.size} 件`);
  for (const [name,ids] of extras) if(ids.size>=3) add(person(name),'extra',0,`未預排加做工作單 ${ids.size} 件`);
  const shared: AnomalyPerson[]=[];
  if (comparisonReady && comparison) {
    // Existing execution results are case-level, not person execution results.
    if (comparison.plannedCaseCount>=3 && comparison.executionRate!==null && comparison.executionRate<0.6) shared.push({name:'整體預排',dataRepair:false,tags:[{rule:'execution',severity:1,text:`預排 ${comparison.plannedCaseCount} 案，執行 ${comparison.executedPlannedCaseCount} 案（${percent(comparison.executionRate)}%）`}]});
    for (const c of comparison.plannedCases) {
      if (!(c.plannedPoints>0)) continue;
      const diff=(c.actualRevenue-c.plannedPoints)/c.plannedPoints;
      if (Math.abs(diff)<=0.4+1e-10) continue;
      const tag={rule:'deviation',severity:diff < -0.6-1e-10?2:1,text:`案件 ${c.caseCode} 實際 ${Number(c.actualRevenue.toFixed(2))} 點，較預排${diff<0?'少':'多'} ${percent(Math.abs(diff))}%`};
      if(c.people.length===1 && people.has(c.people[0])) person(c.people[0]).tags.push(tag);
      else shared.push({name:`案件 ${c.caseCode}`,dataRepair:false,tags:[tag]});
    }
  }
  // The existing contract projection has no reliable PM field. Never infer ownership from work orders.
  for(const [code,dates] of projectDueDates(dueCases?.records ?? [])) if(isDueSoon(dates,today,14)) shared.push({name:`案件 ${code}`,dataRepair:false,tags:[{rule:'due',severity:2,text:`契約 ${dates.filter(d=>isDueSoon([d],today,14)).join('、')} 到期（14 天內）`}]});
  const severity=(p:AnomalyPerson)=>Math.max(0,...p.tags.map(t=>t.severity));
  const severeCount=(p:AnomalyPerson)=>p.tags.filter(t=>t.severity===2).length;
  const sort=(a:AnomalyPerson,b:AnomalyPerson)=>severeCount(b)-severeCount(a)||severity(b)-severity(a)||(b.tags.length+Number(b.dataRepair))-(a.tags.length+Number(a.dataRepair))||a.name.localeCompare(b.name,'zh-Hant');
  for(const p of people.values()) p.tags.sort((a,b)=>b.severity-a.severity);
  return {people:[...people.values()].filter(p=>p.tags.length).sort(sort),shared:shared.sort(sort),totalPeople:people.size,errorCount:errorIds.size,errorItemCount:[...errors.values()].reduce((n,ids)=>n+ids.size,0),errorCategories:[...errors].map(([label,ids])=>({label,count:ids.size}))};
}

export function visibleTags(tags:AnomalyTag[],max=3):{shown:AnomalyTag[];hidden:number}{
  const ordered=[...tags].sort((a,b)=>Number(a.rule==='repair')-Number(b.rule==='repair')||b.severity-a.severity);
  const limit=Math.max(max,ordered.filter(t=>t.severity===2&&t.rule!=='repair').length);
  return {shown:ordered.slice(0,limit),hidden:Math.max(0,ordered.length-limit)};
}
export function errorSummary(r:{errorCount:number;errorItemCount:number;errorCategories:{label:string;count:number}[]}):string{
  return `工作單資料錯誤：${r.errorCount} 張工作單、共 ${r.errorItemCount} 項錯誤（一張可能有多項），${r.errorCategories.map(c=>`${c.label} ${c.count} 項`).join('、')}`;
}
