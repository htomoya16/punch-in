import { action, api, json, userId } from "../../../lib/server";
export const dynamic="force-dynamic";
export async function POST(request:Request) { return api(async()=>json(await action(request,await userId()))); }
