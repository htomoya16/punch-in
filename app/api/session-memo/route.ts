import { createServerUseCases } from "../../../src/bootstrap/server-usecases";
import { api, json, readJson, userId } from "../../../src/presentation/http/api-response";
export const dynamic = "force-dynamic";
export async function PUT(request: Request) {
  return api(async () => {
    const user = await userId();
    return json(
      await createServerUseCases().saveWorkEntryMemo(user, await readJson(request, 32000)),
    );
  });
}
