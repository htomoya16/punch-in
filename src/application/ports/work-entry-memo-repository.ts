import type { MemoWrite } from "../contracts/work-entry-memo";

export interface WorkEntryMemoRepository {
  save(
    userId: string,
    input: MemoWrite,
  ): Promise<{ id: string; memo: string; memoRevision: number }>;
}
