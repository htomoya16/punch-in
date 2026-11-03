'use client';
import {useState} from 'react';
import {Check,LoaderCircle} from 'lucide-react';
import type {Category,Session} from '../../../lib/model';
import {memberKey,memberRange,members} from '../../../lib/work';
import {clock,timeInput} from '../../../lib/time';
import {editedTime} from '../../../lib/record-editor';
import DateTimeField from '../fields/date-time-field';
type Props={session:Session;categories:Category[];pending:boolean;currentTime():string;save(payload:unknown):Promise<void>};
export default function WorkTimeEditor({session,categories,pending,currentTime,save}:Props){
  const items=members(session),[id,setId]=useState(memberKey(items.find(m=>m.state!=='finished')??items[0]));
  const member=items.find(m=>memberKey(m)===id)!,range=memberRange(session,id);
  return <><label className="field">記録<select aria-label="日時を編集する記録" value={id} onChange={e=>setId(e.target.value)}>{items.map(m=><option key={memberKey(m)} value={memberKey(m)}>{categories.find(c=>c.id===m.categoryId)?.name??'削除済み'}　{memberRange(session,memberKey(m)).start===null?'—':clock(memberRange(session,memberKey(m)).start!,session.timezone)}</option>)}</select></label><EntryTime key={id} id={id} start={range.start??session.startedAt} end={member.state==='finished'?range.end:null} state={member.state} session={session} pending={pending} currentTime={currentTime} save={save}/></>;
}
function EntryTime({id,start,end,state,session,pending,currentTime,save}:Omit<Props,'categories'>&{id:string;start:number;end:number|null;state:string}){
  const [from,setFrom]=useState(timeInput(start,session.timezone)),[to,setTo]=useState(end===null?'':timeInput(end,session.timezone)),[open,setOpen]=useState<'start'|'end'|null>(null),[error,setError]=useState('');
  return <div><DateTimeField label="開始" value={from} open={open==='start'} onOpen={v=>setOpen(v?'start':null)} onChange={setFrom} currentTime={currentTime}/>{state==='finished'?<DateTimeField label="終了" value={to} open={open==='end'} onOpen={v=>setOpen(v?'end':null)} onChange={setTo} currentTime={currentTime}/>:<div className="field-caption">{state==='paused'?'一時停止中':'計測中'}</div>}{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="primary-button" disabled={pending} onClick={()=>{try{const startedAt=editedTime(from,start,session.timezone),endedAt=state==='finished'?editedTime(to,end,session.timezone):null;if(endedAt!==null&&endedAt<startedAt)throw new Error('終了時刻は開始時刻以降にしてください');setError('');void save({id:session.id,control:'timing',memberId:id,startedAt,endedAt});}catch(e){setError((e as Error).message);}}}>{pending?<LoaderCircle size={15} className="spin"/>:<Check size={15}/>}保存する</button></div></div>;
}
