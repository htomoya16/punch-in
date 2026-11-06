import type { z } from "zod";
import type { NoteTemplate } from "../../domain/notes/note-template";
import type { templateMutation } from "../validation/note-template-schema";

export type TemplateCollection = {
  templates: NoteTemplate[];
  defaultId: string | null;
  version: number;
};

export type TemplateMutation = z.infer<typeof templateMutation>;

export interface NoteTemplateRepository {
  read(userId: string): Promise<TemplateCollection>;
  count(userId: string): Promise<number>;
  mutate(userId: string, input: TemplateMutation): Promise<TemplateCollection>;
  readDefault(userId: string): Promise<NoteTemplate | undefined>;
}
