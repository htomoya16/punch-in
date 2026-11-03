'use client';
import {memo,useMemo,type CSSProperties} from 'react';
import type {Category,Session} from '../../../lib/model';
import {clock,dayStartLabel,hms,readableDate} from '../../../lib/time';
import {buildWeekTimeline,weekDayTotal,type WeekTimelineDay} from '../../../lib/week-timeline';

type Props={anchor:string;categoryFilter:string;activeDay:string;sessions:Session[];categories:Category[];dayStart:number;timezone:string;now:number;onDay(day:string):void;onEdit(session:Session):void};
type DayProps={day:WeekTimelineDay;active:boolean;now:number;categoryMap:ReadonlyMap<string,Category>;timezone:string;onDay:Props['onDay'];onEdit:Props['onEdit']};

const DayRow=memo(function DayRow({day,active,now,categoryMap,timezone,onDay,onEdit}:DayProps){
  const candidates=day.segments.filter(p=>p.start<now),visible=candidates.filter(p=>p.lane<3).slice(0,160),extra=candidates.length-visible.length;
  const total=hms(weekDayTotal(day,now));
  return <div className={`week-timeline-day ${active?'is-current':''}`} data-timeline-day={day.day} style={{'--lanes':Math.max(1,Math.min(3,day.lanes))} as CSSProperties}>
    <button className="week-timeline-date" aria-label={`${day.day}の履歴へ移動`} aria-current={active?'date':undefined} title={`${clock(day.start,timezone)} — 翌${clock(day.end,timezone)}`} onClick={()=>onDay(day.day)}>{readableDate(day.day).replace('月','/').replace('日','')}</button>
    <div className="week-timeline-track">{visible.map(p=>{
      const category=categoryMap.get(p.categoryId),finish=Math.min(p.end,now),left=(p.start-day.start)/(day.end-day.start),width=Math.max(0,(finish-p.start)/(day.end-day.start));
      const label=`${category?.name??'削除済み'} ${clock(p.start,timezone)} — ${p.running&&now<day.end?'計測中':clock(finish,timezone)}`;
      return <button key={p.key} className={`week-timeline-bar ${p.running&&now<day.end?'is-running':''}`} style={{left:`${left*100}%`,width:`max(3px,${width*100}%)`,maxWidth:`${100-left*100}%`,top:5+p.lane*7,background:category?.color??'#64748b'}} title={label} aria-label={label} onClick={()=>onEdit(p.session)}/>;
    })}{extra>0&&<button className="week-timeline-more" aria-label={`${day.day}の全記録を見る`} title={`ほか${extra}区間`} onClick={()=>onDay(day.day)}>+{extra}</button>}</div>
    <span className="week-timeline-total" title={`この日の時間軸に含まれる実時間 ${total}`}>{total.slice(0,-3)}</span>
  </div>;
});

export default memo(function WeekTimeline({anchor,categoryFilter,activeDay,sessions,categories,dayStart,timezone,now,onDay,onEdit}:Props){
  const days=useMemo(()=>buildWeekTimeline(anchor,sessions,dayStart,timezone,categoryFilter),[anchor,sessions,dayStart,timezone,categoryFilter]);
  const categoryMap=useMemo(()=>new Map(categories.map(c=>[c.id,c])),[categories]);
  return <div className="week-timeline" aria-label="1週間のタイムライン">
    <div className="week-timeline-axis" aria-hidden="true"><span/>{[0,6,12,18,24].map(hour=><span key={hour} style={{'--tick':hour/24} as CSSProperties}>{hour===24?'翌':''}{dayStartLabel((dayStart+hour*60)%1440)}</span>)}</div>
    {days.map(day=>{
      // Closed days keep stable props; only a currently measuring day ticks.
      const dayClock=now<day.start?day.start:!day.intervals.some(i=>i.end===null||i.end>now)?day.end:Math.min(now,day.end);
      return <DayRow key={day.day} day={day} active={day.day===activeDay} now={dayClock} categoryMap={categoryMap} timezone={timezone} onDay={onDay} onEdit={onEdit}/>;
    })}
  </div>;
});
