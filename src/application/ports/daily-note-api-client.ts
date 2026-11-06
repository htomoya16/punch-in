import { type DailyNote, type NoteWrite } from "../../domain/notes/daily-note";

export type DailyNoteApiClient = {
  read(day: string, version?: number, initialize?: boolean): Promise<DailyNote | null>;
  write(input: NoteWrite): Promise<DailyNote>;
};
