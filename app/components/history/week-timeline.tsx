'use client';
import DurationValue from '../time/duration-value';
import {memo,useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {Minus,Plus} from 'lucide-react';
import type {Category,Session} from '../../../lib/model';
import {hoursMinutes,clock,dayStartLabel,readableDate} from '../../../lib/time';
import {buildWeekTimeline,weekDayTotal,type WeekTimelineDay} from '../../../lib/week-timeline';
type Props={anchor:string;categoryFilter:string;activeDay:string;sessions:Session[];categories:Category[];dayStart:number;timezone:string;now:number;onDay(day:string):void;onEdit(session:Session):void};
type DayProps={day:WeekTimelineDay;active:boolean;now:number;categoryMap:ReadonlyMap<string,Category>;timezone:string;onDay:Props['onDay'];onEdit:Props['onEdit']};
const ZOOMS=[1,2,3,4,6,8,12,24];
const DayRow=memo(function DayRow({day,active,now,categoryMap,timezone,onDay,onEdit}:DayProps){
  const candidates=day.segments.filter(p=>p.start<now),visible=candidates.filter(p=>p.lane<3).slice(0,160),extra=candidates.length-visible.length,total=weekDayTotal(day,now);
  return <div className={`week-timeline-day ${active?'is-current':''}`} data-timeline-day={day.day} style={{'--lanes':Math.max(1,...visible.map(p=>p.lane+1))} as CSSProperties}>
    <button className="week-timeline-date" aria-label={`${day.day}の履歴へ移動`} aria-current={active?'date':undefined} title={`${clock(day.start,timezone)} — 翌${clock(day.end,timezone)}`} onClick={()=>onDay(day.day)}>{readableDate(day.day).replace('月','/').replace('日','')}</button>
    <div className="week-timeline-track">{visible.map(p=>{
      const category=categoryMap.get(p.categoryId),finish=Math.min(p.end,now),left=(p.start-day.start)/(day.end-day.start),width=Math.max(0,(finish-p.start)/(day.end-day.start)),label=`${category?.name??'削除済み'} ${clock(p.start,timezone)} — ${p.running&&now<day.end?'計測中':clock(finish,timezone)}`;
      return <button key={p.key} className={`week-timeline-bar ${p.running&&now<day.end?'is-running':''}`} style={{left:`${left*100}%`,width:`max(5px,${width*100}%)`,maxWidth:`${100-left*100}%`,top:9+p.lane*14,background:category?.color??'#64748b'}} title={label} aria-label={label} onClick={()=>onEdit(p.session)}/>;
    })}{extra>0&&<button className="week-timeline-more" aria-label={`${day.day}の全記録を見る`} title={`ほか${extra}区間`} onClick={()=>onDay(day.day)}>+{extra}</button>}</div>
    <span className="week-timeline-total" title={`この日の時間軸に含まれる記録時間 ${hoursMinutes(total)}`}><DurationValue value={total}/></span>
  </div>;
});
export default memo(function WeekTimeline({anchor,categoryFilter,activeDay,sessions,categories,dayStart,timezone,now,onDay,onEdit}:Props){
  const days=useMemo(()=>buildWeekTimeline(anchor,sessions,dayStart,timezone,categoryFilter),[anchor,sessions,dayStart,timezone,categoryFilter]),categoryMap=useMemo(()=>new Map(categories.map(c=>[c.id,c])),[categories]);
  const [zoom,setZoom]=useState(3),[width,setWidth]=useState(0),[sideWidths,setSideWidths]=useState(178);
  const scroll=useRef<HTMLDivElement>(null),geometry=useRef<{week:string;track:number;window:number}|null>(null),autoZoom=useRef(true),centerRatio=useRef<number|null>(null);
  useEffect(()=>{const media=matchMedia('(max-width:760px)'),change=()=>{setSideWidths(media.matches?150:178);if(autoZoom.current)setZoom(media.matches?6:3);};change();media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  useLayoutEffect(()=>{const el=scroll.current;if(!el)return;const measure=()=>setWidth(el.clientWidth),observer=new ResizeObserver(measure);observer.observe(el);measure();return()=>observer.disconnect();},[]);
  const windowWidth=Math.max(1,width-sideWidths),trackWidth=windowWidth*zoom,gridWidth=trackWidth+sideWidths,week=days[0].day;
  useLayoutEffect(()=>{const el=scroll.current;if(!el||!width)return;const old=geometry.current;let ratio:number;
    if(!old||old.week!==week){const target=days.find(d=>d.day===anchor&&d.segments.length)||days.find(d=>d.segments.length),piece=target?.segments.findLast(p=>p.start<=now);ratio=target&&piece?(Math.min(now,piece.running?now:piece.start)-target.start)/(target.end-target.start):0;el.scrollLeft=Math.max(0,ratio*trackWidth-windowWidth/3);}
    else {ratio=centerRatio.current??(el.scrollLeft+old.window/2)/old.track;el.scrollLeft=Math.max(0,ratio*trackWidth-windowWidth/2);}
    geometry.current={week,track:trackWidth,window:windowWidth};centerRatio.current=(el.scrollLeft+windowWidth/2)/trackWidth;
  },[week,width,trackWidth,windowWidth]);
  const step=zoom>=3?1:zoom===2?2:4,ticks=Array.from({length:24/step+1},(_,i)=>i*step),index=ZOOMS.indexOf(zoom);
  function changeZoom(value:number){autoZoom.current=false;setZoom(value);}
  return <section className="week-timeline" aria-label="1週間のタイムライン"><div className="timeline-controls" role="group" aria-label="タイムラインの表示"><button className="icon-button" aria-label="タイムラインを縮小" disabled={index===0} onClick={()=>changeZoom(ZOOMS[index-1])}><Minus size={16}/></button><button className="icon-button" aria-label="タイムラインを拡大" disabled={index===ZOOMS.length-1} onClick={()=>changeZoom(ZOOMS[index+1])}><Plus size={16}/></button><button className="subtle-button" aria-pressed={zoom===1} onClick={()=>changeZoom(1)}>全体</button></div>
    <div className="week-timeline-scroll" ref={scroll} onScroll={e=>{const g=geometry.current;if(g)centerRatio.current=(e.currentTarget.scrollLeft+g.window/2)/g.track;}} tabIndex={0} role="region" aria-label="左右にスクロールして時間帯を移動" onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='Home'||e.key==='End'){e.preventDefault();e.currentTarget.scrollLeft=e.key==='Home'?0:e.currentTarget.scrollWidth;}}}>
      <div className="week-timeline-grid" style={{width:Math.max(width,gridWidth)}}><div className="week-timeline-axis" aria-hidden="true"><span className="week-axis-date"/><div className="week-timeline-scale">{ticks.map(hour=><span key={hour} style={{left:`${hour/24*100}%`}}>{hour===24?'翌':''}{dayStartLabel((dayStart+hour*60)%1440)}</span>)}</div><span className="week-axis-total"/></div>
        {days.map(day=>{const dayClock=now<day.start?day.start:!day.intervals.some(i=>i.end===null||i.end>now)?day.end:Math.min(now,day.end);return <DayRow key={day.day} day={day} active={day.day===activeDay} now={dayClock} categoryMap={categoryMap} timezone={timezone} onDay={onDay} onEdit={onEdit}/>;})}
      </div>
    </div>
  </section>;
});
