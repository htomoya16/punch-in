import { createPunchWorkCategory } from "../application/usecases/tracking/punch-work-category";
import { createUpdateTrackingSession } from "../application/usecases/tracking/update-tracking-session";
import { D1TrackingRepository } from "../infrastructure/persistence/d1/d1-tracking-repository";
import { systemClock } from "../infrastructure/runtime/system-clock";
import { uuidGenerator } from "../infrastructure/runtime/uuid-generator";

/** Request-scoped adapters never retain another user's database or identity. */
export function createTrackingUseCases(database: D1Database) {
  const repository = new D1TrackingRepository(database);
  return {
    punch: createPunchWorkCategory({ repository, clock: systemClock, ids: uuidGenerator }),
    update: createUpdateTrackingSession({ repository, clock: systemClock }),
  };
}
