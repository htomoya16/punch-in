import type { DailyNote, NoteWrite } from "./daily-note";
import { NoteConflictError, type NoteTransport } from "./daily-notes-store";
export const noteTransport: NoteTransport = {
  async read(day, version, initialize) {
    const response = await fetch(`/api/daily-note?day=${day}${version === undefined ? "" : `&version=${version}`}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (response.status === 304) return null;
    if (!response.ok) throw new Error("メモを取得できませんでした");
    const note=(await response.json() as { note: DailyNote }).note;
    if(initialize&&note.version===0){const init=await fetch("/api/daily-note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({day}),signal:AbortSignal.timeout(10000)});if(!init.ok)throw new Error("メモを作成できませんでした");return (await init.json() as {note:DailyNote}).note;}return note;
  },
  async write(input: NoteWrite) {
    const body = JSON.stringify(input);
    const response = await fetch("/api/daily-note", { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: new TextEncoder().encode(body).byteLength < 60000, signal: AbortSignal.timeout(10000) });
    const result = await response.json() as { note: DailyNote; current?: DailyNote; error?: string };
    if (response.status === 409 && result.current) throw new NoteConflictError(result.current);
    if (!response.ok) throw new Error(result.error || "保存できませんでした");
    return result.note;
  },
};
