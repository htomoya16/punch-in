import type { WorkCategory } from "../../domain/categories/work-category";
import type { TrackingSession } from "../../domain/tracking/tracking-session";
import { getWorkEntries } from "../../domain/tracking/work-entry";
import { readableColor } from "../../shared/colors/color-contrast";

export function elapsedColors(session: TrackingSession | undefined, categories: WorkCategory[]) {
  if (!session) return [];
  return getWorkEntries(session)
    .filter((m) => m.state === "active")
    .map((m) => readableColor(categories.find((c) => c.id === m.categoryId)?.color ?? "#64748b"));
}

export function diagonalColors(colors: string[]) {
  return colors.length > 1
    ? `linear-gradient(135deg, ${colors.flatMap((color, i) => [`${color} ${(i / colors.length) * 100}%`, `${color} ${((i + 1) / colors.length) * 100}%`]).join(", ")})`
    : undefined;
}
