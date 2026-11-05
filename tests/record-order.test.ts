import test from 'node:test';
import assert from 'node:assert/strict';
import type {Session} from '../lib/model';
import {chronologicalMembers,latestSessionsChronologically} from '../lib/record-order';
import {weekDays} from '../lib/history-week';
import {controlWork,memberKey,setMemo,memoKey} from '../lib/work';
import {editWorkTime} from '../lib/work-time';
const at=Date.parse('2026-11-05T23:00:00+09:00'),minute=60000;
const base:Session={id:'parent',categoryId:'a',memo:'A',startedAt:at,endedAt:null,businessDay:'2026-11-05',dayStart:300,timezone:'Asia/Tokyo',createdAt:at,updatedAt:at};
const record=(id:string,start:number):Session=>({...base,id,startedAt:start,endedAt:start+minute});
test('今日の記録は入力が未整列でも直近5件を選び、開始の早い順に表示する',()=>{
  const source=[record('four',at+4*minute),record('one',at+minute),record('six',at+6*minute),record('two',at+2*minute),record('five',at+5*minute),record('three',at+3*minute)],before=[...source];
  assert.deepEqual(latestSessionsChronologically(source).map(s=>s.id),['two','three','four','five','six']);assert.deepEqual(source,before);
});
test('今日の記録は同時刻の相対順と計測中の直近記録を保持する',()=>{
  const live={...record('live',at+2*minute),endedAt:null},source=[live,record('z',at),record('a',at)];
  assert.deepEqual(latestSessionsChronologically(source).map(s=>s.id),['z','a','live']);assert.equal(latestSessionsChronologically([],5).length,0);
});
test('日をまたぐ記録も表示上の時刻ではなく実際の開始日時で並べる',()=>{
  const late=record('after-midnight',at+2*60*minute),early=record('before-midnight',at);
  assert.deepEqual(latestSessionsChronologically([late,early]).map(s=>s.id),['before-midnight','after-midnight']);
});
test('履歴は同じ日の開始を昇順にし、同時刻の従来のID順は保つ',()=>{
  const source=[record('late',at+minute),record('z',at),record('a',at)];
  assert.deepEqual(weekDays('2026-11-05',source)[3].sessions.map(s=>s.id),['a','z','late']);assert.deepEqual(source.map(s=>s.id),['late','z','a']);
});
test('並行記録の時刻修正が並びに反映され、元の主作業とメモを変えない',()=>{
  const group=controlWork(controlWork(base,'join','b',at+10*minute),'end','',at+60*minute);
  const edited=editWorkTime(group,'b',at-10*minute,at+60*minute,at+120*minute),before=JSON.stringify(edited);
  assert.deepEqual(chronologicalMembers(edited).map(memberKey),['b','a']);assert.equal(edited.work!.members[0].categoryId,'a');assert.equal(edited.memo,'A');assert.equal(JSON.stringify(edited),before);assert.equal(chronologicalMembers(edited),chronologicalMembers(edited));
  const saved=setMemo(edited,memoKey(edited,'b'),'B note');assert.equal(chronologicalMembers(saved)[0].memo,'B note');assert.equal(saved.memo,'A');
});
test('同時に始めた作業の並びを維持し、旧記録では参加区間の開始を使う',()=>{
  const group=controlWork(controlWork(base,'join','b',at),'end','',at+minute);group.work!.members.reverse();
  assert.deepEqual(chronologicalMembers(group).map(memberKey),['b','a']);
  const legacy:Session={...base,work:{version:1,mode:'auto',members:[{categoryId:'a',memo:'A',state:'active',weight:1},{categoryId:'b',memo:'B',state:'finished',weight:1}],intervals:[{start:at,end:at+minute,categoryIds:['b']},{start:at+minute,end:null,categoryIds:['a']}]}};
  assert.deepEqual(chronologicalMembers(legacy).map(memberKey),['b','a']);
});
test('同じ作業の再打刻も別IDのまま時系列に並び、開始不明の旧記録は末尾に置く',()=>{
  const group:Session={...base,work:{version:1,mode:'auto',members:[{id:'a-two',categoryId:'a',memo:'second',state:'finished',weight:1,startedAt:at+minute,endedAt:at+2*minute},{categoryId:'missing',memo:'unknown',state:'finished',weight:1},{categoryId:'a',memo:'first',state:'finished',weight:1,startedAt:at,endedAt:at+minute}],intervals:[]}};
  assert.deepEqual(chronologicalMembers(group).map(m=>[memberKey(m),m.memo]),[['a','first'],['a-two','second'],['missing','unknown']]);
});
