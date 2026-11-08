import { createServerProfileUseCases } from "../../../../src/bootstrap/profile-usecases";
import { MAX_AVATAR_BYTES } from "../../../../src/domain/profile/user-profile";
import { ApplicationError } from "../../../../src/application/errors/application-error";
import {
  api,
  assertSameOrigin,
  json,
  userId,
} from "../../../../src/presentation/http/api-response";

export const dynamic = "force-dynamic";

function expectedVersion(request: Request) {
  const header = request.headers.get("if-match")?.replace(/^"|"$/g, "");
  if (!header || !/^\d+$/.test(header))
    throw new ApplicationError("invalid_input", "プロフィールを開き直してください");
  return Number(header);
}

export async function GET() {
  return api(async () => {
    const image = await createServerProfileUseCases().readAvatar(await userId());
    if (!image)
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(image.bytes, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  });
}

export async function PUT(request: Request) {
  return api(async () => {
    const user = await userId();
    assertSameOrigin(request);
    const version = expectedVersion(request);
    const reader = request.body?.getReader();
    if (!reader) throw new ApplicationError("invalid_input", "画像を選んでください");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_AVATAR_BYTES) {
          await reader.cancel();
          throw new ApplicationError("payload_too_large", "画像のサイズが大きすぎます");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return json({
      profile: await createServerProfileUseCases().saveAvatar(user, bytes.buffer, version),
    });
  });
}

export async function DELETE(request: Request) {
  return api(async () => {
    const user = await userId();
    assertSameOrigin(request);
    return json({
      profile: await createServerProfileUseCases().removeAvatar(user, expectedVersion(request)),
    });
  });
}
