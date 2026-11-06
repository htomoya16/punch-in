import type { MemoWrite } from "../../application/contracts/work-entry-memo";
import { MemoConflictError } from "../../application/errors/memo-conflict-error";

export async function saveSessionMemo(input: MemoWrite) {
  const response = await fetch("/api/session-memo", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
    signal: AbortSignal.timeout(10000),
  });
  const result = (await response.json()) as {
    id: string;
    memo: string;
    memoRevision?: number;
    error?: string;
    currentMemo?: string;
  };
  if (response.status === 409 && typeof result.currentMemo === "string")
    throw new MemoConflictError(result.currentMemo);
  if (!response.ok) throw new Error(result.error || "保存できませんでした。再試行してください");
  return { ...result, id: input.id };
}
