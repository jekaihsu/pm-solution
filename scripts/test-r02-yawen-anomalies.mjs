import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import anomalyModule from '../components/R02Anomalies.tsx';
import sectionsModule from '../components/R02Sections.tsx';
import { blankRow, resolveWorkFields, resolvePersonScheduleFields } from '../lib/controlGroup.ts';

const Anomalies = anomalyModule.default ?? anomalyModule;
const Sections = sectionsModule.default ?? sectionsModule;
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const wf = resolveWorkFields(['工作單號', '檢核狀態', '⚠異常'].map(name => ({id:name,name,kind:'text'})), ['雅雯檢核']);

test('人員列、正常狀態與資料未齊提示', () => {
 const rows=[{...blankRow('人員'),orders:[{id:'o1',fields:{檢核狀態:'已退回 '}}]}];
 const html=render(Anomalies,{rows,wf});
 assert.match(html,/data-anomaly-person="人員"/);
 assert.match(html,/工作單被退回/);
 assert.doesNotMatch(html,/data-normal-groups/);
 assert.match(render(Anomalies,{}),/本週 0 人全部正常/);
 assert.match(render(Anomalies,{notes:['請假資料尚未就緒']}),/異常狀態待確認/);
});

test('第 2 項為出工效率、第 3 項為預排執行率，第 4、5 項保持後續順序', () => {
  const html = render(Sections, {rows:[],wf,dateField:'日期',sf:resolvePersonScheduleFields([]),start:Date.parse('2026-10-19T00:00:00+08:00'),end:Date.parse('2026-10-26T00:00:00+08:00'),projectProgress:React.createElement('h2',null,'4. 工程案件')});
  const headings = [...html.matchAll(/<h2>(.*?)<\/h2>/g)].map(m => m[1]);
  assert.match(headings[0], /^2\. 內業實際出工天/);
  assert.match(headings[1], /^3\. 預排案件/);
  assert.match(headings[2], /^4\./);
  assert.match(headings[3], /^5\./);
});

test('最多十人、每人三標籤，灰色資料待修保持可見且姓名不染紅', () => {
 const flags=resolveWorkFields(['檢核狀態','⚠案件不符'].map(name=>({id:name,name,kind:'text'})),[]);
 const rows=Array.from({length:12},(_,i)=>({...blankRow(`人員${i}`),orders:[{id:String(i),fields:{檢核狀態:'已退回','⚠案件不符':true}}]}));
 const attendance={people:rows.map(r=>({person:r.group,team:'控制',workDates:['2026-10-26','2026-10-27'],missingDates:['2026-10-28'],revenue:0,after1030Count:4}))};
 const html=render(Anomalies,{rows,wf:flags,attendance});
 assert.equal((html.match(/data-anomaly-person=/g)||[]).length,10);
 // 140.6：每人 4 個嚴重標籤全部顯示，資料待修排最後被收進「…」
 assert.equal((html.match(/data-rule=/g)||[]).length,40);
 assert.equal((html.match(/data-rule="repair"/g)||[]).length,0);
 assert.equal((html.match(/還有 2 個標籤/g)||[]).length,10);
 assert.match(html,/還有 2 人/);
 assert.match(html,/aria-expanded="false"/);
 assert.match(html,/<strong class="r02-anomaly-name">人員/);
 assert.doesNotMatch(html,/<details class="r02-anomaly-errors" open/);
});
