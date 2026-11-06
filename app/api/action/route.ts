import { appActionSchema } from "../../../src/application/contracts/app-action";
import { createServerUseCases } from "../../../src/bootstrap/server-usecases";
import { api, json, readJson, userId } from "../../../src/presentation/http/api-response";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const receivedAt = Date.now();
  const started = performance.now();
  return api(async () => {
    const user = await userId();
    const input = appActionSchema.parse(await readJson(request, 16_000_000));
    const result = await createServerUseCases().executeAction(user, input, receivedAt);
    return json(result, {
      "Server-Timing": `total;dur=${(performance.now() - started).toFixed(1)}`,
    });
  });
}
