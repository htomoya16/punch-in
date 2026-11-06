import { createServerUseCases } from "../../../src/bootstrap/server-usecases";
import { api, userId } from "../../../src/presentation/http/api-response";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    const backup = await createServerUseCases().exportBackup(await userId());
    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="punch-in-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
