/** Display elapsed time consistently; the parent controls the size of its digits. */
export default function DurationValue({value}:{value:number}){
  const minutes=Math.floor(Math.max(0,value)/60000);
  return <span className="duration-value"><span className="duration-number">{Math.floor(minutes/60)}</span><span className="duration-unit">時間</span><span className="duration-number">{String(minutes%60).padStart(2,'0')}</span><span className="duration-unit">分</span></span>;
}
