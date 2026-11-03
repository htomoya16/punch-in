import {z} from 'zod';
import type {Session,PunchDelta} from './model';
import {controlWork,type WorkControl} from './work';
import {sessionFromRow} from './session-row';
import {HttpError} from './errors';
export const workInput=z.object({id:z.string().min(1).max(100),control:z.enum(['join','pause','resume','finish','end','allocate']),categoryId:z.string().min(1).max(100).optional(),mode:z.enum(['auto','ratio','manual']).optional(),values:z.record(z.string(),z.number().finite().min(0).max(315576000000)).optional()});
/** Preserve separately saved memos in the same atomic structural update. Member order is append-only. */
export function workUpdate(db:D1Database,user:string,old:Session,next:Session,token:string){
  let expression='json(?)';const args:(string|number|null)[]=[JSON.stringify(next.work)];
  for(let i=0;i<(old.work?.members.length??1);i++){
    expression=`json_set(${expression},?,${old.work?'json_extract(work,?)':'memo'})`;
    args.push(`$.members[${i}].memo`);if(old.work)args.push(`$.members[${i}].memo`);
  }
  return db.prepare(`UPDATE sessions SET work=${expression},ended_at=?,updated_at=? WHERE user_id=? AND id=? AND EXISTS(SELECT 1 FROM preferences WHERE user_id=? AND mutation_token=?)`).bind(...args,next.endedAt,next.updatedAt,user,old.id,user,token);
}
export async function performWork(db:D1Database,user:string,input:{payload?:unknown;expectedRevision:number;mutationId:string;pressedAt?:number},receivedAt:number):Promise<PunchDelta|null>{
  const p=workInput.parse(input.payload);
  const [pr,sr,cr]=await db.batch<Record<string,unknown>>([
    db.prepare('SELECT revision,mutation_token FROM preferences WHERE user_id=?').bind(user),
    db.prepare('SELECT * FROM sessions WHERE user_id=? AND id=?').bind(user,p.id),
    db.prepare('SELECT id FROM categories WHERE user_id=? AND archived=0 AND id=?').bind(user,p.categoryId??''),
  ]);
  const pref=pr.results[0];if(pref?.mutation_token===input.mutationId)return null;
  if(Number(pref?.revision)!==input.expectedRevision)throw new HttpError(409,'別の画面で更新されました。もう一度操作してください');
  if(!sr.results[0])throw new HttpError(404,'記録が見つかりません');
  const old=sessionFromRow(sr.results[0]);let next:Session;
  if(p.control==='allocate'){
    if(!old.work||old.endedAt===null)throw new HttpError(400,'計測を終了してから配分を編集してください');
    const mode=p.mode??'auto',values=p.values??{};
    if(mode!=='auto'&&(old.work.members.some(m=>values[m.categoryId]===undefined)||Object.keys(values).length!==old.work.members.length))throw new HttpError(400,'すべての作業の配分を指定してください');
    if(mode==='ratio'&&Object.values(values).some(n=>n>1000000))throw new HttpError(400,'比率は100万以下で指定してください');
    if(mode==='ratio'&&Object.values(values).reduce((a,b)=>a+b,0)<=0)throw new HttpError(400,'比率の合計は0より大きくしてください');
    next={...old,updatedAt:receivedAt,work:{...old.work,mode,members:old.work.members.map(m=>({...m,weight:mode==='ratio'?values[m.categoryId]:m.weight,...(mode==='manual'?{manualMs:Math.round(values[m.categoryId])}:{manualMs:undefined})}))}};
  }else{
    if(p.control==='join'&&!cr.results.length)throw new HttpError(400,'作業の種類が見つかりません');
    const click=input.pressedAt;const at=click!==undefined&&click>=receivedAt-60000&&click<=receivedAt+2000?Math.min(click,receivedAt):receivedAt;
    try{next=controlWork(old,p.control as WorkControl,p.categoryId??'',at);}catch(error){throw new HttpError(400,(error as Error).message);}
  }
  const r=await db.batch([db.prepare('UPDATE preferences SET revision=revision+1,mutation_token=? WHERE user_id=? AND revision=?').bind(input.mutationId,user,input.expectedRevision),workUpdate(db,user,old,next,input.mutationId)]);
  if(!r[0].meta.changes)throw new HttpError(409,'別の画面で更新されました。もう一度操作してください');
  return {baseRevision:input.expectedRevision,revision:input.expectedRevision+1,sessions:[next],serverNow:Date.now()};
}
