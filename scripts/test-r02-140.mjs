import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkFields, r02InspectionRows, errorRate, groupRows, WORK_FIELDS } from '../lib/controlGroup.ts';

test('內業執行數量與已退回檢核列', () => {
  const fields = ['雅雯檢核', '檢核狀態', '執行工作數量', '計價數量', '修改後數量', '退回原因'].map(name => ({ id: name, name, kind: 'text', primary: false }));
  const records = [{ id: 'a', fields: { 檢核狀態: '已退回 ', 執行工作數量: 3, 計價數量: 2, 修改後數量: 0, 退回原因: '數量有誤' } }, { id: 'b', fields: { 雅雯檢核: true, 計價數量: 4 } }, { id: 'c', fields: {} }];
  const wf = resolveWorkFields(fields, ['雅雯檢核']);
  const rows = r02InspectionRows(records, wf, '工作日期');
  assert.deepEqual(rows.map(r => r.reviewStatus), ['已退回', '已通過', '待檢核']);
  assert.equal(rows[0].executedQty, 3);
  assert.equal(rows[0].modifiedQty, 0);
  assert.equal(rows[0].returnReason, '數量有誤');
  assert.equal(rows[1].executedQty, 4);
  assert.equal(rows[2].executedQty, null);
  assert.equal(errorRate(groupRows(records, wf, new Map())[0]), 0.5);
  for (const name of ['執行工作數量', '修改後數量', '對外計價數量', '計價數量', '雅雯檢核', '品管檢核', '檢核狀態', '退回原因', '檢核時間']) assert.ok(WORK_FIELDS.includes(name));
});

import { buildDailyPersonRevenue, buildInternalScheduleExecution, buildPersonAttendanceAndBackfill, buildV4ProjectProgress, resolvePersonScheduleFields, blankRow } from '../lib/controlGroup.ts';
const field = (name,kind='text') => ({id:name,name,kind,primary:false});
const start=Date.parse('2026-10-19T00:00:00+08:00'), end=start+7*86400000;
const wf=resolveWorkFields([field('案件編號'),field('執行工作數量','number'),field('最終營業額點數','number')]);
const rec=(id,fields,links)=>({id,fields,...(links?{links}:{})});
const order=rec('o',{案件編號:'C115264-1',執行工作數量:2,最終營業額點數:2,工作日期:start,填報人:'小明',組別:'控制'});
const row={...blankRow('小明'),team:'控制',orders:[order],qty:2,revenue:2};
const sf=resolvePersonScheduleFields([field('開始日期','date'),field('結束日期','date'),field('人員'),field('條類型'),field('業別'),field('組別'),field('案件')]);
test('每日營業額以台北日期分桶',()=>{
 const orders=[]; for(let i=0;i<7;i++){const day=`2026-10-${19+i}`;orders.push(rec(`s${i}`,{工作日期:day,最終營業額點數:1}),rec(`n${i}`,{工作日期:start+i*86400000,最終營業額點數:2}));}
 const result=buildDailyPersonRevenue([{...row,orders}],wf,'工作日期','2026-10-19'); assert.deepEqual(result.grandDays,[3,3,3,3,3,3,3]);
});
test('預排案件比對子案與未預排工作單',()=>{const schedule=[rec('s',{開始日期:start,人員:'小明',條類型:'出工',業別:'內業',組別:'控制',案件:'C115264'})];const result=buildInternalScheduleExecution(schedule,[order,rec('other',{...order.fields,案件編號:'C115999'})],sf,wf,start,end);assert.equal(result.plannedCaseCount,1);assert.equal(result.executionRate,1);assert.equal(result.extraWorkOrderCount,1);assert.equal(result.plannedCases[0].actualQty,2)});
test('內業效率與日報次日 10:30 邊界',()=>{for(const [time,before,after] of [['10:29',1,0],['10:30',1,0],['10:31',0,1]]) {const r={...row,orders:[rec('o',{...order.fields,填報時間:Date.parse(`2026-10-20T${time}:00+08:00`)})]};const x=buildPersonAttendanceAndBackfill([r,{...r,team:'測量'}],[],wf,'工作日期','2026-10-19','2026-10-23').people;assert.equal(x.length,1);assert.equal(x[0].before1030Count,before);assert.equal(x[0].after1030Count,after);assert.equal(x[0].missingReportDays,4);assert.equal(x[0].efficiencyRate,2)}});
test('V4 點數優先並以工天備援',()=>{const cases=[rec('c',{工程編號:'C115264',控制總工天:40}),rec('c2',{工程編號:'C115265',控制總工天:12})];const items=[rec('i',{工編號碼:'C115264',控制數量:10,預期營業額點數:15,控制預估工天:20}),rec('i2',{工編號碼:'C115265',控制預估工天:0})];const reports=[rec('r',{所屬案件:'C115264',工項類別:'控制',標準點數:10},{對應合約明細:['i']})];const result=buildV4ProjectProgress(cases,items,reports,[order]);const p=result.allProjects.find(x=>x.caseCode==='C115264');assert.equal(p.contractRevenue,10);assert.equal(p.items[0].contractRevenue,10);assert.equal(p.remainingQty,8);assert.equal(p.remainingRevenue,8);assert.equal(result.allProjects.find(x=>x.caseCode==='C115265').contractRevenue,12);const expected=buildV4ProjectProgress([],items,[],[]).allProjects.find(x=>x.caseCode==='C115264');assert.equal(expected.contractRevenue,15);assert.equal(expected.items[0].contractRevenue,15);});

import { attendanceLeaveDays, leaveDaysByPerson } from '../lib/attendanceCore.ts';
test('出勤 API 姓名格式串接 R02：全日與各種半日假排除未填日報', () => {
  for (const half of ['leave-half', 'leave-half-late', 'leave-half-early', 'leave-half-late-early', 'leave-half-lack', 'leave-half-nofield', 'leave-half-open']) {
    const view = {
      days: Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${19 + i}`, kind: 'past' })),
      people: [
        { name: '小明', group: '控制', days: ['leave', half, 'trip', 'out', 'lack', 'off', 'future'] },
        { name: '小華', group: '圖報A', days: ['ok', 'late', 'early', 'none', 'nofield', 'off', 'off'] },
      ],
      records: [{ reason: 'private HR detail' }],
    };
    // JSON round trip is the exact route payload consumed by GroupBoard.
    const response = JSON.parse(JSON.stringify(attendanceLeaveDays(view)));
    assert.deepEqual(response, { status: 'ok', days: { 小明: [
      { date: '2026-10-19', kind: 'full' }, { date: '2026-10-20', kind: 'half' },
    ] } });
    const rows = [{ ...row, personId: 'rec-not-the-name', orders: [], revenue: 0, qty: 0 }];
    const baseline = buildPersonAttendanceAndBackfill(rows, [], wf, '工作日期', '2026-10-19', '2026-10-23');
    assert.equal(baseline.people[0].missingReportDays, 5);
    const result = buildPersonAttendanceAndBackfill(rows, [], wf, '工作日期', '2026-10-19', '2026-10-23', leaveDaysByPerson(response.days));
    assert.deepEqual(result.people[0].missingDates, ['2026-10-21', '2026-10-22', '2026-10-23']);
    assert.equal(result.people[0].missingReportDays, 3);
    assert.equal(result.totals.missingReportDays, 3);
  }
});

// Exercise the actual component boundary: formatDate is display-only (YYYY/MM/DD).
// The old component passed it into isoOffset, producing YYYY/MM/DDT00:00:00Z
// and throwing RangeError after the first successful source response.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import R02SectionsModule from '../components/R02Sections.tsx';
// tsx exposes CommonJS TSX default exports through a namespace in this Node environment.
const R02Sections = R02SectionsModule.default ?? R02SectionsModule;
globalThis.React = React;
test('R02 loaded component renders ISO dates without the page-wide Invalid time value crash', () => {
  const html = renderToStaticMarkup(React.createElement(R02Sections, {
    rows: [row], wf, dateField: '工作日期', sf, start, end,
  }));
  assert.ok(html.includes('內業實際出工天'));
  assert.ok(html.includes('2026-10-19'));
  assert.ok(!html.includes('NaN'));
});

test('R02 date helpers accept both YYYY-MM-DD and YYYY/MM/DD without throwing Invalid time value', () => {
  const orders = [];
  for (let i = 0; i < 7; i++) {
    const day = `2026-10-${19 + i}`;
    orders.push(rec(`s${i}`, { 工作日期: day, 最終營業額點數: 1 }), rec(`n${i}`, { 工作日期: start + i * 86400000, 最終營業額點數: 2 }));
  }
  const dailySlash = buildDailyPersonRevenue([{ ...row, orders }], wf, '工作日期', '2026/10/19');
  const dailyDash = buildDailyPersonRevenue([{ ...row, orders }], wf, '工作日期', '2026-10-19');
  assert.deepEqual(dailySlash.grandDays, [3, 3, 3, 3, 3, 3, 3]);
  assert.deepEqual(dailySlash.grandDays, dailyDash.grandDays);

  const attSlash = buildPersonAttendanceAndBackfill([row], [], wf, '工作日期', '2026/10/19', '2026/10/23').people;
  assert.equal(attSlash.length, 1);
  assert.equal(attSlash[0].missingReportDays, 4);
});
