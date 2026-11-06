import { createServerUseCases } from "../../../src/bootstrap/server-usecases";
import { api, json, userId } from "../../../src/presentation/http/api-response";
export const dynamic = "force-dynamic";

function parseRevision(value: string | null) {
  return value !== null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : undefined;
}

export async function GET(request: Request) {
  return api(async () => {
    const user = await userId();
    const useCases = createServerUseCases();
    const parameters = new URL(request.url).searchParams;
    const revision = parseRevision(parameters.get("revision"));
    const memoRevision = parseRevision(parameters.get("memoRevision")) ?? 0;
    const current = await useCases.readRevision(user);

    if (!current || current.seeded < 2) await useCases.initializeUser(user);
    else if (revision === current.revision && memoRevision === current.memoRevision) {
      return new Response(null, {
        status: 304,
        headers: { "Cache-Control": "no-store", "X-Server-Now": String(Date.now()) },
      });
    }
    return json(await useCases.readState(user));
  });
}
