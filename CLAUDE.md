# CLAUDE.md

cpm は Claude Code のプラグイン・マーケットプレイスを `cpm.yml` から宣言的に管理する CLI(Bun + TypeScript)。

## コマンド

コマンドは原則 mise タスク経由で実行する。bun のバージョンを `.mise.toml` で固定しているため。新しく繰り返し使うコマンドを足すときは、`.mise.toml` にタスクを定義して `mise run` で呼べるようにする。

- `mise run test`
- `mise run typecheck`
- `mise run build`(`dist/cpm` に単一バイナリを生成)

## コード規約

- コメント・README・ユーザー向け文言は日本語で書く
- 書式は周囲のコードに合わせる(2 スペース・ダブルクォート・セミコロン)。formatter が無いので、揃えるのは書く人の役目

## 注意点

- `.cpm-state.json` は端末ごとの状態で、Claude の設定ディレクトリ(既定 `~/.claude`)に置く。コミットや同期の対象にしない。cpm はここに記録したものだけを変更する
- `Formula/cpm.rb` はリリース workflow が生成する。手で編集すると次のリリースで上書きされる

## PR

PR タイトルは Conventional Commits にする。release-drafter がプレフィックスでラベルを付け、リリースノートを組み立てるため。
