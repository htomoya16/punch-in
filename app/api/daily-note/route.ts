import { createServerUseCases } from "../../../src/bootstrap/server-usecases";
import { api, json, readJson, userId } from "../../../src/presentation/http/api-response";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const user = await userId();
    const useCases = createServerUseCases();
    const parameters = new URL(request.url).searchParams;
    if (parameters.get("days") === "1")
      return json({ days: await useCases.readDailyNoteIndex(user) });
    const note = await useCases.readDailyNote(user, parameters.get("day"));
    if (parameters.get("version") === String(note.version))
      return new Response(null, { status: 304, headers: { "Cache-Control": "no-store" } });
    return json({ note });
  });
}

export async function PUT(request: Request) {
  return api(async () => {
    const user = await userId();
    return json({
      note: await createServerUseCases().saveDailyNote(user, await readJson(request, 1024 * 1024)),
    });
  });
}

export async function POST(request: Request) {
  return api(async () => {
    const user = await userId();
    const body = (await readJson(request, 1000)) as { day: unknown };
    return json({ note: await createServerUseCases().initializeDailyNote(user, body.day) });
  });
}
