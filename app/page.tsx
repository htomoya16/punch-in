import { createServerUseCases } from "../src/bootstrap/server-usecases";
import { requireChatGPTUser } from "../src/infrastructure/auth/sites-authentication";
import PunchInApp from "../src/presentation/app/punch-in-app";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await requireChatGPTUser("/");
  const useCases = createServerUseCases();
  await useCases.initializeUser(user.userId);
  return (
    <PunchInApp
      initial={await useCases.readState(user.userId)}
      displayName={user.displayName}
      draftScope={user.userId}
    />
  );
}
