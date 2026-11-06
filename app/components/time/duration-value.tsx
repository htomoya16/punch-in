import { hm, hms } from "../../../lib/time";
/** Live clocks can show seconds while records and reports default to minutes. */
export default function DurationValue({
  value,
  seconds = false,
}: {
  value: number;
  seconds?: boolean;
}) {
  return <span className="duration-value">{seconds ? hms(value) : hm(value)}</span>;
}
