import { api, initialize, json, readState, userId } from "../../../lib/server";
export const dynamic="force-dynamic";
export async function GET() { return api(async()=>{ const user=await userId();await initialize(user);return json(await readState(user)); }); }
