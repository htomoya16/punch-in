import {hm} from '../../../lib/time';
/** Keep elapsed time in hours:minutes; the parent controls its visual emphasis. */
export default function DurationValue({value}:{value:number}){
  return <span className="duration-value">{hm(value)}</span>;
}
