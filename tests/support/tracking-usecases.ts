import type { TrackingMutation } from "../../src/application/ports/tracking-repository";
import { createTrackingUseCases } from "../../src/bootstrap/tracking-usecases";

export { mapTrackingSessionRow } from "../../src/infrastructure/persistence/d1/tracking-row-mapper";
export function persistPunch(
  database: D1Database,
  user: string,
  input: TrackingMutation,
  receivedAt: number,
) {
  return createTrackingUseCases(database).punch(user, input, receivedAt);
}
export function persistTrackingCommand(
  database: D1Database,
  user: string,
  input: TrackingMutation,
  receivedAt: number,
) {
  return createTrackingUseCases(database).update(user, input, receivedAt);
}
