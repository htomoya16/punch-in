import {z} from 'zod';
const stamp=z.number().int().min(0).max(253402300799000);
export const workSchema=z.object({version:z.literal(1),mode:z.enum(['auto','ratio','manual']),members:z.array(z.object({categoryId:z.string().min(1).max(100),memo:z.string().max(2000),state:z.enum(['active','paused','finished']),weight:z.number().finite().min(0).max(1000000),manualMs:z.number().int().min(0).max(315576000000).optional()})).min(1).max(50),intervals:z.array(z.object({start:stamp,end:stamp.nullable(),categoryIds:z.array(z.string().min(1).max(100)).min(1).max(50)})).max(10000)}).superRefine((w,ctx)=>{
  const ids=new Set(w.members.map(m=>m.categoryId));let end=-1,open=0;
  const invalid=ids.size!==w.members.length||w.members.reduce((n,m)=>n+m.weight,0)<=0||w.intervals.some(i=>{const bad=i.start<end||(i.end!==null&&i.end<i.start)||i.categoryIds.some(id=>!ids.has(id))||new Set(i.categoryIds).size!==i.categoryIds.length;end=i.end??Infinity;if(i.end===null)open++;return bad;})||open>1||w.mode==='manual'&&w.members.some(m=>m.manualMs===undefined);
  const active=w.members.filter(m=>m.state==='active').map(m=>m.categoryId).sort(),running=w.intervals.find(i=>i.end===null)?.categoryIds.slice().sort()??[];
  if(invalid||JSON.stringify(active)!==JSON.stringify(running))ctx.addIssue({code:'custom',message:'作業の区間・配分を確認してください'});
});
