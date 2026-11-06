import { browserMemoStorage } from "../infrastructure/browser/memo-draft-storage";
import { appApiClient } from "../infrastructure/http/app-api-client";
import { saveSessionMemo } from "../infrastructure/http/work-entry-memo-api-client";
import { WorkEntryMemoStore } from "../presentation/tracking/work-entry-memo-store";

export function createClientServices(
  scope: string,
  onMemoSaved: (id: string, memo: string, revision?: number) => string | void,
) {
  return {
    api: appApiClient,
    memos: new WorkEntryMemoStore(scope, saveSessionMemo, onMemoSaved, browserMemoStorage()),
  };
}
