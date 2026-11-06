"use client";

import { Pause, Play, Square } from "lucide-react";
import { memo } from "react";
import type { WorkCategory } from "../../../domain/categories/work-category";
import type { TrackingSession } from "../../../domain/tracking/tracking-session";
import {
  getWorkEntries,
  getWorkEntryId,
  type TrackingControl,
} from "../../../domain/tracking/work-entry";
import DurationValue from "../../components/time/duration-value";

type Props = {
  session: TrackingSession;
  categories: WorkCategory[];
  times: ReadonlyMap<string, number>;
  pending: boolean;
  control(action: TrackingControl, categoryId?: string): void;
};

export default memo(function ParallelControls({
  session,
  categories,
  times,
  pending,
  control,
}: Props) {
  const unfinished = getWorkEntries(session).filter((member) => member.state !== "finished");
  const hasActive = unfinished.some((member) => member.state === "active");
  const canResumeBatch = !!session.work?.batchPausedCategoryIds?.length;
  return (
    <div className="parallel-controls">
      {unfinished.map((member) => {
        const category = categories.find((item) => item.id === member.categoryId);
        const paused = member.state === "paused";
        return (
          <div className="active-work" key={getWorkEntryId(member)}>
            <span className="dot" style={{ background: category?.color }} />
            <span>{category?.name}</span>
            <strong>
              <DurationValue value={times.get(getWorkEntryId(member)) ?? 0} seconds />
            </strong>
            <button
              className="icon-button"
              disabled={pending}
              aria-label={`${category?.name}を${paused ? "再開" : "一時停止"}`}
              onClick={() => control(paused ? "resume" : "pause", member.categoryId)}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button
              className="icon-button"
              disabled={pending}
              aria-label={`${category?.name}を終了`}
              onClick={() => control("finish", member.categoryId)}
            >
              <Square size={14} />
            </button>
          </div>
        );
      })}
      {session.work && (
        <div className="parallel-actions" role="group" aria-label="作業の一括操作">
          {(unfinished.length > 1 || canResumeBatch) && (
            <button
              className={`batch-button ${canResumeBatch ? "is-resume" : ""}`}
              disabled={pending || (!canResumeBatch && !hasActive)}
              onClick={() => control(canResumeBatch ? "resumeAll" : "pauseAll")}
            >
              {canResumeBatch ? <Play size={15} /> : <Pause size={15} />}
              {canResumeBatch ? "まとめて再開" : "まとめて一時停止"}
            </button>
          )}
          <button
            className="batch-button batch-finish"
            disabled={pending}
            onClick={() => control("end")}
          >
            <Square size={14} />
            まとめて終了
          </button>
        </div>
      )}
    </div>
  );
});
