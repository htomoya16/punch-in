# Punch in

ChatGPT Sitesで作成した、個人向けの時間記録アプリ。
ボタンで記録し、メモと集計で振り返れます。

![打刻と日別メモ](docs/images/punch.webp)

## できること

- 作業ボタンの追加・並び替え・色の変更
- 並行作業の計測、一時停止・再開、時間の配分
- 作業ごとのメモ、日別Markdownメモ、テンプレート
- 週の履歴・タイムライン、期間別のグラフ・集計表
- 1日の区切り・テーマ・プロフィールの設定
- JSONでの引き継ぎ、CSV・Markdownの出力

<details>
<summary>履歴と集計の画面</summary>

![週の履歴](docs/images/history.webp)

![期間別の集計](docs/images/stats.webp)

</details>

初期ボタンは「打刻」1つ。画像は表示用のサンプルデータです。
[アプリ](https://punch-in-personal.linenhatch1.chatgpt.site)は現在、所有者限定で公開しています。

## 開発・資料

React / TypeScript / Vinext · Cloudflare Workers / D1 / R2 · Sign in with ChatGPT

[開発ガイド](docs/DEVELOPMENT.md) · [構成](docs/ARCHITECTURE.md) · [仕様](docs/SPEC.md) · [メモの操作](docs/MEMO.md) · [API・移行](docs/API.md) · [引き継ぎ](docs/HANDOVER.md)
