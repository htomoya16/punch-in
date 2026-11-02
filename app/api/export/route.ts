import { getDatabase } from "../../../lib/database";
import { readAllDailyNotes } from "../../../lib/daily-note-server";
import { api, makeBackup, readState, userId } from "../../../lib/server";
export const dynamic="force-dynamic";
export async function GET() { return api(async()=>{const user=await userId();const [state,notes]=await Promise.all([readState(user),readAllDailyNotes(getDatabase(),user)]);return new Response(JSON.stringify(makeBackup(state,notes),null,2),{headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename="punch-in-${new Date().toISOString().slice(0,10)}.json"`,"Cache-Control":"no-store"}});} ); }
