import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:8787';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Local Worker only');
const owner=process.env.PERF_USER_ID??'punch-api-'+randomUUID();
const headers={'Content-Type':'application/json','oai-authenticated-user-id':owner,'oai-authenticated-user-email':'perf@sites.test',Origin:base};
let state=await(await fetch(base+'/api/state',{headers})).json();
const initialRecords=state.sessions.length;
const count=Number(process.env.PERF_RECORDS??0);
if(count<0||count>20000)throw Error('PERF_RECORDS must be 0–20000');
const makeJob=(mode='delta')=>({action:'punch',payload:{categoryId:'punch'},responseMode:mode,expectedRevision:state.revision,mutationId:randomUUID()});
async function request(job){const before=performance.now();const r=await fetch(base+'/api/action',{method:'POST',headers,body:JSON.stringify(job)});const body=await r.text();return{status:r.status,data:JSON.parse(body),ms:performance.now()-before,bytes:Buffer.byteLength(body),timing:r.headers.get('server-timing')};}
if(count){const start=Date.parse('2020-01-01T06:00:00Z');const rows=Array.from({length:count},(_,i)=>{const at=start+i*60000;return{id:randomUUID(),categoryId:'punch',startedAt:at,endedAt:at+30000,businessDay:new Date(at+4*3600000).toISOString().slice(0,10),dayStart:300,timezone:'Asia/Tokyo',memo:'performance fixture',createdAt:at,updatedAt:at};});const imported=await request({action:'import',payload:{backup:{format:'punch-in',version:1,exportedAt:new Date().toISOString(),preferences:state.preferences,categories:state.categories,sessions:rows},includePreferences:false},expectedRevision:state.revision,mutationId:randomUUID()});assert.equal(imported.status,200,JSON.stringify(imported.data));state=imported.data.state;}
assert.ok(!state.sessions.some(s=>s.endedAt===null),'Do not interrupt an active local timer');
const fullSamples=[],deltaSamples=[];
for(let i=0;i<6;i++){const r=await request(makeJob('state'));assert.equal(r.status,200);assert.ok(r.data.state);state=r.data.state;fullSamples.push(r);}
for(let i=0;i<6;i++){const r=await request(makeJob());assert.equal(r.status,200);assert.ok(r.data.punchDelta);assert.equal(r.data.state,undefined);assert.ok(r.data.punchDelta.sessions.length<=2);assert.ok(r.bytes<2048,'punch response must not grow with history');state.revision=r.data.punchDelta.revision;deltaSamples.push(r);}
const unchanged=await fetch(base+`/api/state?revision=${state.revision}`,{headers});assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');
const changed=await fetch(base+`/api/state?revision=${state.revision-1}`,{headers});assert.equal(changed.status,200);state=await changed.json();
const jobs=[makeJob(),makeJob()];const raced=await Promise.all(jobs.map(request));assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);const winner=raced.findIndex(r=>r.status===200);const committed=raced[winner].data.punchDelta;
const replay=await request(jobs[winner]);assert.equal(replay.status,200);assert.equal(replay.data.state.revision,committed.revision);assert.equal(replay.data.state.sessions.filter(s=>s.endedAt===null).length,1);state=replay.data.state;
const paused=await request(makeJob());assert.equal(paused.status,200);assert.equal(paused.data.punchDelta.sessions[0].endedAt,null);assert.equal(paused.data.punchDelta.sessions[0].work.members[0].state,'paused');state.revision=paused.data.punchDelta.revision;const stopped=await request(makeJob());assert.equal(stopped.status,200);assert.equal(stopped.data.punchDelta.sessions.length,1);assert.notEqual(stopped.data.punchDelta.sessions[0].endedAt,null);
const median=values=>{const s=[...values].sort((a,b)=>a-b);return(s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2;};
console.log(JSON.stringify({recordsBefore:initialRecords+count,fullResponse:{medianMs:median(fullSamples.map(r=>r.ms)),bytes:fullSamples[0].bytes},deltaResponse:{medianMs:median(deltaSamples.map(r=>r.ms)),bytes:deltaSamples[0].bytes,serverTiming:deltaSamples[0].timing},conditionalGet:{status:304,bytes:0},checks:'delta, compatibility, stale revisions, concurrency and idempotency passed'}));
