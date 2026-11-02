import {api,json,readJson,userId} from "../../../lib/api";
import {getDatabase} from "../../../lib/database";
import {sessionMemoSchema,writeSessionMemo} from "../../../lib/session-memo-server";
export const dynamic="force-dynamic";
export async function PUT(request:Request){return api(async()=>json(await writeSessionMemo(getDatabase(),await userId(),sessionMemoSchema.parse(await readJson(request,32000)))));}
