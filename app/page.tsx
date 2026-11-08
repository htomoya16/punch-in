import { createServerUseCases } from "../src/bootstrap/server-usecases";
import { createServerProfileUseCases } from "../src/bootstrap/profile-usecases";
import { requireChatGPTUser } from "../src/infrastructure/auth/sites-authentication";
import PunchInApp from "../src/presentation/app/punch-in-app";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await requireChatGPTUser("/");
  const useCases = createServerUseCases();
  await useCases.initializeUser(user.userId);
  const [initial, initialProfile] = await Promise.all([
    useCases.readState(user.userId),
    createServerProfileUseCases().readProfile(user.userId),
  ]);
  return (
    <PunchInApp
      initial={initial}
      initialProfile={initialProfile}
      displayName={user.displayName}
      draftScope={user.userId}
    />
  );
}
