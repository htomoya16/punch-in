import { HttpError } from "./errors";
import { emptyDailyNote, type DailyNote, type DailyNoteExport, type NoteWrite } from "./daily-note";
import {noteContentKey} from "./note-document";
type NoteRow = { day:string;markdown:string;version:number;updated_at:number;mutation_id:string;document:string|null;original_markdown:string|null;template:string|null };
const columns="day,markdown,version,updated_at,mutation_id,document,original_markdown,template";
function noteFromRow(row:NoteRow):DailyNote{return{day:row.day,markdown:row.markdown,version:row.version,updatedAt:row.updated_at,...(row.template?{template:JSON.parse(row.template)}:{}),...(row.document?{document:JSON.parse(row.document)}:{}),...(row.original_markdown!==null&&row.original_markdown!==undefined?{originalMarkdown:row.original_markdown}:{})};}
export async function readDailyNote(db:D1Database,user:string,day:string):Promise<DailyNote>{const row=await db.prepare(`SELECT ${columns} FROM daily_notes WHERE user_id=? AND day=?`).bind(user,day).first<NoteRow>();return row?noteFromRow(row):emptyDailyNote(day);}
export async function writeDailyNote(db:D1Database,user:string,input:NoteWrite):Promise<DailyNote>{
  const now=Date.now(),document=input.document?JSON.stringify(input.document):null;
  const saved=input.expectedVersion===0
    ?await db.prepare(`INSERT INTO daily_notes (user_id,day,markdown,version,mutation_id,updated_at,document,original_markdown,template) VALUES (?,?,?,1,?,?,?,?,?) ON CONFLICT(user_id,day) DO NOTHING RETURNING ${columns}`).bind(user,input.day,input.markdown,input.mutationId,now,document,document?"":null,input.template?JSON.stringify(input.template):null).first<NoteRow>()
    :await db.prepare(`UPDATE daily_notes SET original_markdown=CASE WHEN ? IS NOT NULL THEN COALESCE(original_markdown,markdown) ELSE original_markdown END,markdown=?,document=?,template=COALESCE(?,template),version=version+1,mutation_id=?,updated_at=? WHERE user_id=? AND day=? AND version=? AND mutation_id<>? AND (document IS NULL OR ? IS NOT NULL) RETURNING ${columns}`).bind(document,input.markdown,document,input.template?JSON.stringify(input.template):null,input.mutationId,now,user,input.day,input.expectedVersion,input.mutationId,document).first<NoteRow>();
  if(saved)return noteFromRow(saved);
  const current=await db.prepare(`SELECT ${columns} FROM daily_notes WHERE user_id=? AND day=?`).bind(user,input.day).first<NoteRow>();
  if(current?.mutation_id===input.mutationId&&noteContentKey(noteFromRow(current))===noteContentKey(input))return noteFromRow(current);
  throw new HttpError(409,"別の画面でメモが更新されています",{current:current?noteFromRow(current):emptyDailyNote(input.day)});
}
export async function readAllDailyNotes(db:D1Database,user:string):Promise<DailyNoteExport[]>{const rows=await db.prepare(`SELECT ${columns} FROM daily_notes WHERE user_id=? ORDER BY day`).bind(user).all<NoteRow>();return rows.results.map(row=>{const{version:_version,...note}=noteFromRow(row);return note;});}
export async function readDailyNoteDays(db:D1Database,user:string):Promise<Set<string>>{const rows=await db.prepare("SELECT day FROM daily_notes WHERE user_id=?").bind(user).all<{day:string}>();return new Set(rows.results.map(r=>r.day));}

export async function readDailyNoteIndex(db:D1Database,user:string):Promise<string[]>{const rows=await db.prepare("SELECT day FROM daily_notes WHERE user_id=? AND length(trim(markdown,char(9)||char(10)||char(13)||' '))>0 ORDER BY day DESC").bind(user).all<{day:string}>();return rows.results.map(r=>r.day);}
