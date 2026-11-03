import type {Session} from "./model";
export type HistoryDay={day:string;sessions:Session[]};
export function historyDays(sessions:Session[],noteDays:readonly string[],from:string,to:string,includeNotes=true,range=from!==to):HistoryDay[]{
  const groups=new Map<string,Session[]>(),within=(day:string)=>day<=to&&(!range||day>=from);
  groups.set(to,[]);
  for(const s of sessions)if(within(s.businessDay)){const rows=groups.get(s.businessDay)??[];rows.push(s);groups.set(s.businessDay,rows);}
  if(includeNotes)for(const day of noteDays)if(within(day)&&!groups.has(day))groups.set(day,[]);
  return [...groups].sort(([a],[b])=>b.localeCompare(a)).map(([day,rows])=>({day,sessions:[...rows].sort((a,b)=>b.startedAt-a.startedAt||a.id.localeCompare(b.id))}));
}
