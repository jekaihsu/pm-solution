import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import componentModule from '../components/R02ReturnedInspection.tsx';
import { resolveWorkFields } from '../lib/controlGroup.ts';

test('雅雯檢核表只顯示已退回工作單與退回原因', () => {
  const R02ReturnedInspection = componentModule.default ?? componentModule;
  const fields = ['雅雯檢核', '檢核狀態', '退回原因'].map(name => ({ id: name, name, kind: 'text', primary: false }));
  const wf = resolveWorkFields(fields, ['雅雯檢核']);
  const orders = [
    { id: 'a', fields: { 工作單號: '退回單', 檢核狀態: '已退回 ', 退回原因: '數量錯誤' } },
    { id: 'b', fields: { 工作單號: '通過單', 雅雯檢核: true } },
    { id: 'c', fields: { 工作單號: '待檢單' } },
    { id: 'd', fields: { 工作單號: '不通過單', 雅雯檢核: '不通過', 檢核狀態: '待檢核' } },
    { id: 'e', fields: { 工作單號: '未知狀態單', 檢核狀態: '退回處理中' } },
  ];
  const html = renderToStaticMarkup(React.createElement(R02ReturnedInspection, { orders, wf, dateField: '工作日期' }));
  assert.match(html, /退回單/);
  assert.match(html, /數量錯誤/);
  assert.match(html, /#991b1b/);
  assert.doesNotMatch(html, /通過單|待檢單|不通過單|未知狀態單|已通過|待檢核/);
  const empty = renderToStaticMarkup(React.createElement(R02ReturnedInspection, { orders: orders.slice(1), wf, dateField: '工作日期' }));
  assert.match(empty, /無已退回工作單/);
});
