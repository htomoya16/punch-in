import type {Session} from './model';
import {participation} from './work';
import {dayStartLabel,fromTimeInput,periodRange,shiftDay} from './time';
export type WeekSegment={session:Session;categoryId:string;memberId:string;start:number;end:number;running:boolean;key:string;lane:number};
export type WeekTimelineDay={day:string;start:number;end:number;segments:WeekSegment[];lanes:number;intervals:{start:number;end:number|null}[]};
// A configured boundary inside a daylight-saving gap begins at the first valid minute.
function boundary(day:string,dayStart:number,timezone:string){
  const wall=Date.parse(`${day}T${dayStartLabel(dayStart)}:00Z`);
  for(let minute=0;minute<=180;minute++){try{return fromTimeInput(new Date(wall+minute*60000).toISOString().slice(0,19),timezone);}catch{/* Try the next local minute. */}}
  throw new Error('日の区切りを確認してください');
}
/** Build once per data change; only open segment widths and totals depend on the clock. */
export function buildWeekTimeline(anchor:string,sessions:Session[],dayStart:number,timezone:string,categoryFilter=''):WeekTimelineDay[]{
  const [from,to]=periodRange('week',anchor),weekStart=boundary(from,dayStart,timezone),weekEnd=boundary(shiftDay(to,1),dayStart,timezone);
  const relevant=sessions.filter(s=>s.startedAt<weekEnd&&(s.endedAt===null||s.endedAt>weekStart)),pieces=relevant.flatMap(session=>participation(session).filter(i=>!categoryFilter||i.categoryId===categoryFilter).map(i=>({...i,session})));
  return Array.from({length:7},(_,index)=>{
    const day=shiftDay(from,index),start=boundary(day,dayStart,timezone),end=boundary(shiftDay(day,1),dayStart,timezone);
    const groups=new Map<string,WeekSegment[]>();
    for(const p of pieces){if(p.start>=end||(p.end!==null&&p.end<=start))continue;const key=JSON.stringify([p.session.id,p.memberId]),group=groups.get(key)??[];
      group.push({session:p.session,categoryId:p.categoryId,memberId:p.memberId,start:Math.max(start,p.start),end:Math.min(end,p.end??end),running:p.end===null,key:`${key}:${p.index}`,lane:0});groups.set(key,group);
    }
    const segments:WeekSegment[]=[];
    for(const group of groups.values()){group.sort((a,b)=>a.start-b.start);for(const p of group){const last=segments.at(-1);if(last&&last.session.id===p.session.id&&last.memberId===p.memberId&&last.end===p.start){last.end=p.end;last.running=p.running;}else segments.push(p);}}
    segments.sort((a,b)=>a.start-b.start||a.end-b.end||a.key.localeCompare(b.key));const laneEnds:number[]=[];
    for(const p of segments){let lane=laneEnds.findIndex(value=>value<=p.start);if(lane<0)lane=laneEnds.length;laneEnds[lane]=p.end;p.lane=lane;}
    // Totals count each real interval once even when several members participated.
    const intervals=relevant.flatMap(s=>(s.work?.intervals??[{start:s.startedAt,end:s.endedAt,categoryIds:[s.categoryId]}]).filter(i=>(!categoryFilter||i.categoryIds.includes(categoryFilter))&&i.start<end&&(i.end===null||i.end>start)).map(i=>({start:Math.max(start,i.start),end:i.end===null?null:Math.min(end,i.end)})));
    return {day,start,end,segments,lanes:laneEnds.length,intervals};
  });
}
export function weekDayTotal(day:WeekTimelineDay,now:number){return day.intervals.reduce((n,i)=>n+Math.max(0,Math.min(day.end,i.end??now)-i.start),0);}
