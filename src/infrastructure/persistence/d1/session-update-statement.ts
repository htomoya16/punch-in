import type { TrackingSession } from "../../../domain/tracking/tracking-session";
import { getWorkEntryId } from "../../../domain/tracking/work-entry";

/** Merge live memo values by stable entry ID in the same structural write. */
export function buildSessionUpdateStatement(
  db: D1Database,
  user: string,
  old: TrackingSession,
  next: TrackingSession,
  token: string,
) {
  const json = JSON.stringify(next.work);
  const primary = getWorkEntryId(next.work!.members[0]);
  return db
    .prepare(
      `UPDATE sessions SET work=json_set(json(?),'$.members',json((
    SELECT json_group_array(json_set(n.value,'$.memo',COALESCE(
      (SELECT json_extract(o.value,'$.memo') FROM json_each(sessions.work,'$.members') o WHERE COALESCE(json_extract(o.value,'$.id'),json_extract(o.value,'$.categoryId'))=COALESCE(json_extract(n.value,'$.id'),json_extract(n.value,'$.categoryId'))),
      CASE WHEN sessions.work IS NULL AND sessions.category_id=COALESCE(json_extract(n.value,'$.id'),json_extract(n.value,'$.categoryId')) THEN sessions.memo ELSE json_extract(n.value,'$.memo') END
    ))) FROM json_each(?,'$.members') n
  ))),memo=COALESCE(
    (SELECT json_extract(o.value,'$.memo') FROM json_each(sessions.work,'$.members') o WHERE COALESCE(json_extract(o.value,'$.id'),json_extract(o.value,'$.categoryId'))=?),
    CASE WHEN work IS NULL AND category_id=? THEN memo ELSE ? END
  ),category_id=?,started_at=?,ended_at=?,business_day=?,updated_at=? WHERE user_id=? AND id=? AND EXISTS(SELECT 1 FROM preferences WHERE user_id=? AND mutation_token=?)`,
    )
    .bind(
      json,
      json,
      primary,
      primary,
      next.memo,
      next.categoryId,
      next.startedAt,
      next.endedAt,
      next.businessDay,
      next.updatedAt,
      user,
      old.id,
      user,
      token,
    );
}
