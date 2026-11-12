import assert from "node:assert/strict";
import test from "node:test";
import type {
  MutationIdentity,
  PunchContext,
  TrackingRepository,
  WorkContext,
} from "../src/application/ports/tracking-repository";
import { createPunchWorkCategory } from "../src/application/usecases/tracking/punch-work-category";
import { createUpdateTrackingSession } from "../src/application/usecases/tracking/update-tracking-session";
import type { TrackingSession } from "../src/domain/tracking/tracking-session";
import { applyTrackingCommand } from "../src/domain/tracking/tracking-transitions";

const startedAt = Date.parse("2026-11-05T23:00:00+09:00");
const minute = 60_000;
const identity = { expectedRevision: 7, mutationId: "new-command" };
const base: TrackingSession = {
  id: "record",
  categoryId: "a",
  startedAt,
  endedAt: null,
  businessDay: "2026-11-05",
  dayStart: 300,
  timezone: "Asia/Tokyo",
  memo: "A note",
  createdAt: startedAt,
  updatedAt: startedAt,
};

class MemoryTrackingRepository implements TrackingRepository {
  async commitRecordEdit(): Promise<boolean> {
    throw new Error("Unexpected record edit");
  }
  context: PunchContext = {
    preferences: {
      revision: 7,
      mutationId: "previous-command",
      timezone: "Asia/Tokyo",
      dayStart: 300,
    },
    categoryAvailable: true,
    latestEndedAt: 0,
  };
  session = base;
  overlap = false;
  acceptsCommit = true;
  writes: { userId: string; identity: MutationIdentity; next: TrackingSession }[] = [];
  async loadPunchContext() {
    return this.context;
  }
  async loadWorkContext(): Promise<WorkContext> {
    return {
      preferences: this.context.preferences,
      categoryAvailable: this.context.categoryAvailable,
      session: this.session,
    };
  }
  async hasOverlap() {
    return this.overlap;
  }
  async commitSession(
    userId: string,
    identity: MutationIdentity,
    _previous: TrackingSession | undefined,
    next: TrackingSession,
  ) {
    this.writes.push({ userId, identity, next });
    return this.acceptsCommit;
  }
}

function operations(repository: MemoryTrackingRepository) {
  const clock = { now: () => startedAt + 1000 };
  return {
    punch: createPunchWorkCategory({
      repository,
      clock,
      ids: { generate: () => "fixed-record-id" },
    }),
    update: createUpdateTrackingSession({ repository, clock }),
  };
}

test("UsecaseはD1なしで時計・ID・所有者を注入して打刻を確定する", async () => {
  const repository = new MemoryTrackingRepository();
  const result = await operations(repository).punch(
    "owner",
    { ...identity, payload: { categoryId: "a" }, pressedAt: startedAt - 1000 },
    startedAt,
  );
  assert.equal(result?.sessions[0].id, "fixed-record-id");
  assert.equal(result?.sessions[0].startedAt, startedAt - 1000);
  assert.equal(result?.sessions[0].businessDay, "2026-11-05");
  assert.equal(result?.serverNow, startedAt + 1000);
  assert.equal(repository.writes.length, 1);
  assert.equal(repository.writes[0].userId, "owner");
  assert.equal(repository.writes[0].identity.mutationId, identity.mutationId);
});

test("再試行済みの打刻は再保存せず、古いrevisionも書き込まない", async () => {
  const repository = new MemoryTrackingRepository();
  repository.context.preferences!.mutationId = identity.mutationId;
  assert.equal(
    await operations(repository).punch(
      "owner",
      { ...identity, payload: { categoryId: "a" } },
      startedAt,
    ),
    null,
  );
  assert.equal(repository.writes.length, 0);
  repository.context.preferences!.mutationId = "different";
  repository.context.preferences!.revision = 8;
  await assert.rejects(
    operations(repository).punch("owner", { ...identity, payload: { categoryId: "a" } }, startedAt),
    { code: "conflict" },
  );
  assert.equal(repository.writes.length, 0);
});

test("保存時に競合した場合は成功の差分を返さない", async () => {
  const repository = new MemoryTrackingRepository();
  repository.acceptsCommit = false;
  await assert.rejects(
    operations(repository).punch("owner", { ...identity, payload: { categoryId: "a" } }, startedAt),
    { code: "conflict" },
  );
});

test("一時停止後の終了は最後に計測した時刻で確定し、他の作業を続ける", async () => {
  const repository = new MemoryTrackingRepository();
  const joined = applyTrackingCommand(base, "join", "b", startedAt + minute);
  repository.session = applyTrackingCommand(joined, "pause", "a", startedAt + 2 * minute);
  const result = await operations(repository).update(
    "owner",
    { ...identity, payload: { id: base.id, control: "finish", categoryId: "a" } },
    startedAt + 10 * minute,
  );
  assert.equal(result?.sessions[0].work?.members[0].endedAt, startedAt + 2 * minute);
  assert.equal(result?.sessions[0].work?.members[1].state, "active");
  assert.equal(result?.sessions[0].memo, "A note");
});

test("日時変更の重複が見つかった場合、Portへの保存を行わない", async () => {
  const repository = new MemoryTrackingRepository();
  repository.session = applyTrackingCommand(
    applyTrackingCommand(base, "join", "b", startedAt + minute),
    "end",
    "",
    startedAt + 5 * minute,
  );
  repository.overlap = true;
  await assert.rejects(
    operations(repository).update(
      "owner",
      {
        ...identity,
        payload: {
          id: base.id,
          control: "timing",
          memberId: "a",
          startedAt,
          endedAt: startedAt + 4 * minute,
        },
      },
      startedAt + 10 * minute,
    ),
    { code: "invalid_input" },
  );
  assert.equal(repository.writes.length, 0);
});
