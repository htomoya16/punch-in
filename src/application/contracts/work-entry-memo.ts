import { z } from "zod";

export const sessionMemoSchema = z.object({
  id: z.string().min(1).max(100),
  memo: z.string().max(2000),
  expectedMemo: z.string().max(2000),
  categoryId: z.string().min(1).max(100).optional(),
  memberId: z.string().min(1).max(100).optional(),
});

export type MemoWrite = z.infer<typeof sessionMemoSchema>;
