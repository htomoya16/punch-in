# Punch in

研究・個人開発・就活などの作業時間を、種類ごとのボタンで記録する個人向けWebアプリ。

- ひと押しで開始・終了・作業の切り替え
- ユーザー別の1日の区切り、タイムゾーン、ボタン・テーマの色
- 日別Markdownメモ（自動保存・編集とプレビュー・下書き復元）
- 履歴、セルで直接入力する打刻メモ、タイムライン、検索、手動修正
- 日・週・月・年・全期間の集計表・グラフ・内訳表示と前期間比較
- JSONバックアップ・復元、履歴と集計のCSV出力
- 終了忘れ通知（アプリを開いている間）

## 開発

Node.js >=22.13.0。Vinext / React / TypeScript / Cloudflare Workers / D1。認証はSitesが提供するSign in with ChatGPTを使用する。

```sh
npm ci
npm run db:generate # スキーマを変更した場合のみ
npm run build
for migration in drizzle/*.sql; do
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file "$migration"
done
npm run dev
```

ローカルURLは起動ログに表示される（通常 http://127.0.0.1:5173/ ）。`/signin-with-chatgpt?return_to=/` から開発用アカウントにログインする。開発用認証はloopbackでのみ有効で、productionには含まれない。ローカルDBと本番DBは別。適用済みのマイグレーションは再実行せず、スキーマ変更は新しいSQLとして生成する。

```sh
npm run typecheck
npm test
npm run test:api # ローカル開発サーバー起動中。テスト用の種類・記録を作成する
npm run test:session-memo-api # セルのメモ保存・打刻との並行操作を検証
npm run test:notes-api # ビルド済みローカルWorkerで日別メモ・移行・競合を検証
npm run test:punch-api # ビルド済みWorkerで差分応答・再試行・条件付き取得を検証
PERF_RECORDS=5000 npm run test:punch-api # 検証用データを作り通信量・待ち時間を比較
npm run test:isolation # npm start -- --port 8787 で起動したビルド済みWorkerに対して実行
npm run build
```

npmのキャッシュが書き込み不可の場合は、`npm_config_cache=/tmp/punch-in-npm-cache npm ci` のように書き込み可能な場所を指定する。

## ソースの構成

| 場所 | 内容 |
|---|---|
| `app/punch-app.tsx`, `app/globals.css` | クラウド勤怠Plusを参考にしたレスポンシブUI |
| `app/api/` | 認証済みAPI |
| `lib/punch-server.ts`, `lib/punch-state.ts` | 打刻の差分処理・即時仮表示・確定値への反映 |
| `lib/daily-notes-store.ts`, `lib/daily-note-server.ts`, `app/components/notes/` | 日別メモの保存・復元・独立したエディター |
| `lib/server.ts` | 所有者スコープ、楽観ロック、atomic batchによる書き込み |
| `lib/time.ts` | 日付、タイムゾーン、期間、経過時間の純粋関数 |
| `lib/records.ts`, `lib/validation.ts` | 時間重複、取り込み検証 |
| `db/schema.ts`, `drizzle/` | DB構造と追記式マイグレーション |
| `docs/SPEC.md` | 合意した仕様と判断 |
| `docs/API.md` | APIと移行JSONの仕様 |
| `docs/HANDOVER.md` | 再実装・運用の引き継ぎ |

## 公開

`.openai/hosting.json` がSitesのプロジェクトIDとD1バインディングを保持する。Sitesスキルのsource helperでソースのcommit/pushとビルド成果物のパッケージを作り、そのcommitとarchiveを保存・デプロイする。本番マイグレーションはSitesがデプロイ時に適用する。既存のSite IDを維持し、同じアプリを再登録しない。

GitHubのpublicリポジトリとSitesのソースリポジトリを同じGit履歴で同期する。アプリの閲覧範囲はSitesで別に管理し、現在は所有者限定。GitHubのコード変更だけではSitesへ自動公開されない。`.wrangler/`（ローカルDB）、`.sites-runtime/`、`.env*`、認証情報、実際の個人バックアップはコミットしない。
