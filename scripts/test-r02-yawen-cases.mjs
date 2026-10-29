import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareR02Cases } from '../lib/r02CaseNames.ts';
import { buildInternalScheduleExecution } from '../lib/controlGroup.ts';
const rec=(id,fields,links)=>({id,fields,links});
const cases={records:[rec('case1',{'案件編號':'C115264-1','案件名稱':'正確工程名稱'}),rec('case2',{'案件編號':'C115999','案件名稱':'另一工程'})]};
const start=Date.parse('2026-10-19T00:00:00+08:00'), end=Date.parse('2026-10-26T00:00:00+08:00');
const sf={start:{name:'開始日期'},end:{name:'結束日期'},trade:{name:'業別'},group:{name:'組別'}};
const wf={};
test('以案件記錄 ID 對照案件表名稱及工編',()=>{
  const s=rec('s',{'開始日期':start,'業別':'內業','組別':'控制','案件':['rec-case-title']},{'案件':['case1']});
  const w=rec('w',{'所屬案件':['rec-case-title']},{'所屬案件':['case1']});
  const input=prepareR02Cases(cases,[s],[w]);
  const output=buildInternalScheduleExecution(input.schedule,input.work,sf,wf,start,end,undefined,input.caseNameByCode);
  assert.equal(output.plannedCases[0].caseCode,'C115264');
  assert.equal(output.plannedCases[0].caseName,'正確工程名稱');
  assert.equal(output.plannedCases[0].actualOrders,1);
});
test('未對應或名稱不唯一留白，不從預排標題猜測',()=>{
  const input=prepareR02Cases({records:[...cases.records,rec('duplicate',{'案件編號':'C115264-2','案件名稱':'不同名稱'})]},[rec('s',{'案件':'C115264 誤導標題'}),rec('s2',{'案件':'C115777 假名稱'})],[]);
  assert.equal(input.caseNameByCode.get('C115264'),'');
  assert.equal(input.caseNameByCode.get('C115777'),'');
});
test('V4 使用工程名稱',()=>{
  const input=prepareR02Cases({records:[rec('v4',{'工程編號':'C115111','工程名稱':'V4 工程'})]},[rec('s',{'案件':'C115111'})],[]);
  assert.equal(input.caseNameByCode.get('C115111'),'V4 工程');
});
