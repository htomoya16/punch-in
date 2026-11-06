import { z } from "zod";
import { noteDocumentSchema, noteMarkdownSchema } from "./daily-note-schema";

const templateId = z.string().uuid();

export const templateExportSchema = z.object({
  id: templateId,
  name: z.string().trim().min(1).max(80),
  markdown: noteMarkdownSchema,
  document: noteDocumentSchema,
  updatedAt: z.number().int().nonnegative(),
});

export const templateMutation = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: templateId,
    name: z.string().trim().min(1).max(80),
    markdown: noteMarkdownSchema,
    document: noteDocumentSchema,
    expectedVersion: z.number().int().nonnegative(),
    mutationId: templateId,
  }),
  z.object({
    action: z.literal("delete"),
    id: templateId,
    expectedVersion: z.number().int().positive(),
    mutationId: templateId,
  }),
  z.object({
    action: z.literal("default"),
    id: templateId.nullable(),
    expectedVersion: z.number().int().nonnegative(),
    mutationId: templateId,
  }),
]);
