# cpm

Claude Code の plugin を、マニフェスト(`cpm.yml`)に書いた内容へ同期するコマンドラインツールです。
マニフェストを Git で管理すれば、複数のマシンやチーム、CI で同じ構成を再現できます。マニフェストから消した plugin は、次の `cpm sync` で削除されます。

## インストール

必要なもの: Claude Code(`claude` コマンドが PATH にあること)

**Homebrew(macOS / Linux)**

```sh
brew tap ogontaro/cpm https://github.com/ogontaro/cpm
brew install ogontaro/cpm/cpm
```

Homebrew の標準リポジトリには別物の `cpm` があります。必ず `ogontaro/cpm/` を付けてください。

**Linux(Ubuntu、WSL、Docker のイメージなど)**

```sh
# arm64 は cpm-linux-arm64.tar.gz。バージョンを固定するときは latest/download を download/v0.1.0 のようにする
curl -fsSL https://github.com/ogontaro/cpm/releases/latest/download/cpm-linux-amd64.tar.gz \
  | tar -xz -C /usr/local/bin cpm
```

WSL では、WSL の中に Claude Code と cpm を入れてください。Alpine などの musl 環境と、Windows 本体には対応していません。

## 使い方

マニフェストを `~/.claude/cpm.yml`(`CLAUDE_CONFIG_DIR` を設定している場合は `$CLAUDE_CONFIG_DIR/cpm.yml`)に作ります。

```yaml
marketplaces:
  - DietrichGebert/ponytail#v4.10.3
  - ogontaro/skills
plugins:
  - ponytail@ponytail
  - git-usage@ogontaro-skills
```

```sh
cpm sync --dry-run   # 変更内容だけを表示する
cpm sync             # マニフェストの通りに追加・削除する
cpm sync --update    # marketplace と plugin を最新に更新する
cpm list             # cpm が追加したものを表示する
```

plugin の変更は、次のセッションの開始時か、`/reload-plugins` の実行時に反映されます。

## マニフェスト

| キー | 書き方 | 内容 |
|---|---|---|
| `marketplaces` | `owner/repo[#ref]` | GitHub 上の marketplace。`#ref` はタグかブランチ(コミット SHA は不可) |
| `plugins` | `plugin@marketplace` | インストールする plugin。`marketplace` は `marketplace.json` の `name` |
| `includes` | `owner/repo/path/to/cpm.yml[#ref]` | 外部リポジトリのマニフェストを取り込む |
| `autoUpdate` | `true` / `false`(既定 `true`) | cpm が追加した marketplace の自動更新 |

- YAML(`.yml` / `.yaml`)と JSON(`.json`)のどちらでも書けます。
- 場所は `--manifest <path>` か、環境変数 `CPM_MANIFEST` でも指定できます。

### バージョンの固定と更新

- **固定する**: `#v4.10.3` のようにタグを指定します。再現性が必要なら、付け替えないタグを使ってください。
- **追従する**: ブランチを指定するか `#ref` を省略します。自動更新(既定で ON)で、Claude Code が対話セッション中に最新へ追従します。止めるときは `autoUpdate: false` を書きます。切り替えは marketplace 全体に対するもので、plugin ごとには切り替えられません。
- **今すぐ更新する**: `cpm sync --update`

固定できるのは marketplace の ref までです。plugin が必要とする npm パッケージのバージョンなどは、固定できません。

### 外部リポジトリのマニフェスト

チームや組織で共通の構成を 1 か所で管理し、各自のマニフェストから取り込めます。自分の `marketplaces` は、取り込んだ同じリポジトリの指定より優先されます。

```yaml
includes:
  - my-org/claude-config/cpm.json#v2
plugins:
  - git-usage@ogontaro-skills
```

## 削除について

cpm は、自分が追加した marketplace と plugin だけを削除します。追加したものの記録は、設定ディレクトリの `.cpm-state.json` に残ります(マシンごとのファイルなので、Git にはコミットしません)。手動で追加したものには触れません。

## 認証

marketplace の取得は `claude` コマンドが行うので、git の認証設定がそのまま使われます。非公開リポジトリのマニフェストを `includes` で取り込むときは、`GITHUB_TOKEN`(または `GH_TOKEN`、`gh auth token`)を設定してください。

## できないこと

- コミット SHA 単位の固定
- GitHub 以外の marketplace(git の URL やローカルのパス)
- user スコープ以外へのインストール
