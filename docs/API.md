# API / JSON移行形式 v4

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

sessionsは実際に開始・終了した最大2件（通常の並行追加は親1件）。クライアントはbaseRevision一致時だけ差分を反映し、それより新しい確定データを古い応答で上書きしない。revisionに欠落があれば全体を再取得する。直前の同じmutationIdの再試行では、処理を繰り返さず `{state}` を返す。

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
  "version": 4,
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
  "dailyNotes": [{ "day": "2026-11-01", "markdown": "# 今日\n\n- 振り返り", "updatedAt": 1793566800000 }],
  "templates": [],
  "defaultTemplateId": null
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

v3ではdailyNotesに日付・Markdown・更新日時に加え、任意の`document`と`originalMarkdown`を含める。構造を保持する復元にはv3/v4のJSONを使う。v2は従来のMarkdown形式として取り込み可能。ユーザーID、保存用mutationId、ローカル下書き、CASのversionは含めない。v1も受け付け、日別メモは変更しない。v2〜v4は日付重複を拒否し、取り込み先に同じ日付がある場合は既存を優先してスキップする。取り込み中の自動保存とも競合時に上書きしない。上限20000日、全ファイル16MB。

## PUT /api/session-memo

`{id,memo,expectedMemo}` を本人の打刻に送る。本文と期待値は各2000文字以内、リクエストは32KB以内。成功は `{id,memo,memoRevision}`。保存するのはmemoだけで、開始・終了・所属日・updatedAtを変えない。期待した本文が一致した場合だけ更新する。すでに同じ本文なら再試行として成功し、更新を繰り返さない。409は `{error,currentMemo}`、対象が本人の記録に無ければ404を返す。

保存は打刻用revisionと別のmemoRevisionを増やす。打刻の楽観ロックを競合させず、stateの定期取得では両方の変更を検出する。直前の保存応答と古いstate・打刻差分が前後しても、確定したメモを巻き戻さない。

時刻編集のsessionアクションには `expectedMemo` を任意で指定できる。編集画面を開いた後にメモが変わっていれば上書きせず409を返す。対応クライアントは指定する。


ブロックへの初回保存時に、DBの既存Markdownを`originalMarkdown`へ一度だけ保持する。以後の編集で原文を上書きしない。CASと同一操作の再試行では、Markdownと構造の両方を比較する。構造保存済みのメモを、`document`を送らない旧クライアントから上書きする操作は409で拒否する。表や折りたたみの内容はJSONで保持し、Markdown出力は可搬な表現への変換として扱う。

## 並行作業（v4）

`POST /api/action`の`action: "work"`は`{id,control,categoryId?}`を受け付ける。controlは`join`・`pause`・`resume`・`finish`・`end`・`pauseAll`・`resumeAll`・`remove`。`remove`はcategoryIdの作業だけを削除し、最後の1作業はdeleteSessionで記録全体を削除する。終了後の配分は`{id,control:"allocate",mode:"auto"|"ratio"|"manual",values?:{[categoryId]:number}}`。manualの値は独立したミリ秒、ratioは非負の重み（合計は正）。共通の打刻時刻を変更しない。通常は`{punchDelta}`、直前の再試行は`{state}`を返す。

Sessionの任意フィールド`work`は`{version:1,mode,members,intervals,batchPausedCategoryIds?}`。membersは`{categoryId,memo,state:"active"|"paused"|"finished",weight,manualMs?,startedAt?,endedAt?}`、intervalsは`{start,end:null|number,categoryIds:string[]}`。親記録は同時に1件、内部区間は重複せず、最大50作業・10000区間。存在しないworkは従来の100%単独記録として解釈する。

`PUT /api/session-memo`は並行記録に`categoryId`を追加し、対象メモだけCASで保存する。親memoは先頭作業との互換ミラー。並行記録を旧session編集APIで上書きすることは拒否する。

## テンプレート（v4）

- `GET /api/note-templates` → `{templates:[{id,name,markdown,document,version,updatedAt}],defaultId,version}`。末尾versionはデフォルト選択の版。
- `PUT /api/note-templates` → actionは`save`（id,name,markdown,document,expectedVersion,mutationId）、`delete`（id,expectedVersion,mutationId）、`default`（idまたはnull,expectedVersion,mutationId）。idとmutationIdはUUID。所有者ごとに最大100件。
- `POST /api/daily-note` → `{day}`。未作成のときだけデフォルトを複製する。既存の本文・空にしたメモは変更しない。GETは作成しない。
- DailyNoteとNoteWriteは任意の`template:{id,fingerprint}`を持つ。fingerprintはIDを除いたブロック構造のSHA-256（末尾追加後は空文字）。本文と同じCASで保存する。
- JSON v4は`templates`（CASのversionを除く本体）と`defaultTemplateId`、`sessions.work`、`dailyNotes.template`を含む。旧v1〜v3も受け付ける。既存テンプレートIDは上書きせず、デフォルトは個人設定を取り込む場合だけ復元する。

通常のpunchは、未計測の別カテゴリを並行追加し、計測中ならその作業を終了、一時停止中なら再開する。親記録がなければ新しく開始する。個別削除でも親IDと開始側の記録日を維持し、先頭カテゴリが変わったときはcategoryIdと互換memoを残る先頭作業に合わせる。作業別メモの書き込みはカテゴリIDで対象を原子的に解決する。

作業別のstartedAt/endedAtは任意の追加情報なのでJSON v4のまま引き継げる。終了時刻は一時停止の終端と区別して保存する。旧データの個別時刻は参加区間から推定し、元データを書き換えない。履歴CSVの開始・終了も作業ごとの時刻を使い、集計CSVは作業ごとの計上時間と、その合計を「計上時間」行で出力する。実時間の合計行は含めない。


`pauseAll`は計測中のメンバーを同一時刻で一時停止し、`batchPausedCategoryIds`へ対象IDを保持する。`resumeAll`はそのIDのうち一時停止中の作業だけ再開する。先に個別停止していた作業は含めない。任意フィールドのため、既存のJSON v4・work version 1と互換で、DBマイグレーションは不要。IDは重複なし・最大50件で、現在の一時停止中メンバーだけを受け付ける。個別再開・終了・削除と全体終了では対象を除去する。版番号、再試行トークン、押下時刻の補正、メモの原子的な保持は既存のwork操作と共通。
