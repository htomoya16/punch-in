import type {Session} from './model';
import {periodRange,shiftDay} from './time';
export function weekDays(anchor:string,sessions:Session[]){const [from]=periodRange('week',anchor),byDay=new Map<string,Session[]>();for(const s of sessions){const rows=byDay.get(s.businessDay)??[];rows.push(s);byDay.set(s.businessDay,rows);}return Array.from({length:7},(_,i)=>{const day=shiftDay(from,i);return{day,sessions:[...(byDay.get(day)??[])].sort((a,b)=>a.startedAt-b.startedAt||a.id.localeCompare(b.id))};});}
