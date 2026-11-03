import {api,json,userId,readJson} from '../../../lib/api';
import {getDatabase} from '../../../lib/database';
import {readTemplates,mutateTemplate,templateMutation} from '../../../lib/note-template-server';
export const dynamic='force-dynamic';
export async function GET(){return api(async()=>json(await readTemplates(getDatabase(),await userId())));}
export async function PUT(request:Request){return api(async()=>{const user=await userId();return json(await mutateTemplate(getDatabase(),user,templateMutation.parse(await readJson(request,1024*1024))));});}
