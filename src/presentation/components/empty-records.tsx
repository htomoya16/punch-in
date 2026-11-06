import { Clock3 } from "lucide-react";

export function Empty({ text = "記録がありません" }: { text?: string }) {
  return (
    <div className="empty">
      <Clock3 size={26} strokeWidth={1.3} />
      <span>{text}</span>
    </div>
  );
}
