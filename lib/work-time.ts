import type {Session} from './model';
import {memberIntervals,memberKey,memberRange,members,participation,type WorkInterval} from './work';
import {businessDay} from './time';
/** Edit one entry's outer boundaries, retaining its pause gaps and every other entry. */
export function editWorkTime(s:Session,id:string,startedAt:number,endedAt:number|null,now:number):Session{
  if(!s.work)throw new Error('作業の記録が見つかりません');
  const member=members(s).find(m=>memberKey(m)===id);if(!member)throw new Error('作業の記録が見つかりません');
  if(startedAt>now+1000||(endedAt!==null&&endedAt>now+1000))throw new Error('未来の日時は登録できません');
  if((member.state==='finished')!==(endedAt!==null))throw new Error('終了時刻は計測を終了してから変更してください');
  if(endedAt!==null&&endedAt<startedAt)throw new Error('終了時刻は開始時刻以降にしてください');
  const previous=memberRange(s,id);if(previous.start===startedAt&&(member.state!=='finished'||previous.end===endedAt))return s;
  const periods=memberIntervals(s,id).map(p=>({...p}));
  if(!periods.length)periods.push({start:startedAt,end:endedAt??(member.state==='paused'?member.endedAt??startedAt:null)});
  periods[0].start=startedAt;if(member.state==='finished')periods[periods.length-1].end=endedAt;
  if(periods.some((p,i)=>(p.end!==null&&p.end<p.start)||(i>0&&(periods[i-1].end===null||periods[i-1].end!>p.start))))throw new Error('一時停止の区間と前後します。開始・終了時刻を確認してください');
  const pieces=participation(s).filter(p=>p.memberId!==id).map(p=>({id:p.memberId,start:p.start,end:p.end}));
  pieces.push(...periods.map(p=>({id,...p})));
  const events=new Map<number,{start:string[];end:string[]}>();
  const event=(at:number)=>{let e=events.get(at);if(!e){e={start:[],end:[]};events.set(at,e);}return e;};
  for(const p of pieces){if(p.end===p.start)continue;event(p.start).start.push(p.id);if(p.end!==null)event(p.end).end.push(p.id);}
  const ordered=[...events.keys()].sort((a,b)=>a-b),active=new Set<string>(),byId=new Map(members(s).map(m=>[memberKey(m),m])),order=new Map(members(s).map((m,i)=>[memberKey(m),i])),intervals:WorkInterval[]=[];
  for(let i=0;i<ordered.length;i++){
    const at=ordered[i],e=events.get(at)!;e.end.forEach(id=>active.delete(id));e.start.forEach(id=>active.add(id));if(!active.size)continue;
    const ids=[...active].sort((a,b)=>(order.get(a)??0)-(order.get(b)??0)),categoryIds=ids.map(id=>byId.get(id)!.categoryId);
    if(new Set(categoryIds).size!==categoryIds.length)throw new Error('同じ作業の記録と時間が重なっています');
    intervals.push({start:at,end:ordered[i+1]??null,categoryIds,...(ids.some(id=>byId.get(id)?.id)?{memberIds:ids}:{})});
  }
  if(intervals.length>10000)throw new Error('計測区間が多すぎます');
  const work={...s.work,members:s.work.members.map(m=>memberKey(m)===id?{...m,startedAt,endedAt}:m),intervals};
  const first=Math.min(startedAt,...work.members.flatMap(m=>m.startedAt===undefined?[]:[m.startedAt]),...intervals.map(i=>i.start));
  const last=s.endedAt===null?null:Math.max(first,...work.members.flatMap(m=>m.endedAt==null?[]:[m.endedAt]),...intervals.map(i=>i.end??first));
  return {...s,startedAt:first,endedAt:last,businessDay:businessDay(first,s.dayStart,s.timezone),work,updatedAt:now};
}
