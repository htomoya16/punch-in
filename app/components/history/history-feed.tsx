"use client";
import {memo,useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {ChevronDown,Pencil} from "lucide-react";
import type {Category,Session} from "../../../lib/model";
import {historyDays} from "../../../lib/history";
import {duration,hms,readableDate} from "../../../lib/time";
import HistoryTimeline from "./history-timeline";
type Props={sessions:Session[];categories:Category[];noteDays:string[];from:string;to:string;includeNotes:boolean;range:boolean;now:number;openedDay?:string;onActiveDay(day:string):void;openNotes(day:string):void;onEdit(s:Session):void;renderRecords(rows:Session[]):ReactNode};
export default memo(function HistoryFeed({sessions,categories,noteDays,from,to,includeNotes,range,now,openedDay,onActiveDay,openNotes,onEdit,renderRecords}:Props){
  const groups=useMemo(()=>historyDays(sessions,noteDays,from,to,includeNotes,range),[sessions,noteDays,from,to,includeNotes,range]);
  const [limit,setLimit]=useState(5),[active,setActive]=useState(to),[rowLimits,setRowLimits]=useState<Record<string,number>>({});
  useEffect(()=>onActiveDay(active),[active,onActiveDay]);
  const selectionLock=useRef(0),alignmentTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [bottomSpace,setBottomSpace]=useState(24);
  useEffect(()=>()=>clearTimeout(alignmentTimer.current),[]);
  function selectDay(day:string){selectionLock.current=performance.now()+600;setActive(day);openNotes(day);clearTimeout(alignmentTimer.current);const align=()=>{if(matchMedia("(max-width:760px)").matches)return;const section=sections.current.get(day),header=sticky.current;if(section&&header)window.scrollBy({top:section.getBoundingClientRect().top-header.getBoundingClientRect().bottom-8,behavior:"instant" as ScrollBehavior});};requestAnimationFrame(()=>requestAnimationFrame(align));alignmentTimer.current=setTimeout(align,280);}
  const sticky=useRef<HTMLElement>(null),end=useRef<HTMLDivElement>(null),sections=useRef(new Map<string,HTMLElement>());
  const shown=groups.slice(0,limit),current=groups.find(g=>g.day===active)??groups[0];
  useEffect(()=>{setLimit(5);setActive(to);setRowLimits({});},[from,to,includeNotes]);
  useEffect(()=>{
    const last=shown.at(-1),section=last?sections.current.get(last.day):undefined;
    const update=()=>{const header=document.querySelector(".topbar")?.getBoundingClientRect().height??52;setBottomSpace(Math.max(24,Math.ceil(innerHeight-header-(sticky.current?.getBoundingClientRect().height??140)-(section?.getBoundingClientRect().height??0)-8)));};
    const observer=new ResizeObserver(update);if(section)observer.observe(section);if(sticky.current)observer.observe(sticky.current);window.addEventListener("resize",update);update();return()=>{observer.disconnect();window.removeEventListener("resize",update);};
  },[groups,limit]);
  useEffect(()=>{
    if(limit>=groups.length||!end.current)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))setLimit(n=>Math.min(n+5,groups.length));},{rootMargin:"500px"});observer.observe(end.current);return()=>observer.disconnect();
  },[limit,groups.length]);
  useEffect(()=>{
    let frame=0;
    const update=()=>{frame=0;if(performance.now()<selectionLock.current)return;const threshold=(sticky.current?.getBoundingClientRect().bottom??0)+18;let day=shown[0]?.day;for(const group of shown){const el=sections.current.get(group.day);if(el&&el.getBoundingClientRect().top<=threshold)day=group.day;else break;}if(day)setActive(old=>old===day?old:day);};
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
    window.addEventListener("scroll",schedule,{passive:true});window.addEventListener("resize",schedule);const resize=new ResizeObserver(schedule);if(sticky.current)resize.observe(sticky.current);schedule();
    return()=>{window.removeEventListener("scroll",schedule);window.removeEventListener("resize",schedule);resize.disconnect();cancelAnimationFrame(frame);};
  },[groups,limit]);
  return <section className="history-feed" aria-label="日付ごとの履歴"><header className="history-sticky" ref={sticky}><button className="history-active-day" onClick={()=>openNotes(current.day)} aria-label={`${current.day}のメモを開く`}><span>{readableDate(current.day)}</span><Pencil size={14}/></button><span className="history-active-total">{hms(current.sessions.reduce((sum,s)=>sum+duration(s,now),0))}</span><HistoryTimeline sessions={current.sessions} categories={categories} now={now} onEdit={onEdit}/></header><div className="history-days">{shown.map(group=><section key={group.day} className={`history-day ${active===group.day?"has-open-note":""}`} ref={el=>{if(el)sections.current.set(group.day,el);else sections.current.delete(group.day);}} data-history-day={group.day} aria-label={readableDate(group.day)}><button className="history-day-heading" onClick={()=>selectDay(group.day)} aria-label={`${group.day}のメモを開く`} aria-pressed={openedDay===group.day}><span>{readableDate(group.day)}</span><span className="history-day-total">{hms(group.sessions.reduce((sum,s)=>sum+duration(s,now),0))}<Pencil size={13}/></span></button>{group.sessions.length?renderRecords(group.sessions.slice(0,rowLimits[group.day]??40)):<p className="history-day-empty">記録がありません</p>}{group.sessions.length>(rowLimits[group.day]??40)&&<button className="more-button" onClick={()=>setRowLimits(v=>({...v,[group.day]:(v[group.day]??40)+40}))}>この日の記録をさらに表示</button>}</section>)}</div><div ref={end} className="history-feed-end" style={{paddingBottom:bottomSpace}}>{limit<groups.length&&<button className="text-button" onClick={()=>setLimit(n=>Math.min(n+5,groups.length))}><ChevronDown size={15}/>以前の記録を表示</button>}</div></section>;
});
