import type { TemplateCollection } from "./note-template-repository";

export interface NoteTemplateApiClient {
  read(): Promise<TemplateCollection>;
  mutate(input: unknown): Promise<TemplateCollection>;
}
