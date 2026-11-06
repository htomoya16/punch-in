import { formatDurationMinutes, formatDurationSeconds } from "../../../shared/time/duration-format";

/** Live clocks can show seconds while records and reports default to minutes. */
export default function DurationValue({
  value,
  seconds = false,
}: {
  value: number;
  seconds?: boolean;
}) {
  return (
    <span className="duration-value">
      {seconds ? formatDurationSeconds(value) : formatDurationMinutes(value)}
    </span>
  );
}
