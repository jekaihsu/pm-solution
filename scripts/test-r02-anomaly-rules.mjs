import test from 'node:test';
import assert from 'node:assert/strict';
import {buildR02Anomalies,visibleTags,errorSummary} from '../lib/r02AnomalyRules.ts';
import {blankRow,resolveWorkFields} from '../lib/controlGroup.ts';
const person=(over={})=>({person:'甲',team:'控制',workDates:['2026-10-26','2026-10-27'],missingDates:[],actualWorkDays:2,missingReportDays:0,after1030Count:0,before1030Count:0,revenue:2,qty:1,...over});
const run=(p,extra={})=>buildR02Anomalies({attendance:{people:[person(p)]},...extra});
const tags=r=>r.people.flatMap(p=>p.tags);
const severity=(p,rule)=>tags(run(p)).find(t=>t.rule===rule)?.severity;
test('missing ≥1; late 2/4; efficiency 80/60 strict boundaries; zero revenue ≥2 days',()=>{
 assert.equal(severity({missingDates:['2026-10-28']},'missing'),2);
 for(const [n,s] of [[1,undefined],[2,1],[3,1],[4,2]]) assert.equal(severity({after1030Count:n},'late'),s);
 for(const [n,s] of [[1.6,undefined],[1.59,1],[1.2,1],[1.19,2]]) assert.equal(severity({revenue:n},'efficiency'),s);
 assert.equal(severity({revenue:0},'zeroRevenue'),2);
 assert.equal(severity({revenue:0,workDates:['2026-10-26']},'zeroRevenue'),undefined);
 assert.equal(severity({workDates:[],revenue:0},'efficiency'),undefined);
});
const comparison=(over={})=>({plannedCases:[],plannedCaseCount:3,executedPlannedCaseCount:1,executionRate:1/3,extraWorkOrders:[],...over});
test('execution uses minimum 3 cases and strictly below 60%; deviations strictly >40%, negative >60%',()=>{
 for(const [count,rate,hit] of [[2,.2,false],[3,.6,false],[3,.59,true]]) assert.equal(buildR02Anomalies({comparison:comparison({plannedCaseCount:count,executionRate:rate})}).shared.some(p=>p.tags.some(t=>t.rule==='execution')),hit);
 for(const [actual,s] of [[6,undefined],[14,undefined],[5.9,1],[4,1],[3.9,2],[14.1,1],[0,2]]) {
  const r=buildR02Anomalies({comparison:comparison({plannedCases:[{caseCode:'C123456',people:[],plannedPoints:10,actualRevenue:actual}]})});
  assert.equal(r.shared.flatMap(p=>p.tags).find(t=>t.rule==='deviation')?.severity,s);
 }
});
test('neutral extras ≥3, returned warning, data errors counted uniquely and separately',()=>{
 const wf=resolveWorkFields(['檢核狀態','⚠組別權重=0','⚠案件不符'].map(name=>({id:name,name,kind:'text'})),[]);
 const orders=[0,1,2].map(id=>({id:String(id),fields:{檢核狀態:'已退回 ', '⚠組別權重=0':true,'⚠案件不符':true}}));
 const r=buildR02Anomalies({rows:[{...blankRow('甲'),orders}],wf,comparison:comparison({extraWorkOrders:orders})});
 assert.equal(r.errorCount,3); assert.deepEqual(r.errorCategories.map(c=>c.count),[3,3]);
 assert.equal(r.people[0].dataRepair,true); assert.equal(tags(r).find(t=>t.rule==='extra').severity,0);
 assert.equal(tags(r).find(t=>t.rule==='returned').severity,1);
 assert.equal(tags(r).length,2);
});
test('due dates use contract end only, include today/14 days, exclude overdue/15 days regardless of remaining',()=>{
 const records=['2026-10-28','2026-10-29','2026-11-12','2026-11-13'].map((date,i)=>({id:String(i),fields:{工程編號:`C12345${i}`,契約迄日:date,剩餘額度:0}}));
 const r=buildR02Anomalies({today:'2026-10-29',dueCases:{records}});
 assert.equal(r.shared.length,2); assert.ok(r.shared.every(p=>p.tags[0].severity===2));
});
test('one person across teams, work dates deduplicated, severity then tag count; readiness suppresses unconfirmed rules',()=>{
 const r=buildR02Anomalies({attendance:{people:[person({revenue:.5}),person({revenue:.5,team:'報告'}),person({person:'乙',missingDates:['2026-10-28'],after1030Count:4}),person({person:'丙',revenue:1.3})]}});
 assert.equal(r.totalPeople,3); assert.deepEqual(r.people.map(p=>p.name),['乙','甲','丙']);
 assert.match(r.people[1].tags[0].text,/50%/);
 assert.equal(tags(run({missingDates:['2026-10-28'],revenue:0},{attendanceReady:false})).length,0);
 assert.equal(buildR02Anomalies({comparison:comparison(),comparisonReady:false}).shared.length,0);
});
test('data errors alone stay out of the management list',()=>{
 const wf=resolveWorkFields([{id:'f',name:'⚠案件不符',kind:'text'}],[]);
 const r=buildR02Anomalies({rows:[{...blankRow('甲'),orders:[{id:'o',fields:{'⚠案件不符':true}}]}],wf});
 assert.equal(r.people.length,0); assert.equal(r.errorCount,1); assert.equal(r.totalPeople,1);
});
test('error summary counts work orders and error items separately',()=>{
 const wf=resolveWorkFields(['⚠組別權重=0','⚠案件不符'].map(name=>({id:name,name,kind:'text'})),[]);
 const orders=[{id:'a',fields:{'⚠組別權重=0':true,'⚠案件不符':true}},{id:'b',fields:{'⚠組別權重=0':true}}];
 const r=buildR02Anomalies({rows:[{...blankRow('甲'),orders}],wf});
 assert.equal(r.errorCount,2); assert.equal(r.errorItemCount,3);
 assert.match(errorSummary(r),/^工作單資料錯誤：2 張工作單、共 3 項錯誤（一張可能有多項），/);
});
test('severe tags always shown, repair last, people sorted by severe count',()=>{
 const t=(severity,rule='x')=>({rule,severity,text:rule});
 const v=visibleTags([t(0,'i1'),t(1,'w1'),t(1,'w2'),t(0,'repair'),t(2,'s1')]);
 assert.deepEqual(v.shown.map(x=>x.rule),['s1','w1','w2']); assert.equal(v.hidden,2);
 const many=visibleTags([t(2,'a'),t(2,'b'),t(2,'c'),t(2,'d'),t(1,'w'),t(0,'repair')]);
 assert.equal(many.shown.filter(x=>x.severity===2).length,4); assert.ok(!many.shown.some(x=>x.rule==='repair'));
 assert.equal(visibleTags([t(0,'repair'),t(0,'i')]).shown.at(-1).rule,'repair');
 const r=buildR02Anomalies({attendance:{people:[person({person:'乙',after1030Count:2}),person({person:'丙',revenue:0,missingDates:['2026-10-28']})]}});
 assert.equal(r.people[0].name,'丙');
});
