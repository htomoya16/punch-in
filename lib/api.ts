import { z } from "zod";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { HttpError } from "./errors";

export async function userId() {
  const user = await getChatGPTUser();
  if (!user) throw new HttpError(401, "ログインしてください");
  return user.userId;
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError(403, "この画面から操作してください");
}
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  assertSameOrigin(request);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "JSON形式で送信してください");
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new HttpError(413, "送信内容が大きすぎます");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "JSONを読み込めません");
  const decoder = new TextDecoder();
  let text = "",
    bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "送信内容が大きすぎます");
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
    throw new HttpError(400, "JSONを読み込めません");
  }
}
export function json(data: unknown, headers: Record<string, string> = {}) {
  return Response.json(data, { headers: { "Cache-Control": "no-store", ...headers } });
}
export async function api(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json(
        { error: error.message, ...error.details },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
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
