# API / JSON移行形式 v1

認証はSitesのSign in with ChatGPTを使用する。全エンドポイントは認証必須。サーバーは信頼済みのリクエストヘッダーからユーザーIDを解決し、クライアントが送る所有者IDは使用しない。レスポンスはno-store。

## GET /api/state

`{ preferences, categories, sessions, revision, serverNow }` を返す。`?revision=N` を付け、本人のrevisionが一致する場合は304（本文なし、X-Server-Nowで時刻を返す）になる。preferencesは個人設定、categoriesはアーカイブ済みを含む種類、sessionsは全記録。serverNowはサーバーのUnixミリ秒。

## POST /api/action

Content-Type: application/json。ブラウザからのクロスサイトリクエストは拒否する。

```json
{
  "action": "punch",
  "payload": { "categoryId": "research" },
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

importPreviewのみ `{ "preview": {"categories": 0, "sessions": 0, "skippedCategories": 0, "skippedSessions": 0, "running": false} }`。

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
  "version": 1,
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
    "id": "research", "name": "研究", "color": "#168ab5",
    "hidden": false, "archived": false, "position": 0
  }],
  "sessions": [{
    "id": "b8cf22cc-1294-4020-9d36-d2a60497258b",
    "categoryId": "research",
    "startedAt": 1793556000000,
    "endedAt": 1793566800000,
    "businessDay": "2026-11-01",
    "dayStart": 300,
    "timezone": "Asia/Tokyo",
    "memo": "論文を読む",
    "createdAt": 1793556000000,
    "updatedAt": 1793566800000
  }]
}
```

- 時刻はすべてUTC基準のUnixミリ秒（64bit整数相当）。endedAtのnullは計測中。
- dayStartは現地時刻の0時からの分数。businessDayはその記録が保持する設定で判定された日付。
- categoriesのID、sessionsのIDはユーザーのスコープ内で一意。新システムのアカウントIDに所有者を再関連づけて移行する。
- エクスポートに認証情報は含まれない。移行先でログインし、その本人のデータとして取り込む。
- 同じIDの取り込みは上書きしない。新しいIDの記録と既存記録が重なる場合は全体を拒否する。
- CSVは分析用。完全な復元にはJSONを利用する。CSVの先頭が式として解釈される文字列には引用符を付加する。
