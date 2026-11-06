import { CalendarDays, ChartNoAxesCombined, Clock3, LayoutGrid, Settings2 } from "lucide-react";
import { type Period } from "../../shared/time/calendar";

export const NAV = [
  { id: "punch", label: "打刻", icon: Clock3 },
  { id: "history", label: "履歴", icon: CalendarDays },
  { id: "stats", label: "集計", icon: ChartNoAxesCombined },
  { id: "categories", label: "作業", icon: LayoutGrid },
  { id: "settings", label: "設定", icon: Settings2 },
] as const;

export const PERIODS: {
  id: Period;
  label: string;
}[] = [
  { id: "day", label: "日" },
  { id: "week", label: "週" },
  { id: "month", label: "月" },
  { id: "year", label: "年" },
  { id: "all", label: "全期間" },
];
