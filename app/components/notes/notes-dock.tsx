"use client";
import { lazy, memo, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleAlert, LoaderCircle, RefreshCw, X, Download } from "lucide-react";
import { type NoteTarget } from "../../../lib/daily-note";
import { DailyNotesStore } from "../../../lib/daily-notes-store";
import { noteTransport } from "../../../lib/daily-note-client";
const BlockEditor = lazy(() => import("./block-editor"));
export type NotesHandle = { flushAll(): Promise<boolean>; refresh(): void };
type Props = { scope: string; target: NoteTarget; close(): void; ready(handle: NotesHandle): void; reportError(error: boolean): void };

export default memo(function NotesDock({scope, target, close, ready, reportError}: Props) {
  const [store] = useState(() => {
    let storage: Storage | undefined;
    try { if (typeof window !== "undefined") storage = window.localStorage; } catch { /* Storage is optional. */ }
    return new DailyNotesStore(scope, noteTransport, storage);
  });
  const note = useSyncExternalStore(store.subscribe, () => store.getSnapshot(target.day), () => store.getSnapshot(target.day));
  const [mounted,setMounted]=useState(false);
  useEffect(()=>setMounted(true),[]);
  const dock = useRef<HTMLElement>(null);
  const selectedDay = useRef(target.day); selectedDay.current = target.day;
  useEffect(() => {
    ready({flushAll: () => store.flushAll(), refresh: () => { void store.load(selectedDay.current); }});
    const resume = () => { if (!document.hidden) { if (store.hasUnsaved()) void store.flushAll(); else void store.load(selectedDay.current); } };
    const leave = (event: BeforeUnloadEvent) => { store.persistAll(); if (store.hasUnsaved()) { void store.flushAll(); event.preventDefault(); } };
    const hide = () => { store.persistAll(); void store.flushAll(); };
    window.addEventListener("online", resume); window.addEventListener("focus", resume);
    window.addEventListener("beforeunload", leave); window.addEventListener("pagehide", hide);
    return () => { window.removeEventListener("online", resume); window.removeEventListener("focus", resume); window.removeEventListener("beforeunload", leave); window.removeEventListener("pagehide", hide); store.dispose(); };
  }, [store, ready]);
  useEffect(() => {
    if (!target.open) return;
    void store.load(target.day);
    const poll = setInterval(() => { if (!document.hidden) void store.load(target.day); }, 15000);
    return () => { clearInterval(poll);store.setEditing(target.day,false);void store.flush(target.day); };
  }, [store, target.day, target.open]);
  useEffect(()=>{if(!target.open||!target.reveal||!matchMedia("(max-width:760px)").matches)return;const frame=requestAnimationFrame(()=>dock.current?.scrollIntoView({block:"start",behavior:"auto"}));return()=>cancelAnimationFrame(frame);},[target.open,target.reveal]);
  useEffect(() => { reportError(note.status === "error" || note.status === "conflict"); }, [note.status, reportError]);
  useEffect(() => {
    if (!target.open) return;
    const key = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open], .sidebar.open")) return;
      if (event.key === "Escape" && !(event.target instanceof Element && event.target.closest(".bn-container,.mantine-Popover-dropdown,.bn-menu-dropdown"))) { event.preventDefault(); close(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void store.flush(target.day); }

    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [target.open, target.day, close, store]);
  async function downloadMarkdown(){if(!await store.flush(target.day))return;const current=store.getSnapshot(target.day),url=URL.createObjectURL(new Blob([current.markdown],{type:"text/markdown;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download=`${target.day}.md`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const saving = note.status === "saving" || note.status === "pending";
  const statusLabel = saving ? "保存中" : note.status === "loading" ? "読み込み中" : note.status === "error" ? "保存エラー" : note.status === "conflict" ? "競合あり" : "保存済み";
  return <aside id="daily-notes" ref={dock} tabIndex={-1} className={`notes-dock ${target.open ? "is-open" : ""}`} role="region" aria-label={`${target.day}のメモ`} inert={!target.open} aria-hidden={!target.open}>
    <header className="notes-heading"><time dateTime={target.day}>{target.day.replaceAll("-", "/")}</time><div className="notes-heading-actions"><span className="note-save-status" role="status" aria-label={statusLabel} title={note.status === "error" ? note.error : statusLabel}>{saving || note.status === "loading" ? <LoaderCircle size={14} className="spin"/> : note.status === "error" || note.status === "conflict" ? <CircleAlert size={14}/> : null}</span><button className="icon-button" onClick={()=>void downloadMarkdown()} disabled={!note.loaded} aria-label="Markdownを書き出す" title="Markdownを書き出す"><Download size={16}/></button><button className="icon-button" onClick={close} aria-label="メモを閉じる"><X size={18}/></button></div></header>
    {note.status === "error" && <div className="note-message" role="alert"><span>{note.error}</span><button className="text-button" onClick={() => void store.flush(target.day)}><RefreshCw size={13}/>再試行</button></div>}
    {note.conflict && <div className="note-message note-conflict" role="alert"><span>別の画面で更新されました</span><div><button className="text-button" onClick={() => store.resolve(target.day, "remote")}>最新版を使う</button><button className="text-button" onClick={() => store.resolve(target.day, "mine")}>この内容で上書き</button></div><details><summary>最新版を見る</summary><pre tabIndex={0}>{note.conflict.markdown}</pre></details></div>}
    <div className="notes-body">{mounted&&note.loaded?<Suspense fallback={<div className="note-loading"><LoaderCircle size={18} className="spin"/></div>}><BlockEditor key={target.day} note={note} onChange={(markdown,document)=>store.edit(target.day,markdown,document)} onFocusChange={active=>{store.setEditing(target.day,active);if(!active)store.persistAll();}}/></Suspense>:<div className="note-loading"><LoaderCircle size={18} className="spin"/></div>}</div>
  </aside>;
});
