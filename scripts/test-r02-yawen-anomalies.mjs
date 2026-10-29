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

test('異常組紅色展開在正常組之前，正常組預設收合，沿用工作單與出勤結果', () => {
  const rows = [
    {...blankRow('正常人員'), team:'正常組'},
    {...blankRow('異常人員'), team:'異常組', orders:[{id:'o1',fields:{工作單號:'WO1',檢核狀態:'已退回 ',退回原因:'數量確認'}}]},
  ];
  const html = render(Anomalies, {rows,wf,comparison:{extraWorkOrders:[{id:'o1'}]}, attendance:{people:[{team:'缺填組',person:'缺填人員',missingReportDays:1,missingDates:['2026-10-20'],after1030Count:0}]}});
  assert.match(html, /#991b1b/);
  assert.match(html, /已退回：數量確認/);
  assert.match(html, /多增加的工作單/);
  assert.match(html, /未填日報 1 天/);
  assert.ok(html.indexOf('data-anomaly-group') < html.indexOf('data-normal-groups'));
  assert.match(html, /<details[^>]*data-normal-groups[^>]*><summary>無異常的組別（1 組）/);
  assert.doesNotMatch(html, /<details[^>]*\bopen/);
});

test('零異常與零資料仍保留區塊；資料不完整不能斷言無異常或缺填', () => {
  const empty = render(Anomalies, {});
  assert.match(empty, /異常／需人工確認/);
  assert.match(empty, /目前範圍內無異常/);
  const pending = render(Anomalies, {notes:['請假資料尚未就緒'],attendance:{people:[{team:'控制',person:'測試',missingReportDays:5,missingDates:[],after1030Count:0}]}});
  assert.match(pending, /異常狀態待確認/);
  assert.doesNotMatch(pending, /目前範圍內無異常|未填日報 5 天/);
});

test('第 2 項為出工效率、第 3 項為預排執行率，第 4、5 項保持後續順序', () => {
  const html = render(Sections, {rows:[],wf,dateField:'日期',sf:resolvePersonScheduleFields([]),start:Date.parse('2026-10-19T00:00:00+08:00'),end:Date.parse('2026-10-26T00:00:00+08:00'),projectProgress:React.createElement('h2',null,'4. 工程案件')});
  const headings = [...html.matchAll(/<h2>(.*?)<\/h2>/g)].map(m => m[1]);
  assert.match(headings[0], /^2\. 內業實際出工天/);
  assert.match(headings[1], /^3\. 預排案件/);
  assert.match(headings[2], /^4\./);
  assert.match(headings[3], /^5\./);
});
