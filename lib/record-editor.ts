import type {Preferences} from './model';
import {fromTimeInput,shiftDay,timeInput,wallParts} from './time';
export type DatePart='year'|'month'|'day'|'hour'|'minute'|'second';
export function dateParts(value:string){const [date,time='00:00:00']=value.split('T'),[year,month,day]=date.split('-').map(Number),[hour,minute,second=0]=time.split(':').map(Number);return{year,month,day,hour,minute,second};}
export function daysInMonth(year:number,month:number){const d=new Date(0);d.setUTCFullYear(year,month,0);return d.getUTCDate();}
export function replaceDatePart(value:string,part:DatePart,next:number){
  const p={...dateParts(value),[part]:next};p.day=Math.min(p.day,daysInMonth(p.year,p.month));
  const n=(v:number)=>String(v).padStart(2,'0');return `${String(p.year).padStart(4,'0')}-${n(p.month)}-${n(p.day)}T${n(p.hour)}:${n(p.minute)}:${n(p.second)}`;
}
/** Keep the selected business day even when its current clock time falls after midnight. */
export function recordTimeForDay(day:string,now:number,preferences:Pick<Preferences,'timezone'|'dayStart'>){
  const p=wallParts(now,preferences.timezone),date=p.hour*60+p.minute<preferences.dayStart?shiftDay(day,1):day;
  const value=`${date}T${timeInput(now,preferences.timezone).split('T')[1]}`;
  const wall=Date.parse(value+'Z');
  for(let minute=0;minute<=180;minute++){try{return fromTimeInput(new Date(wall+minute*60000).toISOString().slice(0,19),preferences.timezone);}catch{/* A daylight-saving gap advances to the first valid minute. */}}
  throw new Error('日時を確認してください');
}
/** Opening and saving an unchanged editor must not round away stored milliseconds. */
export function editedTime(value:string,original:number|null,timezone:string){return original!==null&&(value.length===16||value.length===19)&&timeInput(original,timezone).slice(0,value.length)===value?original:fromTimeInput(value,timezone);}

/** Preserve a saved fractional minute unless the user changes the visible minute value. */
export function editedMinutes(value:string,original:number|null){const minutes=Number(value);if(!Number.isInteger(minutes)||minutes<0)throw new Error('作業時間は0以上の整数（分）で入力してください');return original!==null&&Math.floor(original/60000)===minutes?original:minutes*60000;}
