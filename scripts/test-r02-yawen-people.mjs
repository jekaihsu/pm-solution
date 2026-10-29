import test from 'node:test';
import assert from 'node:assert/strict';
import { currentRosterRows } from '../lib/r02People.ts';
const row=(name,id,team,orders=[])=>({group:name,personId:id,team,key:`${team}|${id}`,orders,revenue:orders.length,revenueBlank:0,qty:0,pass:0,fail:0,unchecked:0,anomalyCount:0,items:[],anomalyKinds:new Map()});
test('section 1 uses active roster team, consolidates historical teams and rejects unknown and departed identities',()=>{
 const roster=[{id:'recA',fields:{姓名:'甲',所屬組別:'圖報A',在職:true}},{id:'recB',fields:{姓名:'乙',所屬組別:'控制',在職:false}}];
 const result=currentRosterRows([row('甲','recA','控制',[{}]),row('甲','recA','圖報A',[{}]),row('乙','recB','控制',[{}]),row('recUnknown','recUnknown','控制',[{}])],roster);
 assert.equal(result.rows.length,1); assert.equal(result.rows[0].team,'圖報A'); assert.equal(result.rows[0].orders.length,2); assert.equal(result.excluded,2);
});
test('a record id must not fall back to a matching name',()=>{
 const roster=[{id:'recA',fields:{姓名:'甲',所屬組別:'控制',在職:true}}];
 assert.equal(currentRosterRows([row('甲','recMissing','控制',[{}])],roster).rows.length,0);
});
test('duplicate active roster records merge only when identity and team are consistent',()=>{
 const person=(id,name,team,account)=>({id,fields:{姓名:name,所屬組別:team,在職:true},people:{Lark帳號:account?[{id:account,name}]:[]}});
 const same=[person('recA','甲','控制','account1'),person('recB','甲','控制','account1')];
 assert.equal(currentRosterRows([row('甲','recA','控制',[{}]),row('甲','recB','控制',[{}])],same).rows.length,1);
 const conflict=[same[0],person('recB','甲','控制','account2')];
 assert.equal(currentRosterRows([row('甲','recA','控制',[{}]),row('甲','recB','控制',[{}])],conflict).rows.length,2);
});
