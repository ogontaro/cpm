# cpm

Claude Code の plugin を、マニフェスト(`cpm.yml`)に書いた内容へ同期するコマンドラインツールです。
`claude plugin` コマンドで marketplace の登録と plugin のインストール・削除を行い、マニフェストの通りの状態に揃えます。

マニフェストを Git で管理すれば、複数のマシンやチーム、CI で同じ構成を再現できます。マニフェストから消した plugin は、次の `cpm sync` で削除されます。

## インストール

```sh
brew tap ogontaro/cpm https://github.com/ogontaro/cpm
brew install ogontaro/cpm/cpm
```

Homebrew の標準リポジトリには別物の `cpm`(Perl のモジュールインストーラ)があります。必ず `ogontaro/cpm/` を付けてください。両方を同時に入れることはできません。

[Releases](https://github.com/ogontaro/cpm/releases) から、macOS / Linux(arm64・amd64)のバイナリを直接ダウンロードすることもできます。Homebrew を使わない Linux(Ubuntu、WSL、Docker のイメージなど)では、次のように入れます。WSL では、WSL の中に Claude Code と cpm の両方を入れてください。

```sh
# amd64 の場合。arm64 は cpm-linux-arm64.tar.gz
curl -fsSL https://github.com/ogontaro/cpm/releases/latest/download/cpm-linux-amd64.tar.gz \
  | tar -xz -C /usr/local/bin cpm
```

バージョンを固定するときは、`latest/download` を `download/v0.1.0` のようにタグ指定に変えてください。Linux のバイナリは glibc 向けで、Ubuntu 22.04 / 24.04 と Debian 12 で動作を確認しています。Alpine などの musl 環境には対応していません。Windows 本体(WSL を使わない環境)には対応していません。

必要なもの: Claude Code(`claude` コマンドが PATH にあること)

## 使い方

1. マニフェストを `~/.claude/cpm.yml`(`CLAUDE_CONFIG_DIR` を設定している場合は `$CLAUDE_CONFIG_DIR/cpm.yml`)に作ります。

   ```yaml
   marketplaces:
     - DietrichGebert/ponytail#v4.10.3
     - ogontaro/skills
   plugins:
     - ponytail@ponytail
     - git-usage@ogontaro-skills
   ```

2. 実行内容を確認してから、同期します。

   ```sh
   cpm sync --dry-run   # 変更内容だけを表示する
   cpm sync             # 追加・削除を適用する
   cpm sync --update    # marketplace と plugin を最新に更新する
   ```

出力の記号は次のとおりです。

| 記号 | 意味 |
|---|---|
| `+` | 追加(marketplace の登録、plugin のインストール) |
| `~` | 変更(marketplace の ref の変更、`--update` による更新) |
| `-` | 削除(マニフェストから外された) |

plugin の変更は、次のセッションの開始時か、`/reload-plugins` の実行時に反映されます。

## マニフェスト

| キー | 書き方 | 内容 |
|---|---|---|
| `marketplaces` | `owner/repo[#ref]` | GitHub 上の marketplace。`claude plugin marketplace add` に渡されます |
| `plugins` | `plugin@marketplace` | インストールする plugin。`marketplace` は、その marketplace の `marketplace.json` にある `name` です |
| `includes` | `owner/repo/path/to/cpm.yml[#ref]` | 外部リポジトリのマニフェスト([後述](#外部リポジトリのマニフェストを取り込む)) |
| `autoUpdate` | `true` / `false`(既定 `true`) | cpm が追加した marketplace の自動更新([後述](#バージョンの固定と更新)) |

- `#ref` にはタグかブランチを指定します。コミット SHA は指定できません。
- マニフェストは YAML(`.yml` / `.yaml`)と JSON(`.json`)のどちらでも書けます。
- マニフェストの場所は `--manifest <path>` または環境変数 `CPM_MANIFEST` でも指定できます。
- 対象は user スコープの plugin です。

### バージョンの固定と更新

marketplace を `#タグ` で指定すると、そのタグの内容に固定されます。ブランチを指定するか `#ref` を省略したときは、登録した時点の内容になります。

更新は、次のどちらかで行います。

| 方法 | 動作 |
|---|---|
| 自動更新(既定で ON) | cpm が追加した marketplace に、Claude Code の自動更新を設定します。ブランチや付け替えられるタグを指定した marketplace は、Claude Code が対話セッション中に自動で追従します |
| `cpm sync --update` | その場で、宣言した marketplace と plugin を最新にします |

自動更新を使わないときは、マニフェストに `autoUpdate: false` を書きます。

- 切り替えは、cpm が追加した marketplace 全体に対するものです。plugin ごとには切り替えられません。
- `settings.json` の `extraKnownMarketplaces.<名前>.autoUpdate` に書き込みます。手動で追加した marketplace には設定しません。
- 付け替えない固定のタグ(`#v1.2.3` など)の marketplace は、自動更新が ON でも変わりません。
- plugin の `plugin.json` に `version` がある場合、`version` を上げずに内容だけ変えても更新されません。`version` が無い plugin は、コミット SHA が版になります。
- 更新の内容は、次のセッションの開始時か、`/reload-plugins` の実行時に反映されます。

固定されるのは marketplace の ref までです。次のものは固定できません。

- `marketplace.json` が別のリポジトリや ref を指している plugin(作者が決めます)
- plugin が必要とする npm パッケージのバージョン(インストール時に解決されます)

## 外部リポジトリのマニフェストを取り込む

`includes` に、GitHub 上のマニフェストファイルを `owner/repo/path/to/cpm.yml[#ref]` で指定すると、その `marketplaces` と `plugins` を取り込みます。チームや組織で共通の構成を 1 か所で管理し、各自のマニフェストから参照する使い方ができます。

```yaml
includes:
  - my-org/claude-config/cpm.json#v2
plugins:
  - git-usage@ogontaro-skills
```

- 取り込んだマニフェストが、さらに `includes` を持っていても構いません(入れ子は 5 段まで)。
- 自分の `marketplaces` は、取り込んだ同じリポジトリの指定を上書きします。
- 別々の `includes` が、同じリポジトリを異なる ref で指定するときはエラーになります。
- `#ref` を省略すると、`cpm sync` のたびに既定ブランチの最新を読みます。固定したいときはタグを指定してください。

## 削除について

cpm は、自分が追加した marketplace と plugin だけを削除します。何を追加したかは、設定ディレクトリの `.cpm-state.json` に記録されます。このファイルはマシンごとのものなので、Git にはコミットしません。

- 別のマシンでマニフェストから外された marketplace や plugin も、pull したあとの `cpm sync` で削除されます。
- 手動で追加した marketplace や plugin には触れません。マニフェストに同じものを書いても、cpm の管理下にはならず、マニフェストから外しても削除されません。
- 手動で追加した marketplace と同じリポジトリを、異なる ref でマニフェストに書いたときは、上書きせずエラーにします。
- marketplace を外すと、その plugin も一緒に外れます。
- 途中で失敗しても、そこまでの記録は残ります。もう一度 `cpm sync` を実行すると、続きから収束します。
- plugin の有効・無効は管理しません。
- `cpm list` で、cpm が追加した marketplace と plugin を確認できます。

## 認証

marketplace の取得は `claude` コマンドが行うので、git の認証設定がそのまま使われます。非公開リポジトリの marketplace も、`claude plugin marketplace add` で追加できる状態なら取り込めます。

`includes` の取得には GitHub API を使います。`GITHUB_TOKEN`(または `GH_TOKEN`)、なければ `gh auth token` の値を使うので、非公開リポジトリのマニフェストを取り込むときは、どれかを設定してください。

## できないこと

- コミット SHA 単位の固定
- GitHub 以外の marketplace(git の URL やローカルのパス)
- user スコープ以外へのインストール
