import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:8792';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local only');
const actor='time-'+randomUUID(),headers=user=>({'Content-Type':'application/json',Origin:base,'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'});
async function request(path,body,user=actor){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:headers(user),...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};}
let state=(await request('/api/state')).data,n=0;const check=label=>console.log('ok',++n,'-',label);
async function action(action,payload,extra={}){const r=await request('/api/action',{action,payload,expectedRevision:state.revision,mutationId:randomUUID(),responseMode:'delta',...extra});assert.equal(r.status,200,JSON.stringify(r.data));state=(await request('/api/state')).data;return r;}
const b=randomUUID();await action('category',{id:b,name:'B',color:'#12a89a',hidden:false,archived:false,position:1});const at=state.serverNow;
await action('punch',{categoryId:'punch'},{pressedAt:at-55000});const id=state.sessions[0].id;
await action('punch',{categoryId:b},{pressedAt:at-50000});await action('punch',{categoryId:'punch'},{pressedAt:at-40000});await action('punch',{categoryId:'punch'},{pressedAt:at-35000});await action('punch',{categoryId:'punch'},{pressedAt:at-30000});await action('work',{id,control:'end'},{pressedAt:at-10000});
let s=state.sessions[0],entry=s.work.members.at(-1),key=entry.id;
const memoResponse=await fetch(base+'/api/session-memo',{method:'PUT',headers:headers(actor),body:JSON.stringify({id,categoryId:'punch',memberId:key,memo:'keep this memo',expectedMemo:''})});assert.equal(memoResponse.status,200);
const sibling=s.work.members[0],token=randomUUID();const payload={id,control:'timing',memberId:key,startedAt:at-25000,endedAt:at-15000};
await action('work',payload,{mutationId:token});s=state.sessions[0];assert.equal(s.work.members.at(-1).startedAt,at-25000);assert.equal(s.work.members.at(-1).endedAt,at-15000);assert.equal(s.work.members.at(-1).memo,'keep this memo');assert.deepEqual(s.work.members[0],sibling);check('editing a repeated entry preserves its memo and sibling timestamps');
const revision=state.revision,replay=await request('/api/action',{action:'work',payload,expectedRevision:revision-1,mutationId:token});assert.equal(replay.status,200);assert.equal(replay.data.state.revision,revision);check('retry does not edit twice');
const overlap=await request('/api/action',{action:'work',payload:{...payload,startedAt:at-45000},expectedRevision:revision,mutationId:randomUUID()});assert.equal(overlap.status,400);assert.equal((await request('/api/state')).data.revision,revision);check('overlap with the earlier entry is rejected without mutation');
await request('/api/state',undefined,actor+'-other');const foreign=await request('/api/action',{action:'work',payload,expectedRevision:0,mutationId:randomUUID()},actor+'-other');assert.equal(foreign.status,404);check('another user cannot change the entry');
await action('session',{id:randomUUID(),categoryId:'punch',startedAt:at-100000,endedAt:at-80000,memo:'other record'});
const conflict=await request('/api/action',{action:'work',payload:{id,control:'timing',memberId:'punch',startedAt:at-90000,endedAt:sibling.endedAt},expectedRevision:state.revision,mutationId:randomUUID()});assert.equal(conflict.status,400);assert.match(conflict.data.error,/重なって/);check('overlap with another parent record is rejected');
const invalid=await request('/api/action',{action:'work',payload:{...payload,endedAt:at+60000},expectedRevision:state.revision,mutationId:randomUUID()});assert.equal(invalid.status,400);check('future timestamps are rejected');
const backup=(await request('/api/export')).data;assert.equal(backup.version,4);assert.equal(backup.sessions.find(x=>x.id===id).work.members.at(-1).startedAt,at-25000);check('edited timestamps remain portable in v4 backup');
console.log(`Work-time API checks passed: ${n}`);
