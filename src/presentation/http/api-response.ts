import { z } from "zod";
import { ApplicationError } from "../../application/errors/application-error";
import { getChatGPTUser } from "../../infrastructure/auth/sites-authentication";

const errorStatuses = {
  invalid_input: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
} as const;

export async function userId() {
  const user = await getChatGPTUser();
  if (!user) throw new ApplicationError("unauthenticated", "ログインしてください");
  return user.userId;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new ApplicationError("forbidden", "この画面から操作してください");
}

export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  assertSameOrigin(request);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApplicationError("unsupported_media_type", "JSON形式で送信してください");
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new ApplicationError("payload_too_large", "送信内容が大きすぎます");
  const reader = request.body?.getReader();
  if (!reader) throw new ApplicationError("invalid_input", "JSONを読み込めません");
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ApplicationError("payload_too_large", "送信内容が大きすぎます");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApplicationError("invalid_input", "JSONを読み込めません");
  }
}

export function json(data: unknown, headers: Record<string, string> = {}) {
  return Response.json(data, { headers: { "Cache-Control": "no-store", ...headers } });
}

export async function api(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ApplicationError)
      return Response.json(
        { error: error.message, ...error.details },
        { status: errorStatuses[error.code], headers: { "Cache-Control": "no-store" } },
      );
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: error.issues
            .map((i) => i.message)
            .slice(0, 3)
            .join(" / "),
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    console.error("Punch in request failed", error);
    return Response.json(
      { error: "保存できませんでした。時間をおいて再試行してください" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
