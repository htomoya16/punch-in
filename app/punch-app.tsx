"use client";

import {latestSessionsChronologically} from '../lib/record-order';
import DurationValue from './components/time/duration-value';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Palette, Clock3, CalendarDays, ChartNoAxesCombined, Settings2, LayoutGrid, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Plus, Pencil, X, Menu, LogOut, Play, Square, Search, Download, Upload, Eye, EyeOff, Trash2, Check, LoaderCircle, Bell, ArrowRight, RefreshCw } from "lucide-react";
import type { AppState, Backup, Category, PendingPunch, Preferences, PunchDelta, Session } from "../lib/model";
import { businessDay, clock, contrastText, dayStartLabel, duration, fromTimeInput, hms, hm, minuteIso, hoursMinutes, periodRange, readableDate, readableColor, shiftDay, shiftPeriod, minuteInput, wallParts, type Period } from "../lib/time";

import {memberKey,currentMember,entryAllocations,categoryAllocations,members,includesCategory,allocations,creditedTime,memberRange,memoKey,readMemo,setMemo} from "../lib/work";
import ParallelControls from "./components/records/parallel-controls";
import DateTimeField from "./components/fields/date-time-field";
import {editedTime,recordTimeForDay} from "../lib/record-editor";
import WorkRecords from "./components/records/work-records";
import WorkTimeEditor from "./components/records/work-time-editor";
import AllocationEditor from "./components/records/allocation-editor";
import {elapsedColors,diagonalColors} from "../lib/elapsed-style";
import CategoriesReorder from "./components/categories-reorder";
import DeleteRecord from "./components/records/delete-record";
import HistoryFeed from "./components/history/history-feed";
import MemoCell from "./components/records/memo-cell";
import StatsOverview from "./components/stats/stats-overview";
import {SessionMemosStore,saveSessionMemo,browserMemoStorage} from "../lib/session-memos-store";
import { punchButtonPositions } from "../lib/punch-layout";
import { applyPunchDelta, completedTotal, projectPunch } from "../lib/punch-state";

import type { NoteTarget } from "../lib/daily-note";
import type { NotesHandle } from "./components/notes/notes-dock";
const NotesDock=lazy(()=>import("./components/notes/notes-dock"));

type View="punch"|"history"|"stats"|"categories"|"settings";
type Job={action:string;payload:unknown;mutationId:string;expectedRevision:number;responseMode?:"delta";pressedAt?:number};
type ActionResult={error?:string;state?:AppState;punchDelta?:PunchDelta;preview?:Preview};
type Preview={dailyNotes:number;skippedDailyNotes:number;categories:number;sessions:number;skippedCategories:number;skippedSessions:number;running:boolean};
const NAV=[{id:"punch",label:"打刻",icon:Clock3},{id:"history",label:"履歴",icon:CalendarDays},{id:"stats",label:"集計",icon:ChartNoAxesCombined},{id:"categories",label:"作業",icon:LayoutGrid},{id:"settings",label:"設定",icon:Settings2}] as const;
const PALETTE=["#168ab5","#12a89a","#ec846c","#9380c4","#d49b38","#587b64","#b45f91","#64748b"];
const PERIODS:{id:Period;label:string}[]=[{id:"day",label:"日"},{id:"week",label:"週"},{id:"month",label:"月"},{id:"year",label:"年"},{id:"all",label:"全期間"}];

function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ const d=ref.current;d?.showModal();d?.querySelector<HTMLElement>("input:not([type=checkbox]):not([type=color]),select,textarea")?.focus();return()=>d?.close(); },[]);
  return <dialog ref={ref} className="modal" onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}}><div className="modal-body"><div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="閉じる"><X size={20}/></button></div>{children}</div></dialog>;
}
function Dot({color}:{color:string}) { return <span className="dot" style={{background:color}}/>; }
function Empty({text="記録がありません"}:{text?:string}) { return <div className="empty"><Clock3 size={26} strokeWidth={1.3}/><span>{text}</span></div>; }
function saveFile(content:string,name:string,type:string) { const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
function csv(rows:(string|number)[][]) { return "\uFEFF"+rows.map(row=>row.map(v=>{let s=String(v);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(",")).join("\r\n"); }

export default function PunchApp({initial,displayName,draftScope}:{initial:AppState;displayName:string;draftScope:string}) {
  const [savedState,setState]=useState(initial), [view,setView]=useState<View>("punch"), [menu,setMenu]=useState(false);
  const [pendingPunch,setPendingPunch]=useState<PendingPunch|null>(null);
  const state=useMemo(()=>pendingPunch?projectPunch(savedState,pendingPunch):savedState,[savedState,pendingPunch]);
  const [compactNavigation,setCompactNavigation]=useState(false);
  const menuButton=useRef<HTMLButtonElement>(null),sidebarRef=useRef<HTMLElement>(null);
  const closeMenu=useCallback(()=>{setMenu(false);requestAnimationFrame(()=>menuButton.current?.focus({preventScroll:true}));},[]);
  useEffect(()=>{const media=window.matchMedia("(max-width:1200px)");const change=()=>{setCompactNavigation(media.matches);setMenu(false);};change();media.addEventListener("change",change);return()=>media.removeEventListener("change",change);},[]);
  useEffect(()=>{
    if(!compactNavigation||!menu)return;
    const focusTimer=setTimeout(()=>sidebarRef.current?.querySelector<HTMLElement>("button")?.focus({preventScroll:true}),30);
    const key=(event:KeyboardEvent)=>{
      if(document.querySelector("dialog[open]"))return;
      if(event.key==="Escape"){event.preventDefault();closeMenu();}
      if(event.key!=="Tab")return;
      const items=sidebarRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled),a[href]");
      if(!items?.length)return;const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",key);return()=>{clearTimeout(focusTimer);document.removeEventListener("keydown",key);};
  },[compactNavigation,menu,closeMenu]);
  const stateRef=useRef(savedState);
  const memoAcknowledgements=useRef(new Map<string,{memo:string;revision:number}>());
  const applyMemo=useCallback((id:string,memo:string,revision?:number)=>{const current=stateRef.current,old=current.sessions.find(s=>readMemo(s,id)!==undefined);if(revision!==undefined&&revision<(current.memoRevision??0))return old?readMemo(old,id):undefined;if(revision!==undefined)memoAcknowledgements.current.set(id,{memo,revision});else memoAcknowledgements.current.delete(id);if(!old||readMemo(old,id)===memo)return;const next={...current,sessions:current.sessions.map(s=>s===old?setMemo(s,id,memo):s)};stateRef.current=next;setState(next);},[]);
  const [memoStore]=useState(()=>new SessionMemosStore(draftScope,saveSessionMemo,applyMemo,browserMemoStorage()));
  useEffect(()=>{const sync=()=>{if(!document.hidden)void memoStore.flushAll();};const hide=()=>{memoStore.persistAll();void memoStore.flushAll();};const leave=(event:BeforeUnloadEvent)=>{memoStore.persistAll();if(memoStore.hasUnsaved()){void memoStore.flushAll();event.preventDefault();}};window.addEventListener("online",sync);window.addEventListener("pagehide",hide);window.addEventListener("beforeunload",leave);return()=>{window.removeEventListener("online",sync);window.removeEventListener("pagehide",hide);window.removeEventListener("beforeunload",leave);memoStore.dispose();};},[memoStore]);
  const refreshing=useRef(false);
  const [now,setNow]=useState(initial.serverNow);const [initialOffset]=useState(()=>initial.serverNow-Date.now());const offset=useRef(initialOffset);
  const [pending,setPending]=useState(false);const busy=useRef(false);
  const [toast,setToast]=useState<{text:string;error?:boolean}|null>(null),[retry,setRetry]=useState<Job|null>(null);
  const [deleteTarget,setDeleteTarget]=useState<{session:Session;categoryId?:string}|null>(null);
  const [recordEditMode,setRecordEditMode]=useState<"allocation"|"time">("allocation");
  const [editingCategory,setEditingCategory]=useState<Category|null>(null),[editingSession,setEditingSession]=useState<Session|null>(null);
  const [confirm,setConfirm]=useState<{title:string;text:string;run:()=>void|Promise<boolean>}|null>(null);
  const [confirmPending,setConfirmPending]=useState(false),confirmBusy=useRef(false);
  const [prefs,setPrefs]=useState<Preferences>(initial.preferences);
  const today=businessDay(now,state.preferences.dayStart,state.preferences.timezone);
  const [visibleHistoryDay,setVisibleHistoryDay]=useState(today);
  const onHistoryActive=useCallback((day:string)=>setVisibleHistoryDay(day),[]);
  const [historyPage,setHistoryPage]=useState(today);
  const [historyFocus,setHistoryFocus]=useState(0);
  const [historyLanding,setHistoryLanding]=useState<"overview"|"day">("overview");
  const [weekFrom,weekTo]=useMemo(()=>periodRange("week",historyPage),[historyPage]);
  const [historyRange,setHistoryRange]=useState(false);
  const [historyDay,updateHistoryDay]=useState(today),[historyTo,setHistoryTo]=useState(today),[query,setQuery]=useState(""),[filter,setFilter]=useState("");
  const [noteTarget,setNoteTarget]=useState<NoteTarget>({day:today,open:false});
  const [notesActivated,setNotesActivated]=useState(false),[noteError,setNoteError]=useState(false),[exporting,setExporting]=useState(false);
  const noteReturnDay=useRef<string|null>(null);
  const notesHandle=useRef<NotesHandle|null>(null),noteButton=useRef<HTMLButtonElement>(null);
  const notesReady=useCallback((handle:NotesHandle)=>{notesHandle.current=handle;},[]);
  const closeNotes=useCallback(()=>{setNoteTarget(target=>({...target,open:false}));requestAnimationFrame(()=>{noteButton.current?.focus({preventScroll:true});if(noteReturnDay.current){const day=noteReturnDay.current;noteReturnDay.current=null;document.querySelector(`[data-history-day="${day}"]`)?.scrollIntoView({block:"start",behavior:"auto"});}});},[]);
  function openNotes(day:string){if(view==="history"&&matchMedia("(max-width:760px)").matches)noteReturnDay.current=day;setNotesActivated(true);setNoteTarget({day,open:true,reveal:Date.now()});}
  function setHistoryDay(day:string){updateHistoryDay(day);setHistoryPage(day);setHistoryLanding("day");setHistoryFocus(v=>v+1);}
  async function exportBackup(){if(exporting)return;setExporting(true);try{if(!await memoStore.flushAll())throw new Error("打刻メモの保存を確認してから書き出してください");if(notesHandle.current&&!await notesHandle.current.flushAll())throw new Error("メモの保存を確認してから書き出してください");const response=await fetch("/api/export",{cache:"no-store"});if(!response.ok)throw new Error("書き出せませんでした");saveFile(await response.text(),`punch-in-${today}.json`,"application/json");}catch(error){setToast({text:error instanceof Error?error.message:"書き出せませんでした",error:true});}finally{setExporting(false);}}
  const [period,setPeriod]=useState<Period>("week"),[anchor,setAnchor]=useState(today),[statsFilter,setStatsFilter]=useState("");
  const [backup,setBackup]=useState<Backup|null>(null),[preview,setPreview]=useState<Preview|null>(null),[includePrefs,setIncludePrefs]=useState(true);
  const [permission,setPermission]=useState("default");
  const notified=useRef(new Set<string>());
  const update=useCallback((next:AppState)=>{
    if(next.revision<stateRef.current.revision)return;
    const acknowledgements=memoAcknowledgements.current;
    for(const [id,ack]of acknowledgements)if(ack.revision<=(next.memoRevision??0))acknowledgements.delete(id);
    if(acknowledgements.size)next={...next,sessions:next.sessions.map(s=>{let result=s;for(const [key,ack]of acknowledgements)if(readMemo(result,key)!==undefined)result=setMemo(result,key,ack.memo);return result;})};
    offset.current=next.serverNow-Date.now();setNow(next.serverNow);
    if(next.revision>stateRef.current.revision||(next.memoRevision??0)>(stateRef.current.memoRevision??0)){stateRef.current=next;setState(next);}
  },[]);
  const refresh=useCallback(async(force=false)=>{
    if(!force&&(busy.current||refreshing.current||document.hidden))return false;
    refreshing.current=true;
    try {
      const url=force?"/api/state":`/api/state?revision=${stateRef.current.revision}&memoRevision=${stateRef.current.memoRevision??0}`;
      const sentAt=Date.now();
      const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(5000)});
      if(!force&&busy.current)return false;
      if(r.status===304){const serverNow=Number(r.headers.get("X-Server-Now"));if(serverNow>0){offset.current=serverNow-(sentAt+Date.now())/2;setNow(Date.now()+offset.current);}return true;}
      if(r.ok){update(await r.json() as AppState);return true;}
      return false;
    }catch{return false;}
    finally{refreshing.current=false;}
  },[update]);
  useEffect(()=>{void refresh();const tick=setInterval(()=>setNow(Date.now()+offset.current),1000);const poll=setInterval(()=>void refresh(),15000);const focus=()=>{if(!document.hidden)void refresh();};window.addEventListener("focus",focus);window.addEventListener("online",focus);document.addEventListener("visibilitychange",focus);return()=>{clearInterval(tick);clearInterval(poll);window.removeEventListener("focus",focus);window.removeEventListener("online",focus);document.removeEventListener("visibilitychange",focus);};},[refresh]);
  useEffect(()=>{if(!toast||toast.error)return;const id=setTimeout(()=>setToast(null),4500);return()=>clearTimeout(id);},[toast]);
  useEffect(()=>{if("Notification" in window)setPermission(Notification.permission);},[]);
  const categoryMap=useMemo(()=>new Map(state.categories.map(c=>[c.id,c])),[state.categories]);
  const running=useMemo(()=>state.sessions.find(s=>s.endedAt===null),[state.sessions]),runningCategory=categoryMap.get(running?.categoryId??"");
  const runningEntryTimes=useMemo(()=>running?entryAllocations(running,now):new Map<string,number>(),[running,now]);
  const runningTimes=useMemo(()=>running?categoryAllocations(running,runningEntryTimes):new Map<string,number>(),[running,runningEntryTimes]);
  const timerColors=useMemo(()=>elapsedColors(running,state.categories),[running,state.categories]);
  const displaySession=running??state.sessions[0],displayCategory=categoryMap.get(displaySession?.categoryId??"");
  useEffect(()=>{
    if(pendingPunch||!running||members(running).every(m=>m.state!=="active")||!state.preferences.reminderEnabled||duration(running,now)<state.preferences.reminderMinutes*60000)return;
    const key=`punch-in:reminded:${running.id}`;
    if(notified.current.has(key))return;notified.current.add(key);
    try { if(localStorage.getItem(key))return;localStorage.setItem(key,"1"); } catch { /* Keep in-memory notification deduplication. */ }
    const message=`${runningCategory?.name??"作業"}を${hoursMinutes(duration(running,now))}計測しています`;
    setToast({text:message});
    if("Notification" in window&&Notification.permission==="granted")try{new Notification("終了を忘れていませんか？",{body:message,tag:running.id,icon:"/icons/punch-in-192.png"});}catch{/* In-app notification is still delivered. */}
  },[now,running,runningCategory,state.preferences,pendingPunch]);
  async function execute(job:Job,success?:string) {
    if(busy.current)return null;busy.current=true;setPending(true);setRetry(null);
    let retryable=true;
    if(job.action==="work"&&["join","pause","resume","finish","end","pauseAll","resumeAll"].includes((job.payload as {control:string}).control)){const p=job.payload as {id:string;categoryId?:string;control:import("../lib/work").WorkControl};setPendingPunch({categoryId:p.categoryId??"",workId:p.id,control:p.control,mutationId:job.mutationId,baseRevision:job.expectedRevision,at:job.pressedAt??Math.round(Date.now()+offset.current)});}
    if(job.action==="punch") {
      const at=job.pressedAt??Math.round(Date.now()+offset.current);setNow(Date.now()+offset.current);
      setPendingPunch({categoryId:(job.payload as {categoryId:string}).categoryId,mutationId:job.mutationId,baseRevision:job.expectedRevision,at});
    }
    try {
      if(job.action==="work"||job.action==="punch"){const current=job.action==="work"?stateRef.current.sessions.find(s=>s.id===(job.payload as {id:string}).id):stateRef.current.sessions.find(s=>s.endedAt===null&&s.categoryId!==(job.payload as {categoryId:string}).categoryId);if(current&&!current.work&&!await memoStore.flush(current.id)){retryable=false;throw new Error("メモの保存を確認してください");}}
      const r=await fetch("/api/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(job),signal:AbortSignal.timeout(15000)});
      const result=await r.json() as ActionResult;
      if(!r.ok){retryable=r.status>=500;setPendingPunch(null);if(r.status===409)await refresh(true);throw new Error(result.error||"保存できませんでした");}
      if(result.punchDelta){const next=applyPunchDelta(stateRef.current,result.punchDelta);if(next&&next!==stateRef.current)update(next);else if(!next&&!await refresh(true)){retryable=false;throw new Error("保存は完了しましたが、表示を更新できませんでした。再読み込みしてください");}}
      if(result.state)update(result.state);
      if(success)setToast({text:success});
      return result;
    } catch(e) {
      setPendingPunch(null);
      const timedOut=e instanceof DOMException&&(e.name==="TimeoutError"||e.name==="AbortError");
      setToast({text:timedOut?"保存結果を確認できませんでした。再試行してください":e instanceof TypeError?"通信できませんでした。接続を確認して再試行してください":e instanceof SyntaxError?"保存結果を確認できませんでした。再試行してください":e instanceof Error?e.message:"保存できませんでした",error:true});
      setRetry(retryable?job:null);
      if(retryable&&job.action==="punch")void refresh(true);
      return null;
    } finally {setPendingPunch(null);busy.current=false;setPending(false);}
  }
  function mutate(action:string,payload:unknown,success?:string) { return execute({action,payload,mutationId:crypto.randomUUID(),expectedRevision:stateRef.current.revision,...(action==="punch"||action==="work"?{responseMode:"delta" as const,pressedAt:Math.round(Date.now()+offset.current)}:{})},success); }
  function go(next:View,historyFocusDay?:string){if(next==="history"){setHistoryLanding(historyFocusDay?"day":"overview");setHistoryRange(false);setHistoryPage(historyFocusDay??today);setVisibleHistoryDay(historyFocusDay??today);setHistoryFocus(v=>v+1);}setNoteTarget(target=>({...target,open:target.open&&(next==="punch"||next==="history"),...(next==="punch"?{day:today}:{})}));setView(next);if(next!==view&&next!=="history")requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"instant" as ScrollBehavior}));if(menu)closeMenu();if(next==="settings")setPrefs(state.preferences);}
  const openStatsHistory=useCallback((start:string,end:string,categoryId:string)=>{updateHistoryDay(start);setHistoryLanding("day");setHistoryPage(start);setVisibleHistoryDay(start);setHistoryFocus(v=>v+1);setHistoryTo(end);setHistoryRange(start!==end);setFilter(categoryId);setQuery("");setView("history");setNoteTarget(target=>({...target,day:start}));window.scrollTo({top:0,behavior:"auto"});},[]);
  const editSession=useCallback(async(session:Session)=>{if(!(await Promise.all(members(session).map(m=>memoStore.flush(memoKey(session,memberKey(m)))))).every(Boolean)){setToast({text:"メモの保存を確認してください",error:true});return;}setRecordEditMode("allocation");setEditingSession(stateRef.current.sessions.find(s=>s.id===session.id)??session);},[memoStore]);
  function requestDeleteSession(session:Session,categoryId?:string){setDeleteTarget({session,categoryId});}
  async function deleteRecord(session:Session,categoryId?:string){
    if(!(await Promise.all(members(session).map(m=>memoStore.flush(memoKey(session,memberKey(m)))))).every(Boolean)){setToast({text:"メモの保存を確認してください",error:true});return false;}
    if(!await mutate(categoryId?"work":"deleteSession",categoryId?{id:session.id,control:"remove",memberId:categoryId}:{id:session.id},categoryId?"作業の記録を削除しました":"記録を削除しました"))return false;
    for(const m of members(session).filter(m=>!categoryId||memberKey(m)===categoryId)){const key=memoKey(session,memberKey(m));memoStore.discard(key);memoAcknowledgements.current.delete(key);}
    setEditingSession(current=>current?.id===session.id?null:current);return true;
  }
  function closeConfirm(){if(!confirmBusy.current)setConfirm(null);}
  async function runConfirm(){if(!confirm||confirmBusy.current)return;confirmBusy.current=true;setConfirmPending(true);try{if(await confirm.run()!==false)setConfirm(null);}finally{confirmBusy.current=false;setConfirmPending(false);}}
  function memberState(id:string){return running?currentMember(running,id)?.state:undefined;}
  function category(id:string){return categoryMap.get(id);}
  function addCategory(){setEditingCategory({id:crypto.randomUUID(),name:"",color:PALETTE[state.categories.length%PALETTE.length],hidden:false,archived:false,position:Math.max(-1,...state.categories.map(c=>c.position))+1});}
  function addSession(day:string){const stamp=recordTimeForDay(day,Math.round(Date.now()+offset.current),state.preferences);setEditingSession({id:crypto.randomUUID(),categoryId:state.categories.find(c=>!c.archived)?.id??"",startedAt:stamp,endedAt:stamp,businessDay:day,dayStart:state.preferences.dayStart,timezone:state.preferences.timezone,memo:"",createdAt:now,updatedAt:now});}

  async function reorder(id:string,direction:number){const cats=state.categories.filter(c=>!c.archived);const i=cats.findIndex(c=>c.id===id),j=i+direction;if(j<0||j>=cats.length)return;[cats[i],cats[j]]=[cats[j],cats[i]];await mutate("reorder",{ids:cats.map(c=>c.id)});}
  const daily=useMemo(()=>state.sessions.filter(s=>s.businessDay===today),[state.sessions,today]);
  const visibleDaily=useMemo(()=>latestSessionsChronologically(daily),[daily]);
  const dailyBase=useMemo(()=>completedTotal(daily),[daily]);
  const dailyTotal=dailyBase+(running?.businessDay===today?duration(running,now):0);
  const history=useMemo(()=>state.sessions.filter(s=>s.businessDay>=weekFrom&&s.businessDay<=weekTo&&(!historyRange||(s.businessDay>=historyDay&&s.businessDay<=historyTo))&&(!filter||includesCategory(s,filter))&&(!query||members(s).some(m=>memoStore.isEditing(memoKey(s,memberKey(m))))||members(s).map(m=>`${categoryMap.get(m.categoryId)?.name??""} ${m.memo}`).join(" ").toLowerCase().includes(query.toLowerCase()))),[state.sessions,categoryMap,historyDay,historyTo,historyRange,weekFrom,weekTo,filter,query,memoStore]);
  const timelineSessions=useMemo(()=>state.sessions.filter(s=>(!historyRange||(s.businessDay>=historyDay&&s.businessDay<=historyTo))&&(!filter||includesCategory(s,filter))&&(!query||members(s).some(m=>memoStore.isEditing(memoKey(s,memberKey(m))))||members(s).map(m=>`${categoryMap.get(m.categoryId)?.name??""} ${m.memo}`).join(" ").toLowerCase().includes(query.toLowerCase()))),[state.sessions,historyRange,historyDay,historyTo,filter,query,memoStore,categoryMap]);
  const [from,to]=useMemo(()=>periodRange(period,anchor),[period,anchor]),[prevFrom,prevTo]=useMemo(()=>periodRange(period,shiftPeriod(period,anchor,-1)),[period,anchor]);
  const selected=useMemo(()=>state.sessions.filter(s=>s.businessDay>=from&&s.businessDay<=to&&(!statsFilter||includesCategory(s,statsFilter))),[state.sessions,from,to,statsFilter]);
  const previous=useMemo(()=>state.sessions.filter(s=>s.businessDay>=prevFrom&&s.businessDay<=prevTo&&(!statsFilter||includesCategory(s,statsFilter))),[state.sessions,prevFrom,prevTo,statsFilter]);
  const creditedBase=useMemo(()=>selected.reduce((n,s)=>n+(s.endedAt===null?0:creditedTime(s,0,statsFilter)),0),[selected,statsFilter]);
  const priorBase=useMemo(()=>previous.reduce((n,s)=>n+(s.endedAt===null?0:creditedTime(s,0,statsFilter)),0),[previous,statsFilter]);
  const selectedActive=useMemo(()=>selected.find(s=>s.endedAt===null),[selected]),previousActive=useMemo(()=>previous.find(s=>s.endedAt===null),[previous]);
  const creditedTotal=creditedBase+(selectedActive?creditedTime(selectedActive,now,statsFilter):0),priorTotal=priorBase+(previousActive?creditedTime(previousActive,now,statsFilter):0);
  const selectedRunning=!!selectedActive;
  const summaries=useMemo(()=>{
    const values=new Map<string,{current:number;previous:number}>();
    for(const [rows,key] of [[selected,"current"],[previous,"previous"]] as const)for(const s of rows){if(s.endedAt!==null)for(const [id,time]of allocations(s,0)){const value=values.get(id)??{current:0,previous:0};value[key]+=time;values.set(id,value);}}
    return values;
  },[selected,previous]);
  const activeCats=useMemo(()=>state.categories.filter(c=>!c.archived),[state.categories]);
  const visibleCats=useMemo(()=>activeCats.filter(c=>!c.hidden),[activeCats]);
  const buttonPositions=useMemo(()=>({wide:punchButtonPositions(visibleCats.length,3),compact:punchButtonPositions(visibleCats.length,2)}),[visibleCats.length]);
  const dateFormatter=useMemo(()=>new Intl.DateTimeFormat("ja-JP",{timeZone:state.preferences.timezone,year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"}),[state.preferences.timezone]);
  const theme=view==="settings"?prefs:state.preferences;
  const style={"--accent":theme.accent,"--accent-ink":contrastText(theme.accent),"--accent-link":readableColor(theme.accent),"--sidebar":theme.sidebar,"--sidebar-ink":contrastText(theme.sidebar)} as CSSProperties;

  function recordTable(list:Session[],showIntervals=false){return list.length?<WorkRecords seconds={view==="punch"} showIntervals={showIntervals} sessions={list} categories={state.categories} now={now} store={memoStore} pending={pending} onEdit={s=>void editSession(s)} onDelete={requestDeleteSession}/>:<Empty/>;}
  async function exportRecords(){if(!await memoStore.flushAll()){setToast({text:"メモの保存を確認してから書き出してください",error:true});return;}const current=new Map(stateRef.current.sessions.map(s=>[s.id,s]));const rows=history.map(s=>current.get(s.id)??s);saveFile(csv([["日付","作業ID","作業","開始日時","終了日時","作業時間（分）","タイムゾーン","1日の開始","メモ","計測中"],...rows.flatMap(s=>members(s).map(m=>[s.businessDay,m.categoryId,category(m.categoryId)?.name??"",memberRange(s,memberKey(m)).start===null?"":minuteIso(memberRange(s,memberKey(m)).start!),memberRange(s,memberKey(m)).end===null?"":minuteIso(memberRange(s,memberKey(m)).end!),Math.floor((entryAllocations(s,now).get(memberKey(m))??0)/60000),s.timezone,dayStartLabel(s.dayStart),m.memo,m.state!=="finished"?"はい":"いいえ"]))]),`punch-in-records-${historyDay}.csv`,"text/csv;charset=utf-8");}
  function exportStats(){saveFile(csv([["期間開始","期間終了","作業ID","作業","作業時間（分）","時間","計測中を含む"],...state.categories.filter(c=>!statsFilter||c.id===statsFilter).map(c=>{const rows=selected.filter(s=>includesCategory(s,c.id));const t=rows.reduce((v,s)=>v+(allocations(s,now).get(c.id)??0),0);return[period==="all"?"全期間":from,period==="all"?"":to,c.id,c.name,Math.floor(t/60000),hm(t),rows.some(s=>s.endedAt===null)?"はい":"いいえ"]; }),[period==="all"?"全期間":from,period==="all"?"":to,"","作業時間",Math.floor(creditedTotal/60000),hm(creditedTotal),selectedRunning?"はい":"いいえ"]]),"punch-in-summary.csv","text/csv;charset=utf-8");}
  async function loadBackup(file:File){setBackup(null);setPreview(null);if(file.size>16_000_000){setToast({text:"ファイルは16MB以内にしてください",error:true});return;}try{const value=JSON.parse(await file.text()) as Backup;const result=await mutate("importPreview",{backup:value});if(result?.preview){setBackup(value);setPreview(result.preview);}}catch{setToast({text:"JSONファイルを読み込めません",error:true});}}
  return <div className={`app ${noteTarget.open?"notes-open":""}`} style={style}>
    <header className="topbar"><button ref={menuButton} className="mobile-menu icon-button" onClick={()=>menu?closeMenu():setMenu(true)} aria-label="メニュー" aria-controls="app-navigation" aria-expanded={compactNavigation&&menu}><Menu size={22}/></button><button className="brand" aria-label="打刻（ホーム）へ" onClick={()=>{go("punch");window.scrollTo({top:0,behavior:"auto"});}}><span className="brand-mark"><img src="/icons/punch-in-96.png" alt="" width={26} height={26} decoding="async"/></span><span>Punch <b>in</b><span className="brand-period">.</span></span></button><div className="account"><span className="avatar">{displayName.slice(0,1).toUpperCase()}</span><span className="account-name">{displayName}</span><a className="icon-button" href="/signout-with-chatgpt?return_to=%2F" target="_top" aria-label="ログアウト"><LogOut size={16}/></a></div></header>
    {menu&&<button className="sidebar-backdrop" aria-label="メニューを閉じる" onClick={closeMenu}/>}
    <aside id="app-navigation" ref={sidebarRef} className={`sidebar ${menu?"open":""}`} inert={compactNavigation&&!menu} aria-hidden={compactNavigation&&!menu?true:undefined} role={compactNavigation?"dialog":undefined} aria-modal={compactNavigation&&menu?true:undefined} aria-label="メニュー"><button className="sidebar-close icon-button" onClick={closeMenu} aria-label="メニューを閉じる"><X size={20}/></button><nav>{NAV.map((n,i)=><button key={n.id} onClick={()=>go(n.id)} className={`nav-item ${view===n.id?"active":""} ${i===3?"nav-divider":""}`} aria-current={view===n.id?"page":undefined}><n.icon size={19} strokeWidth={1.6}/><span>{n.label}</span>{view===n.id&&<span className="nav-marker"/>}</button>)}</nav><div className="sidebar-total"><span>今日の記録時間</span><strong><DurationValue value={dailyTotal} seconds/></strong><span className="sidebar-date">{readableDate(today)}</span></div><a className="sidebar-signout" href="/signout-with-chatgpt?return_to=%2F" target="_top"><LogOut size={15}/>ログアウト</a></aside>
    <main className="main" inert={compactNavigation&&menu}><div className="page-heading"><h1>{NAV.find(n=>n.id===view)?.label}</h1>{(view==="punch"||view==="history")&&<button ref={noteButton} className={`text-button notes-toggle ${noteError?"has-error":""}`} aria-controls="daily-notes" aria-expanded={noteTarget.open} onClick={()=>noteTarget.open?closeNotes():openNotes(view==="punch"?today:visibleHistoryDay)}><Pencil size={14}/>日別メモ{noteError&&<span className="note-error-dot"/>}</button>}</div>
      <div className={`page-content ${view==="punch"?"punch-content":""}`}><div key={view} className="workspace-primary">
      {view==="punch"&&<>
        <div className="punch-tools"><span className="activity-date">{today!==wallParts(now,state.preferences.timezone).date?`${readableDate(today)}の記録`:readableDate(today)}</span><button className="text-button" onClick={()=>go("categories")}><Settings2 size={15}/>ボタンを編集</button></div>
        <section className="punch-stage" aria-label="打刻"><div className="clock-area"><div className="full-date">{dateFormatter.format(now)}</div><div className="big-clock" aria-label={`現在時刻 ${clock(now,state.preferences.timezone,true)}`}><span>{clock(now,state.preferences.timezone)}</span><small className="clock-seconds">:{String(wallParts(now,state.preferences.timezone).second).padStart(2,"0")}</small></div><div className={`current-state ${running?"is-running":""} ${running&&members(running).every(m=>m.state!=="active")?"is-paused":""}`} style={runningCategory?{color:readableColor(runningCategory.color)}:undefined}>{running?<><span className="pulse-dot"/><span>{members(running).every(m=>m.state!=="active")?"一時停止中":members(running).filter(m=>m.state==="active").map(m=>category(m.categoryId)?.name).join("・")}</span></>:<><span className="idle-dot"/>未計測</>}</div><div className={`live-details ${running?"is-active":""}`} inert={!running} aria-hidden={!running} style={displayCategory?{color:readableColor(displayCategory.color)}:undefined}><div className="live-details-content"><span className={`running-elapsed ${timerColors.length>1?"has-multiple-colors":""}`} style={{...(timerColors.length>1?{backgroundImage:diagonalColors(timerColors)}:{color:timerColors[0]??(running?"#64748b":undefined)})}}><DurationValue value={displaySession?duration(displaySession,now):0} seconds/></span><button className="running-memo" disabled={!running||pending} onClick={()=>{if(!running)return;if(!running.work){void editSession(running);return;}if(running.businessDay!==today){setHistoryDay(running.businessDay);setHistoryTo(running.businessDay);go("history",running.businessDay);}requestAnimationFrame(()=>requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(running.id)}"] .inline-memo textarea`)?.focus()));}}><Pencil size={13}/>{displaySession?.work?"メモ":displaySession?.memo||"メモを追加"}</button></div></div></div>
        <div className="punch-controls"><div className={`punch-buttons ${visibleCats.length===1?"single-button":""}`}>{visibleCats.map((c,index)=><button key={c.id} className={`punch-button ${memberState(c.id)==="active"?"recording":memberState(c.id)==="paused"?"paused":""}`} style={{"--punch-row":buttonPositions.wide[index].row,"--punch-column":buttonPositions.wide[index].column,"--compact-row":buttonPositions.compact[index].row,"--compact-column":buttonPositions.compact[index].column,"--category":c.color,"--category-stroke":readableColor(c.color,3),"--category-text":readableColor(c.color),"--category-ink":contrastText(c.color)} as CSSProperties} disabled={pending} onClick={()=>void mutate("punch",{categoryId:c.id},memberState(c.id)==="paused"?`${c.name}を再開しました`:(memberState(c.id)==="active"||memberState(c.id)==="paused")?`${c.name}を終了しました`:`${c.name}を開始しました`)} aria-label={`${c.name}を${memberState(c.id)==="paused"?"再開":memberState(c.id)==="active"?"終了":running?"並行追加":"開始"}`} aria-pressed={(memberState(c.id)==="active"||memberState(c.id)==="paused")} aria-busy={pendingPunch?.categoryId===c.id||undefined}><span className="punch-action">{pendingPunch?.categoryId===c.id?<LoaderCircle size={15} className="spin"/>:memberState(c.id)==="active"?<Square size={14} fill="currentColor"/>:<Play size={15}/>}</span><span>{c.name}</span>{((memberState(c.id)==="active"||memberState(c.id)==="paused")||pendingPunch?.categoryId===c.id)&&<span className="punch-running-label">{pendingPunch?.categoryId===c.id?"保存中":memberState(c.id)==="paused"?"一時停止中":"計測中"}</span>}</button>)}</div>{running&&<ParallelControls session={running} categories={state.categories} times={runningEntryTimes} pending={pending} control={(control,categoryId)=>{void mutate("work",{id:running.id,control,categoryId});}}/>}<button className="punch-add" onClick={addCategory} aria-label="作業を追加"><Plus size={23}/></button></div></section>
        {running&&runningCategory?.hidden&&!running.work&&<div className="notice">非表示の作業「{runningCategory.name}」を計測中です<button className="text-button" disabled={pending} onClick={()=>void mutate("punch",{categoryId:runningCategory.id},"計測を終了しました")}>終了する</button></div>}
      </>}
      {view==="history"&&<>
        <div className="toolbar"><div className="date-navigation"><input aria-label={historyRange?"履歴の開始日":"履歴の日付"} type="date" value={historyRange?historyDay:visibleHistoryDay} onChange={e=>{if(!e.target.value)return;setHistoryDay(e.target.value);if(!historyRange||e.target.value>historyTo)setHistoryTo(e.target.value);}}/>{historyRange&&<><span className="date-dash">—</span><input aria-label="履歴の終了日" type="date" value={historyTo} min={historyDay} onChange={e=>{if(e.target.value)setHistoryTo(e.target.value);}}/></>}<button className="subtle-button" aria-pressed={historyRange} onClick={()=>{setHistoryRange(v=>!v);setHistoryTo(historyDay);}}>期間</button></div></div>
        <div className="filter-bar"><label className="search-field"><Search size={17}/><input placeholder="作業・メモを検索" aria-label="作業・メモを検索" value={query} onChange={e=>{setQuery(e.target.value);}}/></label><select aria-label="作業で絞り込み" value={filter} onChange={e=>{setFilter(e.target.value);}}><option value="">すべての作業</option>{state.categories.map(c=><option key={c.id} value={c.id}>{c.name}{c.archived?"（削除済み）":""}</option>)}</select><button className="text-button export-button" onClick={exportRecords}><Download size={16}/>CSV</button></div>

      </>}
      {view==="stats"&&<>
        <div className="toolbar stats-toolbar"><div className="segmented">{PERIODS.map(p=><button key={p.id} className={period===p.id?"selected":""} onClick={()=>setPeriod(p.id)}>{p.label}</button>)}</div><div className="toolbar-actions"><select aria-label="集計する作業" value={statsFilter} onChange={e=>setStatsFilter(e.target.value)}><option value="">すべての作業</option>{state.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="text-button" onClick={exportStats}><Download size={16}/>CSV</button></div></div>
        {period!=="all"&&<div className="stats-date"><button className="icon-button" aria-label="前の期間" onClick={()=>setAnchor(shiftPeriod(period,anchor,-1))}><ChevronLeft size={20}/></button><label>{period==="day"?readableDate(anchor):period==="week"?`${from.replaceAll("-","/")} — ${to.slice(5).replace("-","/")}`:period==="month"?`${anchor.slice(0,4)}年${Number(anchor.slice(5,7))}月`:`${anchor.slice(0,4)}年`}<input className="anchor-input" aria-label="集計の基準日" type="date" value={anchor} onChange={e=>{if(e.target.value)setAnchor(e.target.value);}}/></label><button className="icon-button" aria-label="次の期間" onClick={()=>setAnchor(shiftPeriod(period,anchor,1))}><ChevronRight size={20}/></button><button className="subtle-button" onClick={()=>setAnchor(today)}>今{period==="day"?"日":period==="week"?"週":period==="month"?"月":"年"}</button></div>}
        <section className="stats-total"><span>作業時間{selectedRunning&&<span className="live-tag">計測中を含む</span>}</span><div><strong><DurationValue value={creditedTotal}/></strong>{period!=="all"&&<span className="comparison">前{period==="day"?"日":period==="week"?"週":period==="month"?"月":"年"} <DurationValue value={priorTotal}/><b className={creditedTotal>=priorTotal?"positive":""}>{priorTotal>0?`${creditedTotal>=priorTotal?"+":""}${Math.round((creditedTotal-priorTotal)/priorTotal*100)}%`:"—"}</b></span>}</div></section>
        <StatsOverview today={today} accent={state.preferences.accent} onHistory={openStatsHistory} categoryFilter={statsFilter} sessions={selected} categories={state.categories} now={selectedRunning?now:0} period={period} from={from} to={to}/>
        <section className="category-summary"><div className="section-heading"><h2>作業別</h2></div>{state.categories.filter(c=>(!statsFilter||c.id===statsFilter)&&(!c.archived||selected.some(s=>includesCategory(s,c.id)))).map(c=>{const summary=summaries.get(c.id);const t=(summary?.current??0)+(selectedActive?(runningTimes.get(c.id)??0):0);const p=(summary?.previous??0)+(previousActive?(runningTimes.get(c.id)??0):0);return <div className="summary-row" key={c.id}><span className="category-name" title={c.name}><Dot color={c.color}/><span className="category-label">{c.name}</span></span><div className="summary-track"><span style={{width:`${creditedTotal?t/creditedTotal*100:0}%`,background:c.color}}/></div><strong><DurationValue value={t}/></strong><span className="summary-percent">{creditedTotal?Math.round(t/creditedTotal*100):0}%</span>{period!=="all"&&<span className="summary-prior">前期間 <DurationValue value={p}/></span>}</div>;})}</section>
      </>}
      {view==="categories"&&<>
        <div className="toolbar"><span>{activeCats.length}種類</span><button className="primary-button" onClick={addCategory}><Plus size={16}/>作業を追加</button></div>
        {activeCats.length?<CategoriesReorder items={activeCats} pending={pending} save={async ids=>!!await mutate("reorder",{ids})} renderItem={(c,i,handle)=><div className={`category-row ${c.hidden?"is-hidden":""}`} key={c.id}><div className="category-order">{handle}<button className="icon-button" disabled={pending||i===0} onClick={()=>void reorder(c.id,-1)} aria-label={`${c.name}を上へ`}><ChevronUp size={15}/></button><button className="icon-button" disabled={pending||i===activeCats.length-1} onClick={()=>void reorder(c.id,1)} aria-label={`${c.name}を下へ`}><ChevronDown size={15}/></button></div><span className="category-swatch" style={{borderColor:c.color,color:c.color}}><Clock3 size={24} strokeWidth={1.3}/></span><strong>{c.name}</strong>{(memberState(c.id)==="active"||memberState(c.id)==="paused")&&<span className="live-tag">計測中</span>}<div className="category-row-actions"><button className="icon-button" disabled={pending} onClick={()=>void mutate("category",{...c,hidden:!c.hidden})} aria-label={`${c.name}を${c.hidden?"表示":"非表示"}`} title={c.hidden?"表示する":"非表示にする"}>{c.hidden?<EyeOff size={18}/>:<Eye size={18}/>}</button><button className="icon-button" onClick={()=>setEditingCategory(c)} aria-label={`${c.name}を編集`}><Pencil size={17}/></button><button className="icon-button danger" disabled={pending} onClick={()=>setConfirm({title:"作業を削除",text:`「${c.name}」を削除します。過去の記録は残ります。`,run:async()=>!!await mutate("archiveCategory",{id:c.id},"作業を削除しました")})} aria-label={`${c.name}を削除`}><Trash2 size={17}/></button></div></div>}/>:<Empty text="作業を追加してください"/>}
      </>}
      {view==="settings"&&<div className="settings-layout"><form onSubmit={async e=>{e.preventDefault();const r=await mutate("preferences",prefs,"設定を保存しました");if(r?.state)setPrefs(r.state.preferences);}}>
        <section className="settings-section"><h2>時間の設定</h2><label className="setting-row"><span>1日の開始</span><input required type="time" value={dayStartLabel(prefs.dayStart)} onChange={e=>{if(e.target.value){const [h,m]=e.target.value.split(":").map(Number);setPrefs({...prefs,dayStart:h*60+m});}}}/></label><label className="setting-row"><span>タイムゾーン</span><input required list="timezones" value={prefs.timezone} onChange={e=>setPrefs({...prefs,timezone:e.target.value})}/><datalist id="timezones">{["Asia/Tokyo","UTC","Asia/Seoul","Asia/Shanghai","Asia/Singapore","America/New_York","America/Los_Angeles","Europe/London","Europe/Paris","Australia/Sydney"].map(t=><option key={t}>{t}</option>)}</datalist></label></section>
        <section className="settings-section"><h2>カラー</h2><label className="setting-row"><span>アクセント</span><ColorInput value={prefs.accent} onChange={accent=>setPrefs({...prefs,accent})}/></label><label className="setting-row"><span>サイドバー</span><ColorInput value={prefs.sidebar} onChange={sidebar=>setPrefs({...prefs,sidebar})}/></label><button type="button" className="text-button reset-colors" onClick={()=>setPrefs({...prefs,accent:"#168ab5",sidebar:"#000000"})}>初期カラーに戻す</button></section>
        <section className="settings-section"><h2>終了忘れの通知</h2><label className="setting-row"><span>通知する</span><input className="switch" type="checkbox" checked={prefs.reminderEnabled} onChange={async e=>{const checked=e.target.checked;setPrefs({...prefs,reminderEnabled:checked});if(checked&&"Notification"in window&&Notification.permission==="default")setPermission(await Notification.requestPermission());}}/></label>{prefs.reminderEnabled&&<><label className="setting-row"><span>開始から</span><div className="input-unit"><input required type="number" min="1" max="10080" value={prefs.reminderMinutes} onChange={e=>setPrefs({...prefs,reminderMinutes:Number(e.target.value)})}/><span>分</span></div></label><p className="field-note">アプリを開いている間に通知します。{permission==="denied"?"ブラウザ通知は端末の設定で許可できます。":""}</p></>}</section>
        <div className="settings-save"><button className="primary-button" disabled={pending}>{pending?<LoaderCircle size={16} className="spin"/>:<Check size={16}/>}保存する</button></div>
      </form><section className="settings-section data-section"><h2>データの引き継ぎ</h2><div className="data-actions"><button className="outline-button" disabled={exporting} onClick={()=>void exportBackup()}>{exporting?<LoaderCircle size={17} className="spin"/>:<Download size={17}/>}すべて書き出す（JSON）</button><label className={`outline-button ${pending?"disabled":""}`}><Upload size={17}/>取り込む（JSON）<input className="sr-only" type="file" accept=".json,application/json" disabled={pending} onChange={e=>{const f=e.target.files?.[0];if(f)void loadBackup(f);e.target.value="";}}/></label></div><p className="field-note">記録・日別メモ・テンプレート・作業・個人設定を含みます。</p>{preview&&backup&&<div className="import-preview"><h3>取り込み内容</h3><dl><div><dt>新しい作業</dt><dd>{preview.categories}種類</dd></div><div><dt>新しい記録</dt><dd>{preview.sessions}件</dd></div><div><dt>新しい日別メモ</dt><dd>{preview.dailyNotes}日分</dd></div><div><dt>既存のためスキップ</dt><dd>作業 {preview.skippedCategories}種類 / 記録 {preview.skippedSessions}件 / メモ {preview.skippedDailyNotes}日分</dd></div></dl>{preview.running&&<p className="field-note">計測中の記録も復元されます。</p>}<label className="checkbox-label"><input type="checkbox" checked={includePrefs} onChange={e=>setIncludePrefs(e.target.checked)}/>個人設定も取り込む</label><div className="modal-actions"><button className="outline-button" onClick={()=>{setBackup(null);setPreview(null);}}>キャンセル</button><button className="primary-button" disabled={pending} onClick={async()=>{const r=await mutate("import",{backup,includePreferences:includePrefs},"取り込みが完了しました");if(r?.state){notesHandle.current?.refresh();setPrefs(r.state.preferences);setBackup(null);setPreview(null);}}}>取り込む</button></div></div>}</section></div>}
      </div>
      {notesActivated&&<Suspense fallback={null}><NotesDock scope={draftScope} target={noteTarget} close={closeNotes} ready={notesReady} reportError={setNoteError}/></Suspense>}
      {view==="punch"&&<section className="today-records"><div className="section-heading"><h2>今日の記録</h2><strong className="today-records-total tabular" aria-label={`今日の記録時間 ${hms(dailyTotal)}`}><DurationValue value={dailyTotal} seconds/></strong><button className="text-button" onClick={()=>{setHistoryDay(today);setHistoryTo(today);go("history");}}>履歴を見る<ArrowRight size={15}/></button></div>{recordTable(visibleDaily)}{daily.length>5&&<button className="more-button" onClick={()=>{setHistoryDay(today);setHistoryTo(today);go("history");}}>すべての記録を見る</button>}</section>}
      {view==="history"&&<HistoryFeed sessions={history} timelineSessions={timelineSessions} categoryFilter={filter} dayStart={state.preferences.dayStart} timezone={state.preferences.timezone} categories={state.categories} addRecord={addSession} anchor={historyPage} focusRequest={historyFocus} focusMode={historyLanding} now={now} range={historyRange?[historyDay,historyTo]:undefined} onToday={()=>{setHistoryLanding("overview");setHistoryRange(false);setHistoryPage(today);setHistoryFocus(v=>v+1);}} openedDay={noteTarget.open?noteTarget.day:undefined} onActiveDay={onHistoryActive} onPage={day=>{setHistoryLanding("overview");setHistoryPage(day);}} openNotes={openNotes} onEdit={editSession} renderRecords={rows=>recordTable(rows,true)}/>}
      </div>
    </main>
    {toast&&<div className={`toast ${toast.error?"error":""}`} role={toast.error?"alert":"status"}>{toast.error?<Bell size={18}/>:<Check size={18}/>}<span>{toast.text}</span>{toast.error&&retry&&<button disabled={pending} onClick={()=>void execute(retry,"完了しました")}><RefreshCw size={14}/>再試行</button>}<button className="toast-close" onClick={()=>{setToast(null);setRetry(null);}} aria-label="通知を閉じる"><X size={16}/></button></div>}
    {deleteTarget&&<Modal title="記録を削除" close={()=>{if(!pending)setDeleteTarget(null);}}><DeleteRecord session={deleteTarget.session} categoryId={deleteTarget.categoryId} categories={state.categories} pending={pending} close={()=>setDeleteTarget(null)} remove={categoryId=>deleteRecord(deleteTarget.session,categoryId)}/></Modal>}
    {editingCategory&&<CategoryEditor value={editingCategory} pending={pending} errorMessage={retry?.action==="category"&&toast?.error?toast.text:undefined} close={()=>setEditingCategory(null)} save={async c=>{if(await mutate("category",c,"作業を保存しました"))setEditingCategory(null);}}/>}
    {editingSession?.work&&<Modal title="記録を編集" close={()=>setEditingSession(null)}><div className="segmented record-edit-tabs"><button className={recordEditMode==="allocation"?"selected":""} onClick={()=>setRecordEditMode("allocation")}>作業時間</button><button className={recordEditMode==="time"?"selected":""} onClick={()=>setRecordEditMode("time")}>日時</button></div>{recordEditMode==="allocation"?<AllocationEditor session={editingSession} categories={state.categories} pending={pending} save={async payload=>{if(await mutate("work",payload,"作業時間を保存しました"))setEditingSession(null);}}/>:<WorkTimeEditor session={editingSession} categories={state.categories} pending={pending} currentTime={()=>minuteInput(Math.round(Date.now()+offset.current),editingSession.timezone)} save={async payload=>{if(await mutate("work",payload,"日時を保存しました"))setEditingSession(null);}}/>}</Modal>}

    {editingSession&&!editingSession.work&&<SessionEditor value={editingSession} categories={state.categories} pending={pending} exists={state.sessions.some(s=>s.id===editingSession.id)} currentTime={()=>minuteInput(Math.round(Date.now()+offset.current),editingSession.timezone)} errorMessage={retry?.action==="session"&&toast?.error?toast.text:undefined} close={()=>setEditingSession(null)} save={async s=>{if(await mutate("session",s,"記録を保存しました"))setEditingSession(null);}} remove={()=>requestDeleteSession(editingSession)}/>}
    {confirm&&<Modal title={confirm.title} close={closeConfirm}><p className="confirm-text">{confirm.text}</p><div className="modal-actions"><button className="outline-button" disabled={confirmPending} onClick={closeConfirm}>キャンセル</button><button className="danger-button" disabled={pending||confirmPending} onClick={()=>void runConfirm()}>{confirmPending&&<LoaderCircle size={15} className="spin"/>}削除する</button></div></Modal>}
  </div>;
}

function ColorInput({value,onChange}:{value:string;onChange:(v:string)=>void}) {return <div className="color-input"><input type="color" aria-label="色を選択" value={value} onChange={e=>onChange(e.target.value)}/><span>{value.toUpperCase()}</span></div>;}
function CategoryEditor({value,pending,errorMessage,close,save}:{value:Category;pending:boolean;errorMessage?:string;close:()=>void;save:(c:Category)=>Promise<void>}) {
  const [c,setC]=useState(value);
  return <Modal title={value.name?"作業を編集":"作業を追加"} close={close}><form onSubmit={e=>{e.preventDefault();void save(c);}}><label className="field">作業名<input autoFocus required maxLength={40} placeholder="作業名" value={c.name} onChange={e=>setC({...c,name:e.target.value})}/></label><div className="field"><span>カラー</span><div className="palette">{PALETTE.map(color=><button type="button" key={color} aria-label={color} aria-pressed={c.color===color} className={c.color===color?"selected":""} style={{background:color,color:contrastText(color)}} onClick={()=>setC({...c,color})}>{c.color===color&&<Check size={16}/>}</button>)}<label className={`custom-swatch ${!PALETTE.includes(c.color)?"selected":""}`} style={!PALETTE.includes(c.color)?{background:c.color,color:contrastText(c.color)}:undefined}><Palette size={16}/><input type="color" aria-label="カスタムカラー" value={c.color} onChange={e=>setC({...c,color:e.target.value})}/></label></div></div><label className="checkbox-label"><input type="checkbox" checked={!c.hidden} onChange={e=>setC({...c,hidden:!e.target.checked})}/>打刻画面に表示</label>{errorMessage&&<p role="alert" className="form-error">{errorMessage}</p>}<div className="modal-actions"><button type="button" className="outline-button" onClick={close}>キャンセル</button><button className="primary-button" disabled={pending||!c.name.trim()}>{pending?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}保存する</button></div></form></Modal>;
}
function SessionEditor({value,categories,pending,exists,errorMessage,currentTime,close,save,remove}:{value:Session;categories:Category[];pending:boolean;exists:boolean;errorMessage?:string;currentTime:()=>string;close:()=>void;save:(s:Session & {expectedMemo?:string})=>Promise<void>;remove:()=>void}) {
  const [categoryId,setCategoryId]=useState(value.categoryId),[start,setStart]=useState(minuteInput(value.startedAt,value.timezone)),[end,setEnd]=useState(value.endedAt===null?"":minuteInput(value.endedAt,value.timezone)),[memo,setMemo]=useState(value.memo),[error,setError]=useState("");
  const [openTime,setOpenTime]=useState<"start"|"end"|null>(null);
  function submit(e:FormEvent){e.preventDefault();try{const startedAt=editedTime(start,value.startedAt,value.timezone),endedAt=end?editedTime(end,value.endedAt,value.timezone):null;if(endedAt!==null&&endedAt<startedAt)throw new Error("終了時刻は開始時刻以降にしてください");setError("");void save({...value,categoryId,startedAt,endedAt,memo,expectedMemo:value.memo});}catch(e){setError((e as Error).message);}}
  return <Modal title={exists?"記録を編集":`${readableDate(value.businessDay)}に追加`} close={close}><form onSubmit={submit}><label className="field">作業<select value={categoryId} required onChange={e=>setCategoryId(e.target.value)}><option value="" disabled>選択してください</option>{categories.filter(c=>!c.archived||c.id===value.categoryId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><DateTimeField label="開始" value={start} open={openTime==="start"} onOpen={open=>setOpenTime(open?"start":null)} onChange={setStart} currentTime={currentTime}/><DateTimeField label="終了" value={end} open={openTime==="end"} onOpen={open=>setOpenTime(open?"end":null)} onChange={setEnd} currentTime={currentTime} allowEmpty/><label className="field">メモ<textarea maxLength={2000} rows={3} value={memo} onChange={e=>setMemo(e.target.value)}/></label>{(error||errorMessage)&&<p role="alert" className="form-error">{error||errorMessage}</p>}<div className="modal-actions">{exists&&<button type="button" className="icon-button danger delete-record" onClick={remove} aria-label="この記録を削除"><Trash2 size={19}/></button>}<button type="button" className="outline-button" onClick={close}>キャンセル</button><button className="primary-button" disabled={pending}>{pending?<LoaderCircle size={16} className="spin"/>:<Check size={16}/>}保存する</button></div></form></Modal>;
}
