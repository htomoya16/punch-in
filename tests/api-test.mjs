import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:5173';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('API tests are local-only');
const actor=process.env.TEST_AUTH_ID;
let authHeaders;
if(actor)authHeaders={'oai-authenticated-user-id':actor,'oai-authenticated-user-email':actor+'@sites.test'};
else{const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');assert.ok(cookie,'local mock auth cookie');authHeaders={cookie};}
async function get(path,auth=true){const r=await fetch(base+path,{headers:auth?authHeaders:{}});return{status:r.status,data:await r.json()};}
async function post(job,extra={}){const r=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders,Origin:base,...extra},body:JSON.stringify(job)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={error:text};}return{status:r.status,data};}
let state=(await get('/api/state')).data;
const initialPrefs={...state.preferences};
const initialOrder=state.categories.filter(c=>!c.archived).map(c=>c.id);
let passed=0;
const ids=[];const categoryId='api-test-'+randomUUID();
function check(name){passed++;console.log('ok',passed,'-',name);}
function job(action,payload,revision=state.revision){return{action,payload,expectedRevision:revision,mutationId:randomUUID()};}
async function act(action,payload,expected=200){const r=await post(job(action,payload));assert.equal(r.status,expected,JSON.stringify(r.data));if(r.data.state)state=r.data.state;return r.data;}
try {
  assert.equal((await get('/api/state',false)).status,401);check('unauthenticated access denied');
  assert.equal((await post(job('preferences',state.preferences),{Origin:'https://example.invalid'})).status,403);check('cross-origin writes denied');
  if(state.sessions.some(s=>s.endedAt===null))throw new Error('Stop the local running timer before API tests');
  await act('category',{id:categoryId,name:'API検証',color:'#168ab5',hidden:false,archived:false,position:900});check('category creation');
  const jobs=[job('punch',{categoryId}),job('punch',{categoryId})];
  const race=await Promise.all(jobs.map(j=>post(j)));assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);state=(await get('/api/state')).data;
  assert.equal(state.sessions.filter(s=>s.endedAt===null).length,1);const first=state.sessions.find(s=>s.endedAt===null);ids.push(first.id);check('simultaneous requests create exactly one timer');
  const revision=state.revision;const winner=jobs[race.findIndex(r=>r.status===200)];const replay=await post(winner);assert.equal(replay.status,200);assert.equal(replay.data.state.revision,revision);assert.equal(replay.data.state.sessions.filter(s=>s.endedAt===null).length,1);check('same mutation retry is idempotent');
  const other=state.categories.find(c=>c.id!==categoryId&&!c.archived).id;
  await act('punch',{categoryId:other});const second=state.sessions.find(s=>s.endedAt===null);ids.push(second.id);assert.equal(state.sessions.find(s=>s.id===first.id).endedAt,second.startedAt);check('switch ends and starts at the same server instant');
  await act('punch',{categoryId:other});assert.equal(state.sessions.filter(s=>s.endedAt===null).length,0);check('same button stops timer');
  const manualId=randomUUID();ids.push(manualId);const start=Date.parse('2020-01-02T03:00:00+09:00'),end=Date.parse('2020-01-02T06:00:00+09:00');
  await act('session',{id:manualId,categoryId,startedAt:start,endedAt:end,memo:'境界の検証'});let manual=state.sessions.find(s=>s.id===manualId);assert.equal(manual.businessDay,'2020-01-01');assert.equal(manual.endedAt-manual.startedAt,3*3600000);check('cross-cutoff manual entry attributed to start day');
  await act('preferences',{...state.preferences,dayStart:480});manual=state.sessions.find(s=>s.id===manualId);assert.equal(manual.dayStart,300);assert.equal(manual.businessDay,'2020-01-01');check('settings do not rewrite historical rules');
  const oldRevision=state.revision;await act('session',{id:randomUUID(),categoryId,startedAt:start+1000,endedAt:end,memo:''},400);state=(await get('/api/state')).data;assert.equal(state.revision,oldRevision);check('overlap rejected without partial mutation');
  await act('session',{id:manualId,categoryId,startedAt:Date.parse('2020-01-02T05:30:00+09:00'),endedAt:end,memo:'修正'});manual=state.sessions.find(s=>s.id===manualId);assert.equal(manual.businessDay,'2020-01-02');assert.equal(manual.dayStart,300);check('editing start date uses the original cutoff');
  const exported=(await get('/api/export')).data;assert.equal(exported.format,'punch-in');assert.equal(exported.version,3);assert.equal('userId' in exported,false);assert.equal('user_id' in exported.sessions[0],false);check('backup contains portable data without auth identity');
  let plan=await act('importPreview',{backup:exported});assert.equal(plan.preview.sessions,0);assert.equal(plan.preview.skippedSessions,exported.sessions.length);check('backup preview detects duplicates');
  const importedId=randomUUID();ids.push(importedId);const t=Date.parse('2019-06-01T03:00:00Z');const importFile={...exported,sessions:[{id:importedId,categoryId,startedAt:t,endedAt:t+3600000,businessDay:'2019-06-01',dayStart:300,timezone:'Asia/Tokyo',memo:'移行検証',createdAt:t,updatedAt:t}]};
  await act('import',{backup:importFile,includePreferences:false});assert.ok(state.sessions.some(s=>s.id===importedId));check('JSON import commits valid records');
  const count=state.sessions.length;await act('import',{backup:importFile,includePreferences:false});assert.equal(state.sessions.length,count);check('repeated import never duplicates');
  const malformed={...importFile,sessions:[{...importFile.sessions[0],id:randomUUID(),businessDay:'2019-05-31'}]};await act('import',{backup:malformed,includePreferences:false},400);check('invalid backup day rejected');
  const c=state.categories.find(c=>c.id===categoryId);await act('category',{...c,hidden:true,name:'変更済み'});assert.equal(state.categories.find(c=>c.id===categoryId).hidden,true);check('category visibility and name persisted');
  const order=state.categories.filter(c=>!c.archived).map(c=>c.id).reverse();await act('reorder',{ids:order});assert.deepEqual(state.categories.filter(c=>!c.archived).map(c=>c.id),order);check('category ordering persisted');
  await act('archiveCategory',{id:categoryId});assert.ok(state.sessions.some(s=>s.categoryId===categoryId));assert.equal(state.categories.find(c=>c.id===categoryId).archived,true);check('category deletion preserves records');
  await act('preferences',initialPrefs);check('preferences restored');
  console.log(`API checks passed: ${passed}`);
} finally {
  state=(await get('/api/state')).data;
  for(const id of ids)if(state.sessions.some(s=>s.id===id))await act('deleteSession',{id});
  const c=state.categories.find(c=>c.id===categoryId);if(c&&!c.archived)await act('archiveCategory',{id:categoryId});
  if(JSON.stringify(state.preferences)!==JSON.stringify(initialPrefs))await act('preferences',initialPrefs);
  const order=state.categories.filter(c=>!c.archived).sort((a,b)=>initialOrder.indexOf(a.id)-initialOrder.indexOf(b.id)).map(c=>c.id);await act('reorder',{ids:order});
}
