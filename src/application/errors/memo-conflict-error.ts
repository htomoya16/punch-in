export class MemoConflictError extends Error {
  constructor(public currentMemo: string) {
    super("別の画面で更新されています");
  }
}
