import { type DailyNote } from "../../domain/notes/daily-note";

export class NoteConflictError extends Error {
  constructor(public current: DailyNote) {
    super("別の画面でメモが更新されています");
  }
}
