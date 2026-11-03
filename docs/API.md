# API / JSON移行形式 v3

認証はSitesのSign in with ChatGPTを使用する。全エンドポイントは認証必須。サーバーは信頼済みのリクエストヘッダーからユーザーIDを解決し、クライアントが送る所有者IDは使用しない。レスポンスはno-store。

## GET /api/state

`{ preferences, categories, sessions, revision, memoRevision, serverNow }` を返す。`?revision=N&memoRevision=M` を付け、本人のrevisionとmemoRevisionが一致する場合は304（本文なし、X-Server-Nowで時刻を返す）になる。preferencesは個人設定、categoriesはアーカイブ済みを含む種類、sessionsは全記録。serverNowはサーバーのUnixミリ秒。

## POST /api/action

Content-Type: application/json。ブラウザからのクロスサイトリクエストは拒否する。

```json
{
  "action": "punch",
  "payload": { "categoryId": "punch" },
  "expectedRevision": 0,
  "mutationId": "3ff98a29-2387-469c-aeca-0e398db69500"
}
```

成功は `{ "state": ... }`。打刻にはルートフィールド `responseMode: "delta"` を指定でき、通常は次の差分だけを返す。

```json
{"punchDelta":{"baseRevision":0,"revision":1,"sessions":[],"serverNow":1793556000000}}
```

sessionsは実際に開始・終了した最大2件。クライアントはbaseRevision一致時だけ差分を反映し、それより新しい確定データを古い応答で上書きしない。revisionに欠落があれば全体を再取得する。直前の同じmutationIdの再試行では、処理を繰り返さず `{state}` を返す。

打刻のルートフィールド `pressedAt` は任意のUnixミリ秒。クライアントはサーバーとの時刻差を補正して送信する。サーバーは受信前60秒〜受信後2秒の整数のみ受け入れ、未来は受信時刻へ切り詰める。範囲外・省略は受信時刻を使う。直近の開始・終了より前にならないよう調整する。APIレスポンスのServer-Timingはサーバー内の処理時間を示す。

importPreviewのみ `{ "preview": {"categories": 0, "sessions": 0, "skippedCategories": 0, "skippedSessions": 0, "dailyNotes": 0, "skippedDailyNotes": 0, "running": false} }`。

| action | payload |
|---|---|
| punch | `{categoryId}` |
| category | Category（作成・編集・表示設定） |
| archiveCategory | `{id}` |
| reorder | `{ids: string[]}`（アーカイブ以外の全種類） |
| preferences | Preferences |
| session | `{id,categoryId,startedAt,endedAt,memo}`（開始時の設定と所属日はサーバーが決定） |
| deleteSession | `{id}` |
| importPreview | `{backup}` |
| import | `{backup,includePreferences: boolean}` |

主なエラー: 400 入力不正・時間の重複、401 未認証、403 不正なOrigin、409 他の操作による更新、413 容量超過、500 保存失敗。エラー本体は `{error: string}`。

新しい操作には新しいUUIDのmutationIdを使う。通信失敗による同一操作の再試行には同じmutationIdとexpectedRevisionを使う。409では最新stateを取得し、利用者が確認してから新しい操作として送信する。

## GET /api/export

以下のJSONを添付ファイルとして返す。正確な型は `lib/model.ts`、入力制約は `lib/validation.ts` を参照。

```json
{
  "format": "punch-in",
  "version": 3,
  "exportedAt": "2026-11-01T15:00:00.000Z",
  "preferences": {
    "timezone": "Asia/Tokyo",
    "dayStart": 300,
    "accent": "#168ab5",
    "sidebar": "#000000",
    "reminderEnabled": false,
    "reminderMinutes": 360
  },
  "categories": [{
    "id": "punch", "name": "打刻", "color": "#168ab5",
    "hidden": false, "archived": false, "position": 0
  }],
  "sessions": [{
    "id": "b8cf22cc-1294-4020-9d36-d2a60497258b",
    "categoryId": "punch",
    "startedAt": 1793556000000,
    "endedAt": 1793566800000,
    "businessDay": "2026-11-01",
    "dayStart": 300,
    "timezone": "Asia/Tokyo",
    "memo": "作業のメモ",
    "createdAt": 1793556000000,
    "updatedAt": 1793566800000
  }],
  "dailyNotes": [{ "day": "2026-11-01", "markdown": "# 今日\n\n- 振り返り", "updatedAt": 1793566800000 }]
}
```

- 時刻はすべてUTC基準のUnixミリ秒（64bit整数相当）。endedAtのnullは計測中。
- dayStartは現地時刻の0時からの分数。businessDayはその記録が保持する設定で判定された日付。
- categoriesのID、sessionsのIDはユーザーのスコープ内で一意。新システムのアカウントIDに所有者を再関連づけて移行する。
- エクスポートに認証情報は含まれない。移行先でログインし、その本人のデータとして取り込む。
- 同じIDの取り込みは上書きしない。新しいIDの記録と既存記録が重なる場合は全体を拒否する。
- CSVは分析用。完全な復元にはJSONを利用する。CSVの先頭が式として解釈される文字列には引用符を付加する。

## GET /api/daily-note?day=YYYY-MM-DD

認証済み本人の `{note:{day,markdown,version,updatedAt}}` を返す。未作成は空本文・version 0。`&version=N` が一致すれば304。日別メモの版は打刻のrevisionと独立し、stateには本文を含めない。v3で編集したメモは`document`（`{format:"blocknote",version:1,blocks:[...]}`）と`originalMarkdown`も返す。未移行のメモでは省略する。`?days=1`は本人のメモの日付だけを降順で返す。

## PUT /api/daily-note

`{day,markdown,document?,expectedVersion,mutationId}` をJSONで送る。本文は最大100000文字、構造は700000バイト以内、リクエストは1MiB以内。構造の種類・深さ・ID重複・リンクを検証する。実在する日付とUUIDを検証し、同一Originのみ受け付ける。成功は `{note}`。本人・日付・版が一致した場合にだけ保存し、版を1増やす。同じmutationId・本文の直後の再試行は同じ結果を返す。409は `{error,current:note}` を返し、クライアントは下書きを保持して利用者に選択させる。本文を空にしても行と版は残し、古い画面からの復活を防ぐ。

## 日別メモの移行

v3ではdailyNotesに日付・Markdown・更新日時に加え、任意の`document`と`originalMarkdown`を含める。構造を保持する復元にはv3のJSONを使う。v2は従来のMarkdown形式として取り込み可能。ユーザーID、保存用mutationId、ローカル下書き、CASのversionは含めない。v1も受け付け、日別メモは変更しない。v2/v3は日付重複を拒否し、取り込み先に同じ日付がある場合は既存を優先してスキップする。取り込み中の自動保存とも競合時に上書きしない。上限20000日、全ファイル16MB。

## PUT /api/session-memo

`{id,memo,expectedMemo}` を本人の打刻に送る。本文と期待値は各2000文字以内、リクエストは32KB以内。成功は `{id,memo,memoRevision}`。保存するのはmemoだけで、開始・終了・所属日・updatedAtを変えない。期待した本文が一致した場合だけ更新する。すでに同じ本文なら再試行として成功し、更新を繰り返さない。409は `{error,currentMemo}`、対象が本人の記録に無ければ404を返す。

保存は打刻用revisionと別のmemoRevisionを増やす。打刻の楽観ロックを競合させず、stateの定期取得では両方の変更を検出する。直前の保存応答と古いstate・打刻差分が前後しても、確定したメモを巻き戻さない。

時刻編集のsessionアクションには `expectedMemo` を任意で指定できる。編集画面を開いた後にメモが変わっていれば上書きせず409を返す。対応クライアントは指定する。


ブロックへの初回保存時に、DBの既存Markdownを`originalMarkdown`へ一度だけ保持する。以後の編集で原文を上書きしない。CASと同一操作の再試行では、Markdownと構造の両方を比較する。構造保存済みのメモを、`document`を送らない旧クライアントから上書きする操作は409で拒否する。表や折りたたみの内容はJSONで保持し、Markdown出力は可搬な表現への変換として扱う。
