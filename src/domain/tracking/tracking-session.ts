export type TrackingSession = {
  id: string;
  categoryId: string;
  startedAt: number;
  endedAt: number | null;
  businessDay: string;
  dayStart: number;
  timezone: string;
  memo: string;
  work?: import("./work-entry").SessionWork;
  createdAt: number;
  updatedAt: number;
};
