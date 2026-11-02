"use client";
import {memo,useEffect,useLayoutEffect,useRef,useSyncExternalStore} from "react";
import {LoaderCircle,RefreshCw} from "lucide-react";
import type {SessionMemosStore} from "../../../lib/session-memos-store";
export default memo(function MemoCell({id,value,label,store,disabled=false}:{id:string;value:string;label:string;store:SessionMemosStore;disabled?:boolean}){
  const initial=useRef({memo:value,status:"saved" as const});
  const state=useSyncExternalStore(store.subscribe,()=>store.getSnapshot(id,value),()=>initial.current);
  const input=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{store.observe(id,value);},[id,value,store]);
  useEffect(()=>()=>{store.setEditing(id,false);void store.flush(id);},[id,store]);
  useLayoutEffect(()=>{const e=input.current;if(e){e.style.height="auto";e.style.height=`${Math.min(160,Math.max(34,e.scrollHeight))}px`;}},[state.memo]);
  return <div className={`inline-memo ${state.status==="error"||state.status==="conflict"?"has-error":""}`}><textarea ref={input} rows={1} aria-label={label} placeholder="メモ" value={state.memo} disabled={disabled} maxLength={2000} onChange={e=>store.edit(id,e.target.value)} onFocus={()=>store.setEditing(id,true)} onBlur={()=>{store.setEditing(id,false);void store.flush(id);}} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();void store.flush(id);e.currentTarget.blur();}}}/>{state.status==="saving"&&<LoaderCircle size={12} className="memo-saving spin" aria-label="保存中"/>}{state.status==="error"&&<div className="inline-memo-message" role="alert"><span>{state.error}</span><button className="text-button" onClick={()=>void store.flush(id)}><RefreshCw size={12}/>再試行</button></div>}{state.conflict!==undefined&&<div className="inline-memo-message" role="alert"><span>別の画面で更新されました</span><details><summary>最新版を見る</summary><p>{state.conflict||"（空欄）"}</p></details><div><button className="text-button" onClick={()=>store.resolve(id,false)}>最新版を使う</button><button className="text-button" onClick={()=>store.resolve(id,true)}>この内容で上書き</button></div></div>}</div>;
});
