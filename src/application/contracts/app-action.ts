import { z } from "zod";

export const appActionSchema = z.object({
  action: z.enum([
    "work",
    "punch",
    "category",
    "archiveCategory",
    "reorder",
    "preferences",
    "session",
    "deleteSession",
    "importPreview",
    "import",
  ]),
  payload: z.unknown(),
  responseMode: z.enum(["state", "delta"]).default("state"),
  pressedAt: z.number().int().nonnegative().optional(),
  expectedRevision: z.number().int().min(0),
  mutationId: z.string().uuid(),
});

export type AppActionInput = z.infer<typeof appActionSchema>;

export type AppActionName = AppActionInput["action"];
