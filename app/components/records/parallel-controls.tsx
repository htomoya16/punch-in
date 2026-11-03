"use client";

import {memo} from "react";
import {Pause, Play, Square} from "lucide-react";
import type {Category, Session} from "../../../lib/model";
import {memberKey, members, type WorkControl} from "../../../lib/work";
import {hm} from "../../../lib/time";

type Props = {
  session: Session;
  categories: Category[];
  times: ReadonlyMap<string, number>;
  pending: boolean;
  control(action: WorkControl, categoryId?: string): void;
};

export default memo(function ParallelControls({session, categories, times, pending, control}: Props) {
  const unfinished = members(session).filter(member => member.state !== "finished");
  const hasActive = unfinished.some(member => member.state === "active");
  const canResumeBatch = !!session.work?.batchPausedCategoryIds?.length;
  return <div className="parallel-controls">
    {unfinished.map(member => {
      const category = categories.find(item => item.id === member.categoryId);
      const paused = member.state === "paused";
      return <div className="active-work" key={memberKey(member)}>
        <span className="dot" style={{background: category?.color}}/>
        <span>{category?.name}</span><strong>{hm(times.get(memberKey(member)) ?? 0)}</strong>
        <button className="icon-button" disabled={pending} aria-label={`${category?.name}を${paused ? "再開" : "一時停止"}`} onClick={() => control(paused ? "resume" : "pause", member.categoryId)}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button>
        <button className="icon-button" disabled={pending} aria-label={`${category?.name}を終了`} onClick={() => control("finish", member.categoryId)}><Square size={14}/></button>
      </div>;
    })}
    {session.work && <div className="parallel-actions" role="group" aria-label="作業の一括操作">
      {(unfinished.length > 1 || canResumeBatch) && <button className={`batch-button ${canResumeBatch ? "is-resume" : ""}`} disabled={pending || (!canResumeBatch && !hasActive)} onClick={() => control(canResumeBatch ? "resumeAll" : "pauseAll")}>
        {canResumeBatch ? <Play size={15}/> : <Pause size={15}/>}
        {canResumeBatch ? "まとめて再開" : "まとめて一時停止"}
      </button>}
      <button className="batch-button batch-finish" disabled={pending} onClick={() => control("end")}><Square size={14}/>まとめて終了</button>
    </div>}
  </div>;
});
