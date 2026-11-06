import { z } from "zod";
import { hasWorkCategory } from "../../../domain/tracking/work-entry";
import type { AppState } from "../../contracts/app-state";
import { ApplicationError } from "../../errors/application-error";
import type { AppMutation } from "../../ports/app-state-repository";
import { categorySchema } from "../../validation/backup-schema";

export function requireCategory(state: AppState, id: string, allowArchived = false) {
  const category = state.categories.find(
    (category) => category.id === id && (allowArchived || !category.archived),
  );
  if (!category) throw new ApplicationError("invalid_input", "作業の種類が見つかりません");
  return category;
}

export function planCategoryChange(
  state: AppState,
  action: "category" | "archiveCategory" | "reorder",
  payload: unknown,
): AppMutation {
  if (action === "category") {
    const category = categorySchema.parse(payload);
    if (!state.categories.some((item) => item.id === category.id) && state.categories.length >= 500)
      throw new ApplicationError("invalid_input", "作業の種類は500件までです");
    if (category.archived)
      throw new ApplicationError("invalid_input", "削除操作を使用してください");
    return { kind: "category", category };
  }

  if (action === "archiveCategory") {
    const { id } = z.object({ id: z.string() }).parse(payload);
    requireCategory(state, id);
    if (state.sessions.some((session) => hasWorkCategory(session, id) && session.endedAt === null))
      throw new ApplicationError("invalid_input", "計測を終了してから削除してください");
    return { kind: "archiveCategory", id };
  }

  const { ids } = z.object({ ids: z.array(z.string()).max(500) }).parse(payload);
  const activeCategories = state.categories.filter((category) => !category.archived);
  if (
    new Set(ids).size !== ids.length ||
    ids.length !== activeCategories.length ||
    activeCategories.some((category) => !ids.includes(category.id))
  )
    throw new ApplicationError("invalid_input", "並び順を確認してください");
  return { kind: "reorder", ids };
}
