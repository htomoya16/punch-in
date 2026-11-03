import {participation} from "../../../lib/work";
"use client";
import {memo,useMemo,type CSSProperties} from "react";
import type {Category,Session} from "../../../lib/model";
import {clock,dayStartLabel,duration,fromTimeInput,hoursMinutes,wallParts} from "../../../lib/time";
export default memo(function HistoryTimeline({sessions,categories,now,onEdit}:{sessions:Session[];categories:Category[];now:number;onEdit(s:Session):void}){
  const model=useMemo(()=>{
    if(!sessions.length)return null;
    const sorted=[...sessions].sort((a,b)=>a.startedAt-b.startedAt);
    const origins=sorted.map(s=>{try{return fromTimeInput(`${s.businessDay}T${dayStartLabel(s.dayStart)}:00`,s.timezone);}catch{return s.startedAt;}});
    const origin=Math.min(...origins),rows=new Map<string,{session:Session;start:number;end:number|null;index:number}[]>();
    for(const s of sorted)for(const interval of participation(s)){const row=rows.get(interval.categoryId)??[];row.push({session:s,...interval});rows.set(interval.categoryId,row);}
    return{origin,zone:sorted[0].timezone,rows:[...rows]};
  },[sessions]);
  if(!model)return <div className="history-empty-timeline">記録がありません</div>;
  const {origin,zone,rows}=model,width=Math.ceil(Math.max(24,...sessions.map(s=>((s.endedAt??now)-origin)/3600000))/6)*6;
  return <div className="history-timeline-scroll" aria-label="表示中の日のタイムライン" tabIndex={0}><div className="timeline history-timeline"><div className="timeline-axis"><span/>{Array.from({length:5},(_,i)=>{const stamp=origin+width/4*i*3600000,days=Math.round((Date.parse(wallParts(stamp,zone).date)-Date.parse(wallParts(origin,zone).date))/86400000);return <span key={i} style={{"--axis-ratio":i/4} as CSSProperties}>{clock(stamp,zone)}{days>0&&<small> +{days}</small>}</span>;})}</div>{rows.map(([id,records])=>{const category=categories.find(c=>c.id===id);return <div className="timeline-row" key={id}><span title={category?.name}>{category?.name??"削除済み"}</span><div className="timeline-track">{records.map(({session:s,start:begin,end:finish,index})=>{const start=(begin-origin)/3600000,end=((finish??now)-origin)/3600000;return <button key={`${s.id}:${index}`} className={finish===null?"running-bar":""} onClick={()=>onEdit(s)} aria-label={`${category?.name??"作業"} ${clock(begin,s.timezone)}から${finish===null?"計測中":clock(finish,s.timezone)} ${hoursMinutes((finish??now)-begin)}`} title={`${clock(begin,s.timezone)} — ${finish===null?"計測中":clock(finish,s.timezone)}`} style={{left:`${start/width*100}%`,width:`${Math.max(.6,(end-start)/width*100)}%`,background:category?.color}}/>;})}</div></div>;})}</div></div>;
});
