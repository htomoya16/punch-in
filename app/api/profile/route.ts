import { createServerProfileUseCases } from "../../../src/bootstrap/profile-usecases";
import { api, json, readJson, userId } from "../../../src/presentation/http/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(async () =>
    json({ profile: await createServerProfileUseCases().readProfile(await userId()) }),
  );
}

export async function PUT(request: Request) {
  return api(async () => {
    const user = await userId();
    return json({
      profile: await createServerProfileUseCases().saveDisplayName(
        user,
        await readJson(request, 2000),
      ),
    });
  });
}
