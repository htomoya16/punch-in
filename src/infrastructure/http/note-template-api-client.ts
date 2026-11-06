import type { NoteTemplateApiClient } from "../../application/ports/note-template-api-client";
import type { TemplateCollection } from "../../application/ports/note-template-repository";

export const noteTemplateApiClient: NoteTemplateApiClient = {
  async read() {
    const response = await fetch("/api/note-templates", { cache: "no-store" });
    if (!response.ok) throw new Error("テンプレートを取得できませんでした");
    return (await response.json()) as TemplateCollection;
  },
  async mutate(input: unknown) {
    const response = await fetch("/api/note-templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10000),
    });
    const result = (await response.json()) as TemplateCollection & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "保存できませんでした");
    return result;
  },
};
