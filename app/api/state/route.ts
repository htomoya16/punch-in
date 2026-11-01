import { api, stateResponse, userId } from "../../../lib/server";
export const dynamic="force-dynamic";
export async function GET(request:Request) { return api(async()=>{
  const value=new URL(request.url).searchParams.get("revision");
  const revision=value!==null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined;
  return stateResponse(await userId(),revision);
}); }
