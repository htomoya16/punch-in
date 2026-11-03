import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:8787';if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local-only tests');
// Miniflare can restart its local proxy after an early rejection with an
// unread body. Empty-body auth/CSRF probes still assert the early gates,
// without disrupting the subsequent real writes. Use separate connections.
const actor='memo-api-'+randomUUID(),headers={'oai-authenticated-user-id':actor,'oai-authenticated-user-email':'qa@sites.test','Content-Type':'application/json',Connection:'close',Origin:base};
async function get(path){const r=await fetch(base+path,{headers});return{status:r.status,data:r.status===304?null:await r.json()};}
async function action(action,payload,revision,mode){const r=await fetch(base+'/api/action',{method:'POST',headers,body:JSON.stringify({action,payload,expectedRevision:revision,mutationId:randomUUID(),responseMode:mode??'state'})});return{status:r.status,data:await r.json()};}
async function put(memo,expectedMemo='',extra={}){const r=await fetch(base+'/api/session-memo',{method:'PUT',headers:{...headers,...extra},body:JSON.stringify({id:'memo-record',memo,expectedMemo})});return{status:r.status,data:await r.json()};}
let passed=0;const check=name=>console.log('ok',++passed,'-',name);let state=(await get('/api/state')).data;
let result=await action('session',{id:'memo-record',categoryId:state.categories[0].id,startedAt:1000000,endedAt:1100000,memo:''},state.revision);assert.equal(result.status,200);state=result.data.state;
const anonymous=await fetch(base+'/api/session-memo',{method:'PUT',headers:{'Content-Type':'application/json',Connection:'close'}});await anonymous.text();assert.equal(anonymous.status,401);check('auth required');
const forbidden=await fetch(base+'/api/session-memo',{method:'PUT',headers:{...headers,Origin:'https://example.invalid'}});await forbidden.text();assert.equal(forbidden.status,403);check('cross-origin rejected');
result=await put('直接入力');assert.equal(result.status,200);assert.equal(result.data.memoRevision,1);assert.equal((await get('/api/state')).data.revision,state.revision);check('memo updates independent counter');
await put('直接入力');assert.equal((await get('/api/state')).data.memoRevision,1);check('lost-response replay is idempotent');
assert.equal((await get(`/api/state?revision=${state.revision}&memoRevision=0`)).status,200);assert.equal((await get(`/api/state?revision=${state.revision}&memoRevision=1`)).status,304);check('memo-aware conditional state reads');
assert.equal((await put('競合')).status,409);check('stale text never overwrites');
const race=await Promise.all([put('並行保存','直接入力'),action('punch',{categoryId:state.categories[0].id},state.revision,'delta')]);assert.ok(race.every(r=>r.status===200),JSON.stringify(race));check('punch and memo save both succeed concurrently');
state=(await get('/api/state')).data;const record=state.sessions.find(s=>s.id==='memo-record');assert.equal(record.startedAt,1000000);assert.equal(record.endedAt,1100000);assert.equal(record.memo,'並行保存');check('memo API preserves recorded times');
const backup=(await get('/api/export')).data;assert.equal(backup.sessions.find(s=>s.id==='memo-record').memo,'並行保存');check('backup includes inline memo');
assert.equal((await put('other','',{'oai-authenticated-user-id':'other-'+actor})).status,404);check('owner-scoped writes');
assert.equal((await action('session',{id:record.id,categoryId:record.categoryId,startedAt:record.startedAt,endedAt:record.endedAt,memo:'古い編集画面',expectedMemo:''},state.revision)).status,409);check('full editor cannot overwrite a newer memo');
assert.equal((await put('a'.repeat(2001),'並行保存')).status,400);check('length validation');
console.log(`Session memo API checks passed: ${passed}`);
