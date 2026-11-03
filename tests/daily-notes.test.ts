import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { readDailyNote, writeDailyNote, readAllDailyNotes } from "../lib/daily-note-server";
import { emptyDailyNote, type DailyNote, type NoteWrite } from "../lib/daily-note";
import { DailyNotesStore, NoteConflictError, type NoteTransport } from "../lib/daily-notes-store";
import { noteWriteSchema } from "../lib/daily-note-validation";
import { planImport } from "../lib/records";
import type { AppState } from "../lib/model";
const day="2026-11-01";
const job=(markdown:string,expectedVersion=0):NoteWrite=>({day,markdown,expectedVersion,mutationId:crypto.randomUUID()});
function database(){
  const sqlite=new DatabaseSync(":memory:");
  for(const file of readdirSync("drizzle").filter(f=>f.endsWith(".sql")).sort())sqlite.exec(readFileSync("drizzle/"+file,"utf8"));
  const fake={prepare(sql:string){return{bind(...values:(string|number|null)[]){return{async first(){return sqlite.prepare(sql).get(...values)??null;},async all(){return{results:sqlite.prepare(sql).all(...values)};}};}};}};
  return{sqlite,d:fake as unknown as D1Database};
}
function memory(){const values=new Map<string,string>();return{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);},values};}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};}
function remoteTransport(initial=emptyDailyNote(day)){
  let remote={...initial};const writes:NoteWrite[]=[];
  const transport:NoteTransport={async read(){return{...remote};},async write(input){writes.push(input);if(input.expectedVersion!==remote.version)throw new NoteConflictError({...remote});remote={day:input.day,markdown:input.markdown,version:remote.version+1,updatedAt:Date.now()};return{...remote};}};
  return{transport,writes,get remote(){return remote;},set remote(value:DailyNote){remote=value;}};
}

test("日別メモの所有者分離・CAS・同じ保存の再試行・空メモの保持",async()=>{
  const {sqlite,d}=database();try{
    assert.deepEqual(await readDailyNote(d,"a",day),emptyDailyNote(day));
    const input=job("# 日本語\n\n- [x] 完了");const first=await writeDailyNote(d,"a",input);
    assert.equal(first.version,1);assert.deepEqual(await writeDailyNote(d,"a",input),first);
    assert.equal((await readDailyNote(d,"b",day)).markdown,"");
    await writeDailyNote(d,"b",job("別ユーザー"));
    await assert.rejects(()=>writeDailyNote(d,"a",job("古い画面",0)),error=>(error as {status:number}).status===409);
    const blank=await writeDailyNote(d,"a",job("",1));assert.equal(blank.version,2);
    assert.equal((await readAllDailyNotes(d,"a"))[0].markdown,"");
    assert.deepEqual(Object.keys((await readAllDailyNotes(d,"a"))[0]).sort(),["day","markdown","updatedAt"]);
    assert.equal((await readDailyNote(d,"b",day)).markdown,"別ユーザー");
  }finally{sqlite.close();}
});
test("メモの保存は打刻のrevisionを変更しない",async()=>{const {sqlite,d}=database();try{sqlite.exec("INSERT INTO preferences(user_id,revision) VALUES('a',42)");await writeDailyNote(d,"a",job("ノート"));assert.equal(sqlite.prepare("SELECT revision FROM preferences WHERE user_id='a'").get()?.revision,42);}finally{sqlite.close();}});
test("日付と本文の上限を検証する",()=>{assert.equal(noteWriteSchema.safeParse({...job(""),day:"2026-02-30"}).success,false);assert.equal(noteWriteSchema.safeParse({...job(""),day:"2024-02-29"}).success,true);assert.equal(noteWriteSchema.safeParse(job("a".repeat(100001))).success,false);});
test("取得中に入力しても入力内容を消さず、取得した版から保存する",async()=>{const f=remoteTransport(),read=deferred<DailyNote>();f.transport.read=()=>read.promise;const store=new DailyNotesStore("a",f.transport,memory(),60000);try{const loading=store.load(day);store.edit(day,"入力中");read.resolve(emptyDailyNote(day));await loading;assert.equal(store.getSnapshot(day).markdown,"入力中");assert.equal(await store.flush(day),true);assert.equal(f.remote.markdown,"入力中");}finally{store.dispose();}});
test("保存中の追加入力は古い応答で戻さず、順番に保存する",async()=>{const f=remoteTransport(),saved=deferred<DailyNote>(),original=f.transport.write;let first=true;f.transport.write=async input=>{if(first){first=false;await saved.promise;}return original(input);};const store=new DailyNotesStore("a",f.transport,memory(),60000);try{await store.load(day);store.edit(day,"先");const flush=store.flush(day);store.edit(day,"後");saved.resolve(emptyDailyNote(day));assert.equal(await flush,true);assert.equal(f.remote.markdown,"後");assert.equal(store.getSnapshot(day).markdown,"後");assert.deepEqual(f.writes.map(w=>w.expectedVersion),[0,1]);}finally{store.dispose();}});
test("通信結果不明の再試行では同じmutation ID・本文・版を送る",async()=>{const f=remoteTransport(),original=f.transport.write;const attempts:NoteWrite[]=[];let failed=false;f.transport.write=async input=>{attempts.push({...input});if(!failed){failed=true;throw new TypeError("offline");}return original(input);};const store=new DailyNotesStore("a",f.transport,memory(),60000);try{await store.load(day);store.edit(day,"保存対象");assert.equal(await store.flush(day),false);store.edit(day,"追加入力");assert.equal(await store.flush(day),true);assert.deepEqual(attempts[0],attempts[1]);assert.equal(f.remote.markdown,"追加入力");}finally{store.dispose();}});
test("競合時は入力を保持し、明示した場合だけ最新版を上書きする",async()=>{const f=remoteTransport();const store=new DailyNotesStore("a",f.transport,memory(),60000);try{await store.load(day);store.edit(day,"自分の下書き");f.remote={day,markdown:"別画面",version:1,updatedAt:1};assert.equal(await store.flush(day),false);assert.equal(store.getSnapshot(day).markdown,"自分の下書き");assert.equal(store.getSnapshot(day).conflict?.markdown,"別画面");assert.equal(f.remote.markdown,"別画面");store.resolve(day,"mine");await store.flush(day);assert.equal(f.remote.markdown,"自分の下書き");}finally{store.dispose();}});
test("下書きを再読込しても別ユーザーに混ざらず、サーバーの変更を検知する",async()=>{const f=remoteTransport(),storage=memory(),store=new DailyNotesStore("a",f.transport,storage,60000);await store.load(day);store.edit(day,"復元する下書き");store.dispose();f.remote={day,markdown:"他端末",version:1,updatedAt:1};const restored=new DailyNotesStore("a",f.transport,storage,60000),other=new DailyNotesStore("b",f.transport,storage,60000);try{assert.equal(restored.getSnapshot(day).markdown,"復元する下書き");assert.equal(other.getSnapshot(day).markdown,"");await restored.load(day);assert.equal(restored.getSnapshot(day).status,"conflict");restored.resolve(day,"remote");assert.equal(restored.getSnapshot(day).markdown,"他端末");assert.equal(storage.values.size,0);}finally{restored.dispose();other.dispose();}});
test("日付を切り替え・閉じても元の日付の保存が完了する",async()=>{const rows=new Map<string,DailyNote>();const transport:NoteTransport={async read(day){return rows.get(day)??emptyDailyNote(day);},async write(input){const saved={day:input.day,markdown:input.markdown,version:1,updatedAt:1};rows.set(input.day,saved);return saved;}};const store=new DailyNotesStore("a",transport,memory(),60000);try{await store.load(day);store.edit(day,"前日");await store.load("2026-11-02");store.edit("2026-11-02","翌日");assert.equal(await store.flushAll(),true);assert.equal(rows.get(day)?.markdown,"前日");assert.equal(rows.get("2026-11-02")?.markdown,"翌日");}finally{store.dispose();}});
test("バックアップv1互換とv2の日別メモ重複検査・既存優先",()=>{const state:AppState={preferences:{timezone:"Asia/Tokyo",dayStart:300,accent:"#168ab5",sidebar:"#000000",reminderEnabled:false,reminderMinutes:360},categories:[],sessions:[],revision:0,serverNow:0};const v1={format:"punch-in",version:1,exportedAt:new Date().toISOString(),preferences:state.preferences,categories:[],sessions:[]};assert.deepEqual(planImport(state,v1,new Set([day])).dailyNotes,[]);const note={day,markdown:"# そのまま\n\n```go\nmain()\n```",updatedAt:1};const v2={...v1,version:2,dailyNotes:[note]};assert.deepEqual(planImport(state,v2).dailyNotes,[note]);assert.equal(planImport(state,v2,new Set([day])).preview.skippedDailyNotes,1);assert.throws(()=>planImport(state,{...v2,dailyNotes:[note,note]}));});

test("Markdown原文を残してブロックへ移行し、再試行と旧クライアントからの上書きを防ぐ",async()=>{
  const {sqlite,d}=database();try{
    const original="# 元の見出し\n\n本文  \n次の行\n";await writeDailyNote(d,"a",job(original));
    const document={format:"blocknote" as const,version:1 as const,blocks:[{id:"heading",type:"heading",props:{level:1},content:[{type:"text",text:"元の見出し",styles:{}}],children:[]}]};
    const input={...job("# 元の見出し\n",1),document};const saved=await writeDailyNote(d,"a",input);
    assert.equal(saved.originalMarkdown,original);assert.deepEqual(saved.document,document);assert.deepEqual(await writeDailyNote(d,"a",input),saved);
    await assert.rejects(()=>writeDailyNote(d,"a",job("古いエディター",saved.version)),e=>(e as {status:number}).status===409);
    await assert.rejects(()=>writeDailyNote(d,"a",{...input,document:{...document,blocks:[{...document.blocks[0],props:{level:2}}]}}),e=>(e as {status:number}).status===409);
    const exported=(await readAllDailyNotes(d,"a"))[0];assert.equal(exported.originalMarkdown,original);assert.deepEqual(exported.document,document);
    assert.equal((await readDailyNote(d,"b",day)).document,undefined);
  }finally{sqlite.close();}
});
test("Markdownが同じでも構造の変更を保存し、下書きと送信中の追加入力を保つ",async()=>{
  const disk=memory(),gate=deferred<void>();let first=true;const writes:NoteWrite[]=[];
  const transport:NoteTransport={async read(d){return emptyDailyNote(d);},async write(input){writes.push({...input});if(first){first=false;await gate.promise;}return{...emptyDailyNote(input.day),markdown:input.markdown,document:input.document,version:writes.length,updatedAt:1};}};
  const doc=(level:number)=>({format:"blocknote" as const,version:1 as const,blocks:[{id:"one",type:"paragraph",props:{textAlignment:level===1?"left":"center"},content:[],children:[]}]});
  const store=new DailyNotesStore("block",transport,disk,60000);try{await store.load(day);store.edit(day,"同じ本文",doc(1));const saving=store.flush(day);store.edit(day,"同じ本文",doc(2));gate.resolve();assert.equal(await saving,true);assert.equal(writes.length,2);assert.deepEqual(writes[1].document,doc(2));store.edit(day,"下書き",doc(2));store.persistAll();const restored=new DailyNotesStore("block",transport,disk,60000);try{assert.deepEqual(restored.getSnapshot(day).document,doc(2));assert.equal(restored.getSnapshot(day).markdown,"下書き");}finally{restored.dispose();}}finally{store.dispose();}
});
test("v3で表・折りたたみ・原文を保持し、v2のMarkdownも引き続き取り込む",()=>{
  const state:AppState={preferences:{timezone:"Asia/Tokyo",dayStart:300,accent:"#168ab5",sidebar:"#000000",reminderEnabled:false,reminderMinutes:360},categories:[],sessions:[],revision:0,serverNow:0};
  const document={format:"blocknote",version:1,blocks:[{id:"toggle",type:"toggleListItem",props:{},content:[],children:[{id:"table",type:"table",props:{},content:{type:"tableContent",rows:[{cells:[[{type:"text",text:"値",styles:{bold:true}}]]}]},children:[]}]}]};
  const note={day,markdown:"Markdown",document,originalMarkdown:"元の本文",updatedAt:1};const backup={format:"punch-in",version:3,exportedAt:new Date().toISOString(),preferences:state.preferences,categories:[],sessions:[],dailyNotes:[note]};
  assert.deepEqual(planImport(state,backup).dailyNotes,[note]);assert.throws(()=>planImport(state,{...backup,dailyNotes:[{...note,document:{...document,version:99}}]}));
  assert.deepEqual(planImport(state,{...backup,version:2,dailyNotes:[{day,markdown:"旧形式",updatedAt:1}]}).dailyNotes,[{day,markdown:"旧形式",updatedAt:1}]);
});
