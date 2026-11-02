import { api, stateResponse, userId } from "../../../lib/server";
export const dynamic="force-dynamic";
export async function GET(request:Request) { return api(async()=>{
  const value=new URL(request.url).searchParams.get("revision");
  const revision=value!==null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined;
  const memoValue=new URL(request.url).searchParams.get("memoRevision");
  const memoRevision=memoValue!==null&&/^\d+$/.test(memoValue)&&Number.isSafeInteger(Number(memoValue))?Number(memoValue):0;
  return stateResponse(await userId(),revision,memoRevision);
}); }
