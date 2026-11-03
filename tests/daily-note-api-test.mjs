import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:8787';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('API tests are local-only');
const actor='notes-api-'+randomUUID(),other='notes-other-'+randomUUID();
const headers=(user=actor)=>({'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@sites.test'});
async function get(path,user=actor){const response=await fetch(base+path,{headers:headers(user)});return{status:response.status,data:response.status===304?null:await response.json()};}
async function put(input,extra={},user=actor){const response=await fetch(base+'/api/daily-note',{method:'PUT',headers:{...headers(user),'Content-Type':'application/json',Origin:base,...extra},body:JSON.stringify(input)});return{status:response.status,data:await response.json()};}
const day='2026-11-01';const input=(markdown,expectedVersion=0)=>({day,markdown,expectedVersion,mutationId:randomUUID()});
let passed=0;const check=name=>console.log('ok',++passed,'-',name);
const state=(await get('/api/state')).data;
assert.equal((await fetch(base+'/api/daily-note?day='+day)).status,401);check('anonymous read rejected');
assert.equal((await put(input('forbidden'),{Origin:'https://example.invalid'})).status,403);check('cross-origin save rejected');
assert.equal((await get('/api/daily-note?day=2026-02-30')).status,400);check('invalid dates rejected');
const markdown='# 日別メモ\n\n- [x] 自動保存\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n<script>window.bad=true</script>';
const jobs=[input(markdown),input('競合')];const race=await Promise.all(jobs.map(job=>put(job)));assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);const winner=jobs[race.findIndex(r=>r.status===200)];const saved=race.find(r=>r.status===200).data.note;check('concurrent initial saves create one version');
assert.deepEqual((await put(winner)).data.note,saved);check('lost-response retry does not increment note version');
assert.equal((await get('/api/daily-note?day='+day,other)).data.note.markdown,'');check('other user sees no note');
assert.equal((await get(`/api/daily-note?day=${day}&version=1`)).status,304);check('unchanged note returns 304');
assert.equal((await get('/api/state')).data.revision,state.revision);assert.equal((await get('/api/state?revision='+state.revision)).status,304);check('note save leaves punch revision/cache unchanged');
const job={action:'punch',payload:{categoryId:state.categories[0].id},expectedRevision:state.revision,mutationId:randomUUID(),responseMode:'delta'};
const punch=await fetch(base+'/api/action',{method:'POST',headers:{...headers(),'Content-Type':'application/json',Origin:base},body:JSON.stringify(job)});const delta=await punch.json();assert.equal(punch.status,200);assert.equal(delta.punchDelta.sessions.length,1);assert.equal('dailyNotes' in delta,false);check('punch delta remains independent and small');
const exported=(await get('/api/export')).data;assert.equal(exported.version,4);assert.deepEqual(exported.dailyNotes,[{day,markdown:winner.markdown,updatedAt:saved.updatedAt}]);assert.ok(!JSON.stringify(exported).includes(actor));check('portable v4 backup includes raw Markdown without user identity');
const importBackup=async(backup,user=actor)=>{const current=(await get('/api/state',user)).data;const response=await fetch(base+'/api/action',{method:'POST',headers:{...headers(user),'Content-Type':'application/json',Origin:base},body:JSON.stringify({action:'import',payload:{backup,includePreferences:false},expectedRevision:current.revision,mutationId:randomUUID()})});assert.equal(response.status,200,await response.text());};
const v1={...exported,version:1,sessions:[]};delete v1.dailyNotes;await importBackup(v1);assert.equal((await get('/api/daily-note?day='+day)).data.note.markdown,winner.markdown);check('v1 import preserves existing notes');
await importBackup({...exported,sessions:[]},other);assert.equal((await get('/api/daily-note?day='+day,other)).data.note.markdown,winner.markdown);check('v2 import restores notes into another account');
await put({...input('既存優先',1)}, {}, other);await importBackup({...exported,sessions:[]},other);assert.equal((await get('/api/daily-note?day='+day,other)).data.note.markdown,'既存優先');check('import preserves same-day existing notes');
assert.equal((await put({...input(''),day:'2026-11-02',markdown:'a'.repeat(100001)})).status,400);check('oversized Markdown rejected');
console.log(`Daily-note API checks passed: ${passed}`);
