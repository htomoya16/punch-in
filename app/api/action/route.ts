import { action, api, json, userId } from "../../../lib/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const receivedAt = Date.now(),
    started = performance.now();
  return api(async () =>
    json(await action(request, await userId(), receivedAt), {
      "Server-Timing": `total;dur=${(performance.now() - started).toFixed(1)}`,
    }),
  );
}
