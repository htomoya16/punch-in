import type { Session } from './model';
export type WorkMember = {categoryId:string;memo:string;state:'active'|'paused'|'finished';weight:number;manualMs?:number;startedAt?:number;endedAt?:number|null};
export type WorkGroup = {version:1;mode:'auto'|'ratio'|'manual';members:WorkMember[];intervals:{start:number;end:number|null;categoryIds:string[]}[]};
export type WorkControl = 'join'|'pause'|'resume'|'finish'|'end';
export function members(s:Session):WorkMember[]{return s.work?.members??[{categoryId:s.categoryId,memo:s.memo,state:s.endedAt===null?'active':'finished',weight:1}];}
export function includesCategory(s:Session,id:string){return members(s).some(m=>m.categoryId===id);}
export function realTime(s:Session,now:number,category=""){return s.work?s.work.intervals.filter(i=>!category||i.categoryIds.includes(category)).reduce((n,i)=>n+Math.max(0,(i.end??now)-i.start),0):category&&s.categoryId!==category?0:Math.max(0,(s.endedAt??now)-s.startedAt);}
/** Credit only the overlapping portion equally; rounding remainder stays with the first member. */
const completedAllocations=new WeakMap<Session,Map<string,number>>();
export function allocations(s:Session,now:number):Map<string,number>{
 if(s.endedAt!==null){let cached=completedAllocations.get(s);if(!cached){cached=computeAllocations(s,0);completedAllocations.set(s,cached);}return cached;}return computeAllocations(s,now);
}
function computeAllocations(s:Session,now:number):Map<string,number>{
  if(!s.work)return new Map([[s.categoryId,realTime(s,now)]]);
  const w=s.work,values=new Map(w.members.map(m=>[m.categoryId,0]));
  if(w.mode==='manual')return new Map(w.members.map(m=>[m.categoryId,m.manualMs??0]));
  if(w.mode==='ratio'){
    const total=realTime(s,now),weight=w.members.reduce((n,m)=>n+m.weight,0);let used=0,cumulative=0;
    w.members.forEach((m,i)=>{cumulative+=m.weight;const value=Math.floor(total*cumulative/weight)-used;values.set(m.categoryId,value);used+=value;});return values;
  }
  for(const i of w.intervals){const elapsed=Math.max(0,(i.end??now)-i.start),part=Math.floor(elapsed/i.categoryIds.length);i.categoryIds.forEach((id,index)=>values.set(id,(values.get(id)??0)+part+(index===0?elapsed-part*i.categoryIds.length:0)));}
  return values;
}
export function creditedTime(s:Session,now:number,category=''){const values=allocations(s,now);return category?(values.get(category)??0):[...values.values()].reduce((a,b)=>a+b,0);}
export function controlWork(s:Session,control:WorkControl,categoryId:string,now:number):Session{
  if(s.endedAt!==null)throw new Error('終了した記録は操作できません');
  const w:WorkGroup=s.work?structuredClone(s.work):{version:1,mode:'auto',members:members(s),intervals:[{start:s.startedAt,end:null,categoryIds:[s.categoryId]}]};
  const at=Math.max(now,s.startedAt,...w.intervals.map(i=>i.end??i.start));
  for(const m of w.members){const range=memberRange(s,m.categoryId);if(m.startedAt===undefined&&range.start!==null)m.startedAt=range.start;if(m.endedAt===undefined){if(m.state!=='finished')m.endedAt=null;else if(range.end!==null)m.endedAt=range.end;}}
  const member=w.members.find(m=>m.categoryId===categoryId);
  if(control==='join'){
    if(member){if(member.state==='active')return s;member.state='active';member.startedAt??=at;member.endedAt=null;}
    else {if(w.members.length>=50)throw new Error('並行する作業は50種類までです');w.members.push({categoryId,memo:'',state:'active',weight:1,startedAt:at,endedAt:null});}
  }else if(control==='end'){w.members.forEach(m=>{if(m.state!=='finished')m.endedAt=at;m.state='finished';});}
  else {if(!member)throw new Error('作業が見つかりません');if(control==='pause'&&member.state!=='active')throw new Error('計測中の作業を選択してください');if(control==='resume'&&member.state!=='paused')throw new Error('一時停止中の作業を選択してください');member.state=control==='pause'?'paused':control==='resume'?'active':'finished';if(control==='finish')member.endedAt=at;}
  const open=w.intervals.find(i=>i.end===null);if(open){open.end=at;if(open.end===open.start)w.intervals=w.intervals.filter(i=>i!==open);}
  const active=w.members.filter(m=>m.state==='active').map(m=>m.categoryId);if(active.length)w.intervals.push({start:at,end:null,categoryIds:active});
  if(w.intervals.length>10000)throw new Error('この記録を終了して、新しい記録を開始してください');
  return {...s,work:w,endedAt:w.members.every(m=>m.state==='finished')?at:null,updatedAt:at};
}
export function memoKey(s:Session,categoryId:string){return s.work?`work:${JSON.stringify([s.id,categoryId])}`:s.id;}
export function readMemo(s:Session,key:string){return key===s.id?s.memo:s.work?.members.find(m=>`work:${JSON.stringify([s.id,m.categoryId])}`===key)?.memo;}
export function setMemo(s:Session,key:string,memo:string):Session{
  if(!s.work)return key===s.id?{...s,memo}:s;
  const member=s.work.members.find(m=>`work:${JSON.stringify([s.id,m.categoryId])}`===key||(key===s.id&&m.categoryId===s.categoryId));if(!member)return s;
  return {...s,memo:member.categoryId===s.categoryId?memo:s.memo,work:{...s.work,members:s.work.members.map(m=>m===member?{...m,memo}:m)}};
}
export function preserveMemos(next:Session,old:Session){let result=next;for(const m of members(old))result=setMemo(result,memoKey(result,m.categoryId),m.memo);return result;}
export function participation(s:Session){return s.work?s.work.intervals.flatMap((i,index)=>i.categoryIds.map(categoryId=>({categoryId,start:i.start,end:i.end,index}))):[{categoryId:s.categoryId,start:s.startedAt,end:s.endedAt,index:0}];}

const periodsCache=new WeakMap<Session,Map<string,{start:number;end:number|null}[]>>();
export function memberIntervals(s:Session,categoryId:string){
 let map=periodsCache.get(s);if(!map){map=new Map();for(const interval of participation(s)){const row=map.get(interval.categoryId)??[],last=row.at(-1);if(last&&last.end===interval.start)last.end=interval.end;else row.push({start:interval.start,end:interval.end});map.set(interval.categoryId,row);}periodsCache.set(s,map);}return map.get(categoryId)??[];
}
export function memberRange(s:Session,categoryId:string){const m=members(s).find(m=>m.categoryId===categoryId),periods=memberIntervals(s,categoryId);return{start:m?.startedAt??periods[0]?.start??(categoryId===s.categoryId?s.startedAt:null),end:m?.state==='finished'?(m.endedAt??periods.at(-1)?.end??(!s.work?s.endedAt:null)):null,inferredEnd:!!s.work&&m?.state==='finished'&&m.endedAt===undefined};}
/** Remove just this participant. Shared intervals remain, exclusive intervals disappear. */
export function removeWork(s:Session,categoryId:string,at:number):Session{
 if(!s.work||s.work.members.length<2)throw new Error('最後の作業は記録全体の削除を使用してください');
 if(!s.work.members.some(m=>m.categoryId===categoryId))throw new Error('作業が見つかりません');
 const w=structuredClone(s.work);w.members=w.members.filter(m=>m.categoryId!==categoryId);
 w.intervals=w.intervals.map(i=>({...i,categoryIds:i.categoryIds.filter(id=>id!==categoryId)})).filter(i=>i.categoryIds.length);
 if(w.members.every(m=>m.weight===0))w.members.forEach(m=>m.weight=1);
 const finished=w.members.every(m=>m.state==='finished'),lastEnd=Math.max(s.startedAt,...w.members.map(m=>memberRange(s,m.categoryId).end??memberRange(s,m.categoryId).start??s.startedAt));
 return{...s,categoryId:w.members[0].categoryId,memo:w.members[0].memo,work:w,endedAt:s.endedAt??(finished?lastEnd:null),updatedAt:at};
}
