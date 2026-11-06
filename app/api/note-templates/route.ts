import { createServerUseCases } from "../../../src/bootstrap/server-usecases";
import { api, json, readJson, userId } from "../../../src/presentation/http/api-response";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => json(await createServerUseCases().readTemplates(await userId())));
}
export async function PUT(request: Request) {
  return api(async () => {
    const user = await userId();
    return json(
      await createServerUseCases().updateTemplate(user, await readJson(request, 1024 * 1024)),
    );
  });
}
