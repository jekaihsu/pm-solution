"use client";
import React, { useState } from "react";
import { buildR02Anomalies, visibleTags, errorSummary, type AnomalyInput, type AnomalyPerson, type AnomalyTag } from "@/lib/r02AnomalyRules";

type Props = AnomalyInput & { notes?: string[]; onInspectPerson?: (name:string)=>void };
function Tag({tag}:{tag:AnomalyTag}) {
  return <span data-rule={tag.rule} data-severity={tag.severity}>{tag.text.split(/(\d+(?:\.\d+)?)/g).map((part,i)=>i%2 ? <strong key={i} style={{color:tag.severity ? '#b91c1c' : 'inherit',fontWeight:600}}>{part}</strong> : part)}</span>;
}
function PersonLine({person,onInspect}:{person:AnomalyPerson;onInspect?:()=>void}) {
  const [expanded,setExpanded]=useState(false);
  const tags:AnomalyTag[]=[...person.tags];
  if (person.dataRepair) tags.push({rule:'repair',severity:0,text:'資料待修'});
  const vis=visibleTags(tags);
  const severe=person.tags.some(t=>t.severity===2), warning=person.tags.some(t=>t.severity===1);
  return <li className="r02-anomaly-line" data-anomaly-person={person.name}>
    <span aria-label={severe?'嚴重':warning?'提醒':'資訊'}>{severe?'●':warning?'○':'·'}</span>
    <strong className="r02-anomaly-name">{person.name}</strong>
    <div className="r02-anomaly-sentence">{(expanded?[...vis.shown,...tags.filter(t=>!vis.shown.includes(t))]:vis.shown).map((tag,i)=><React.Fragment key={`${tag.rule}-${i}`}>{i>0 && <span className="r02-anomaly-separator"> ｜ </span>}<span style={tag.rule==='repair'?{color:'#64748b',background:'#f1f5f9',padding:'3px 8px',borderRadius:4}:undefined}><Tag tag={tag}/></span></React.Fragment>)}{vis.hidden>0 && <button type="button" aria-label={expanded?'收合標籤':`${person.name} 還有 ${vis.hidden} 個標籤`} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'收合':'…'}</button>}</div>
    {onInspect && <button className="r02-anomaly-action" type="button" onClick={onInspect}>看工作單</button>}
  </li>;
}
export default function R02Anomalies({onInspectPerson,notes=[],comparisonReady=notes.length===0,attendanceReady=notes.length===0,...props}:Props) {
  const [expanded,setExpanded]=useState(false);
  const result=buildR02Anomalies({...props,comparisonReady,attendanceReady});
  const empty=!result.people.length&&!result.shared.length;
  return <section className="cg r02-anomalies" aria-label="異常／需人工確認">
    {empty&&!notes.length ? <p>本週 {result.totalPeople} 人全部正常</p> : <>
      <h2>本週需要你看的（{result.people.filter(p=>p.tags.length).length} 人）</h2>
      <p className="r02-anomaly-legend">● 嚴重　○ 提醒　· 資訊</p>
      {notes.map(note=><p key={note} role="status">{note}</p>)}
      {empty&&notes.length>0&&<p>資料未齊，異常狀態待確認。</p>}
      <ul className="r02-anomaly-list">{(expanded?result.people:result.people.slice(0,10)).map(p=><PersonLine key={p.name} person={p} onInspect={onInspectPerson && props.rows?.some(r=>r.group===p.name && r.orders.length) ? ()=>onInspectPerson(p.name) : undefined}/>)}</ul>
      {result.people.length>10&&<button type="button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'收合人員':`還有 ${result.people.length-10} 人`}</button>}
      {result.shared.length>0&&<details className="r02-anomaly-shared" open><summary>整體／案件提醒（{result.shared.length} 項；未指定個人）</summary><ul className="r02-anomaly-list">{result.shared.map((p,i)=><PersonLine key={i} person={p}/>)}</ul></details>}
    </>}
    {result.errorCount>0&&<details className="r02-anomaly-errors"><summary>{errorSummary(result)} — 工程處理</summary><p>同一張工作單可能同時有多項錯誤。資料待修者的效率與營業額需一併確認。</p></details>}
  </section>;
}
