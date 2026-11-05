import type {Session} from './model';
import {members,memberKey,memberRange,type WorkMember} from './work';

const orderedMembers=new WeakMap<Session,readonly WorkMember[]>();
/** Display order only: retain stable IDs and the stored primary member/memo order. */
export function chronologicalMembers(session:Session):readonly WorkMember[]{
  const cached=orderedMembers.get(session);if(cached)return cached;
  const entries=members(session).map((member,index)=>({member,index,start:member.startedAt??memberRange(session,memberKey(member)).start}));
  entries.sort((a,b)=>a.start===b.start?a.index-b.index:a.start===null?1:b.start===null?-1:a.start-b.start);
  const result=entries.map(entry=>entry.member);orderedMembers.set(session,result);return result;
}
/** Pick the latest records first, then read that window from early to late. */
export function latestSessionsChronologically(sessions:readonly Session[],limit=5):Session[]{
  return [...sessions].sort((a,b)=>b.startedAt-a.startedAt).slice(0,limit).sort((a,b)=>a.startedAt-b.startedAt);
}
