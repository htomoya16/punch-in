# 開発ガイド

[READMEへ戻る](../README.md)

## ローカルで起動する

Node.js >=22.13.0。Vinext / React / TypeScript / Cloudflare Workers / D1。認証はSitesが提供するSign in with ChatGPTを使用する。

初回の空のローカルDBを用意するときだけ、以下のSQL適用を実行します。既存のDBには、未適用のSQLだけを適用してください。

```sh
npm ci
npm run build
for migration in drizzle/*.sql; do
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file "$migration"
done
npm run dev
```

ローカルURLは起動ログに表示される（通常 http://127.0.0.1:5173/ ）。`/signin-with-chatgpt?return_to=/` から開発用アカウントにログインする。開発用認証はloopbackでのみ有効で、productionには含まれない。ローカルDBと本番DBは別。適用済みのマイグレーションは再実行せず、スキーマ変更は新しいSQLとして生成する。

## 検証

```sh
npm run typecheck
npm test
npm run test:api # ローカル開発サーバー起動中。テスト用の種類・記録を作成する
npm run test:session-memo-api # セルのメモ保存・打刻との並行操作を検証
npm run test:blocks-api # ブロックメモの移行・構造保存・復元を検証
npm run test:notes-api # ビルド済みローカルWorkerで日別メモ・移行・競合を検証
npm run test:punch-api # ビルド済みWorkerで差分応答・再試行・条件付き取得を検証
PERF_RECORDS=5000 npm run test:punch-api # 検証用データを作り通信量・待ち時間を比較
npm run test:isolation # npm start -- --port 8787 で起動したビルド済みWorkerに対して実行
npm run build
```

npmのキャッシュが書き込み不可の場合は、`npm_config_cache=/tmp/punch-in-npm-cache npm ci` のように書き込み可能な場所を指定する。

スキーマを変更した場合は、`npm run db:generate`で新しいSQLを生成します。既存のSQLは書き換えず、追加したSQLだけを適用します。

## ソースの構成

全体の責務・依存方向・保存の保証は[アーキテクチャ](ARCHITECTURE.md)を参照してください。フレームワークの入口は`app/`、実装は`src/`にあります。

```sh
npm run format        # 改行・インデントを統一
npm run format:check  # 整形の差分を検出
npm run check:architecture # 依存方向・ブラウザへのサーバー実装混入を検出
```

単体テストは`tests/`と`src/`配下の`.test.ts`から自動検出します。HTTP・ローカルDBの検証スクリプトは従来どおり明示的に実行します。

## Sitesへの反映

`.openai/hosting.json` がSitesのプロジェクトIDとD1バインディングを保持する。Sitesスキルのsource helperでソースのcommit/pushとビルド成果物のパッケージを作り、そのcommitとarchiveを保存・デプロイする。本番マイグレーションはSitesがデプロイ時に適用する。既存のSite IDを維持し、同じアプリを再登録しない。

GitHubのpublicリポジトリとSitesのソースリポジトリを同じGit履歴で同期する。アプリの閲覧範囲はSitesで別に管理し、現在は所有者限定。GitHubのコード変更だけではSitesへ自動公開されない。`.wrangler/`（ローカルDB）、`.sites-runtime/`、`.env*`、認証情報、実際の個人バックアップはコミットしない。

## コミットメッセージ

`<type>: <変更の内容>`に揃えます。機能追加は`feat`、修正は`fix`、文書は`docs`、構造整理は`refactor`、テストは`test`を使い、何を変えたかを具体的に書きます。

並行作業・テンプレートのAPIは、起動したローカルWorkerに対して`node tests/parallel-api-test.mjs`で検証できます。認証ヘッダーを含むテストなので本番では実行しません。


再打刻と週タイムラインの回帰テストは`npm test`に含まれる。起動したローカルWorkerでは`TEST_BASE_URL=http://127.0.0.1:8791 node tests/work-entries-api-test.mjs`で、再打刻・個別メモ・終了時刻・配分・JSON復元・個別削除を確認できる。


日時編集の回帰検証は`npm test`と、ローカルWorkerに対する`TEST_BASE_URL=http://127.0.0.1:8792 node tests/work-time-api-test.mjs`で行う。ホイール共通部品は`src/presentation/components/fields/date-time-field.tsx`、記録日からの初期化は`src/presentation/tracking/record-editor.ts`、並行記録の日時再構成は`src/domain/tracking/edit-work-entry-time.ts`を参照する。
