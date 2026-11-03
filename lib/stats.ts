import {allocations} from "./work";
import type {Session} from "./model";
import {duration,periodRange,shiftDay,type Period} from "./time";
export type StatsBucket={key:string;from:string;to:string;sessions:Session[];completed:Map<string,number>;running?:Session};
export function buildStatsBuckets(sessions:Session[],period:Period,from:string,to:string):StatsBucket[]{
  const monthly=period==="year"||period==="all",buckets=new Map<string,StatsBucket>();
  const get=(key:string)=>{let b=buckets.get(key);if(!b){const range=monthly?periodRange("month",key+"-01"):[key,key];b={key,from:range[0],to:range[1],sessions:[],completed:new Map()};buckets.set(key,b);}return b;};
  if(period!=="all"){let day=from,guard=0;while(day<=to&&guard++<370){get(monthly?day.slice(0,7):day);day=shiftDay(day,1);}}
  for(const session of sessions){if(session.businessDay<from||session.businessDay>to)continue;const b=get(monthly?session.businessDay.slice(0,7):session.businessDay);b.sessions.push(session);if(session.endedAt===null)b.running=session;else for(const [id,value]of allocations(session,0))b.completed.set(id,(b.completed.get(id)??0)+value);}
  return [...buckets.values()].sort((a,b)=>a.key.localeCompare(b.key));
}
export function bucketTimes(bucket:StatsBucket,now:number){const values=new Map(bucket.completed);if(bucket.running)for(const [id,value]of allocations(bucket.running,now))values.set(id,(values.get(id)??0)+value);return values;}
export function sumTimes(values:ReadonlyMap<string,number>){let total=0;for(const value of values.values())total+=value;return total;}
