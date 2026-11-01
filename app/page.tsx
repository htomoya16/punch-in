import { requireChatGPTUser } from "./chatgpt-auth";
import { initialize, readState } from "../lib/server";
import PunchApp from "./punch-app";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await requireChatGPTUser("/");
  await initialize(user.userId);
  return <PunchApp initial={await readState(user.userId)} displayName={user.displayName} />;
}
