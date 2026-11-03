import {z} from 'zod';
import {memberKey,intervalMembers} from './work';
const stamp=z.number().int().min(0).max(253402300799000),id=z.string().min(1).max(100);
export const workSchema=z.object({
  version:z.literal(1),mode:z.enum(['auto','ratio','manual']),batchPausedCategoryIds:z.array(id).min(1).max(50).optional(),
  members:z.array(z.object({id:id.optional(),categoryId:id,memo:z.string().max(2000),state:z.enum(['active','paused','finished']),weight:z.number().finite().min(0).max(1000000),manualMs:z.number().int().min(0).max(315576000000).optional(),startedAt:stamp.optional(),endedAt:stamp.nullable().optional()})).min(1).max(1000),
  intervals:z.array(z.object({start:stamp,end:stamp.nullable(),categoryIds:z.array(id).min(1).max(50),memberIds:z.array(id).min(1).max(50).optional()})).max(10000)
}).superRefine((w,ctx)=>{
  const entries=new Map(w.members.map(m=>[memberKey(m),m])),unfinished=w.members.filter(m=>m.state!=='finished');let end=-1,open=0;
  let invalid=entries.size!==w.members.length||new Set(w.members.map(m=>m.categoryId)).size>50||new Set(unfinished.map(m=>m.categoryId)).size!==unfinished.length||w.members.reduce((n,m)=>n+m.weight,0)<=0||w.mode==='manual'&&w.members.some(m=>m.manualMs===undefined);
  for(const i of w.intervals){
    const keys=intervalMembers(i);
    if(i.start<end||(i.end!==null&&i.end<i.start)||keys.length!==i.categoryIds.length||new Set(keys).size!==keys.length||new Set(i.categoryIds).size!==i.categoryIds.length)invalid=true;
    keys.forEach((key,k)=>{const m=entries.get(key);if(!m||m.categoryId!==i.categoryIds[k]||(m.startedAt!==undefined&&i.start<m.startedAt)||(m.endedAt!==undefined&&m.endedAt!==null&&(i.end===null||i.end>m.endedAt)))invalid=true;});
    end=i.end??Infinity;if(i.end===null)open++;
  }
  const active=w.members.filter(m=>m.state==='active').map(memberKey).sort(),running=w.intervals.find(i=>i.end===null);
  if(w.members.some(m=>m.startedAt!==undefined&&m.endedAt!==undefined&&m.endedAt!==null&&m.endedAt<m.startedAt))invalid=true;
  if(w.batchPausedCategoryIds&&(new Set(w.batchPausedCategoryIds).size!==w.batchPausedCategoryIds.length||w.batchPausedCategoryIds.some(id=>!w.members.some(m=>m.categoryId===id&&m.state==='paused'))))invalid=true;
  if(invalid||open>1||JSON.stringify(active)!==JSON.stringify(running?intervalMembers(running).slice().sort():[]))ctx.addIssue({code:'custom',message:'作業の区間・状態・配分を確認してください'});
});
