import { api, json, readJson, userId } from "../../../lib/api";
import { getDatabase } from "../../../lib/database";
import { readDailyNote, writeDailyNote,readDailyNoteIndex } from "../../../lib/daily-note-server";
import { noteDaySchema, noteWriteSchema } from "../../../lib/daily-note-validation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const user = await userId(), url = new URL(request.url);
    if(url.searchParams.get("days")==="1")return json({days:await readDailyNoteIndex(getDatabase(),user)});
    const day = noteDaySchema.parse(url.searchParams.get("day"));
    const note = await readDailyNote(getDatabase(), user, day);
    if (url.searchParams.get("version") === String(note.version)) return new Response(null, { status: 304, headers: { "Cache-Control": "no-store" } });
    return json({ note });
  });
}
export async function PUT(request: Request) {
  return api(async () => {
    const user = await userId();
    const input = noteWriteSchema.parse(await readJson(request, 1024 * 1024));
    return json({ note: await writeDailyNote(getDatabase(), user, input) });
  });
}
