import { api, makeBackup, readState, userId } from "../../../lib/server";
export const dynamic="force-dynamic";
export async function GET() { return api(async()=>new Response(JSON.stringify(makeBackup(await readState(await userId())),null,2),{headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename="punch-in-${new Date().toISOString().slice(0,10)}.json"`,"Cache-Control":"no-store"}})); }
