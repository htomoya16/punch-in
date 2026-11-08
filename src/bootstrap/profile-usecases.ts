import { env } from "cloudflare:workers";
import { createProfileUseCases } from "../application/usecases/profile/create-profile-usecases";
import { getDatabase } from "../infrastructure/persistence/d1/database";
import { D1ProfileRepository } from "../infrastructure/persistence/d1/profile-repository";
import { R2AvatarStorage } from "../infrastructure/persistence/r2/avatar-storage";
import { systemClock } from "../infrastructure/runtime/system-clock";
import { uuidGenerator } from "../infrastructure/runtime/uuid-generator";

export function createServerProfileUseCases() {
  return createProfileUseCases({
    profiles: new D1ProfileRepository(getDatabase()),
    avatars: new R2AvatarStorage(env.BUCKET),
    clock: systemClock,
    ids: uuidGenerator,
  });
}
