# cpm

cpm(Claude Plugin Manager)は、Claude Code の plugin を、マニフェスト(`cpm.yml`)に書いた内容へ同期するコマンドラインツールです。家と会社のマシンや、チームのメンバー全員で、同じ plugin を揃えられます。

cpm が扱うのは、全プロジェクトで有効になる user スコープの plugin です。特定のリポジトリだけで使う plugin は、Claude Code 標準の project 設定(`.claude/settings.json`)で共有できます。

## インストール

必要なもの: Claude Code(`claude` コマンドが PATH にあること)

**Homebrew**

```sh
brew tap ogontaro/cpm https://github.com/ogontaro/cpm
brew trust --tap ogontaro/cpm
brew install ogontaro/cpm/cpm
```

Homebrew の標準リポジトリには別物の `cpm` があります。必ず `ogontaro/cpm/` を付けてください。

**Bun**

[Bun](https://bun.sh) の bunx で、インストールせずに GitHub から直接実行します。

```sh
bunx github:ogontaro/cpm sync          # 最新版を実行する
bunx github:ogontaro/cpm#v0.2.0 sync   # バージョンを固定して実行する
```

以降の例では `cpm` と書きます。bunx で使うときは、`cpm` を `bunx github:ogontaro/cpm` に読み替えてください。

## 始める

今入っている plugin から、マニフェストを作ります。

```sh
cpm init             # ~/.claude/cpm.yml を作る
cpm sync --dry-run   # 変更内容だけを表示する
cpm sync             # 適用する
```

初回の `--dry-run` には、`= plugin git-usage@ogontaro-skills  (cpm の管理下に入れる)` のような行が並びます。今入っているものを cpm の管理下に入れるという記録で、plugin の構成は変わりません。

マニフェストは `~/.claude/` に置きます(`CLAUDE_CONFIG_DIR` を設定している場合はその下)。`--manifest <path>` か環境変数 `CPM_MANIFEST` でも指定できます。cpm は同じディレクトリに、管理下に入れたものの記録 `.cpm-state.json` を作ります。マシンごとのファイルなので、dotfiles などで Git 管理している場合はコミットしないよう除外してください。

別のマシンでは、マニフェストを同じ場所に置いて `cpm sync` を実行します。

## 日常の使い方

plugin を足したり外したりするときは、マニフェストを編集してから `cpm sync` を実行します。

```yaml
marketplaces:
  - DietrichGebert/ponytail#v4.10.3
  - ogontaro/skills
plugins:
  - ponytail@ponytail
  - git-usage@ogontaro-skills
```

`@` の後ろには marketplace の名前を書きます。リポジトリ名と違うことがあるので(`ogontaro/skills` の名前は `ogontaro-skills`)、`cpm list` で確かめてください。

```sh
cpm list             # 管理下と管理外の marketplace・plugin を表示する
cpm sync --update    # marketplace と plugin を最新に更新する
cpm sync --check     # 変更内容を表示し、マニフェストとずれていれば終了コード 1 を返す
```

`/plugin` で入れた plugin は管理外のまま残り、`cpm list` に `(管理外)` と表示されます。残したいものはマニフェストに書き足してください。

plugin の変更は、次のセッションの開始時か、`/reload-plugins` の実行時に反映されます。

## マニフェスト

| キー | 書き方 | 内容 |
|---|---|---|
| `marketplaces` | `[host/]owner/repo[#ref]` | GitHub 上の marketplace。`#ref` はタグかブランチ(コミット SHA は不可) |
| `plugins` | `plugin@marketplace` | インストールする plugin |
| `includes` | `[host/]owner/repo/path/to/cpm.yml[#ref]` | 外部リポジトリのマニフェストを取り込む |
| `exclude` | `plugin@marketplace` | 取り込んだマニフェストの plugin のうち、自分は入れないもの |
| `autoUpdate` | `true` / `false` | 管理下のすべての marketplace を、Claude Code が自動で更新するか。省略すると、cpm が新しく追加する marketplace だけを ON にし、既存の設定はそのままにする |

YAML(`.yml` / `.yaml`)と JSON(`.json`)のどちらでも書けます。

### GitHub Enterprise

先頭に GitHub Enterprise のホスト名を付けると、そのサーバーのリポジトリを指せます。`marketplaces` と `includes` の両方で使えます。

```yaml
includes:
  - github.example.com/my-org/claude-config/cpm.yml#v2
marketplaces:
  - github.example.com/my-org/claude-plugins#v2
```

marketplace は `https://github.example.com/my-org/claude-plugins.git` として登録されます。

### バージョンの固定と更新

- **固定する**: `#v4.10.3` のようにタグを指定します。
- **追従する**: ブランチを指定するか、`#ref` を省略します。
- **今すぐ更新する**: `cpm sync --update`

タグで固定した marketplace は、自動更新や `--update` で更新してもそのタグのままです。チーム全員のバージョンを揃えたいときはタグで固定してください。ブランチで追従する marketplace は、自動更新が ON なら Claude Code が marketplace と plugin を最新にします。

## チームで共有する

共通の構成をマニフェストにして、チームのリポジトリに置きます。

```yaml
# my-org/claude-config の cpm.yml
marketplaces:
  - my-org/claude-plugins#v2
plugins:
  - review@my-org-plugins
  - deploy@my-org-plugins
```

メンバーは cpm をインストールし、自分のマニフェストで取り込んで `cpm sync` を実行します。

```yaml
includes:
  - my-org/claude-config/cpm.yml#v2
plugins:
  - git-usage@ogontaro-skills   # 自分だけで使う plugin
exclude:
  - deploy@my-org-plugins       # 共通の構成のうち、自分は使わない plugin
```

共通の構成を変えても、メンバーの環境に反映されるのは各自が `cpm sync` を実行したときです。`includes` の `#ref` も marketplace と同じで、タグなら固定(上げるときは各自が書き換える)、ブランチなら追従です。

- 取り込んだマニフェストと同じリポジトリを自分の `marketplaces` にも書いた場合は、自分の書いた ref が使われます。
- `autoUpdate` は自分のマニフェストの値だけが使われます。取り込んだマニフェストの `autoUpdate` は効きません。
- 取り込んだ plugin も管理下に入ります。共通の構成から外すと、メンバーの環境からも削除されます。

## cpm が削除するもの

cpm が削除するのは、管理下のものだけです。マニフェスト(`includes` で取り込んだものを含む)に書いたものが管理下に入り、マニフェストから消すと次の `cpm sync` で削除されます。書いた時点ですでに入っていたものも、管理下に入ります。

管理下の marketplace を外したり ref を変えたりすると、そこから手動で入れた plugin も外れます。対象の plugin は `--dry-run` の出力に表示されます。

## クローンせずに実行する

`--remote` を付けると、ローカルのマニフェストの代わりに、GitHub 上のマニフェストを直接読んで同期します。クローンは要りません。

```sh
cpm sync --remote my-org/claude-config/cpm.yml#v2
cpm sync --remote github.example.com/my-org/claude-config/cpm.yml --dry-run
```

`--remote` は `sync` でだけ使え、`--manifest` とは同時に指定できません。

## 認証

marketplace の取得は `claude` コマンドが行うので、git の認証設定がそのまま使われます。非公開リポジトリのマニフェストを `includes` や `--remote` で読むときは、次のいずれかを用意してください。

| 接続先 | 環境変数 | 未設定のとき |
|---|---|---|
| github.com | `GITHUB_TOKEN` / `GH_TOKEN` | `gh auth login` のログイン |
| GitHub Enterprise | `GH_ENTERPRISE_TOKEN` / `GITHUB_ENTERPRISE_TOKEN` | `gh auth login --hostname <host>` のログイン |

## できないこと

- コミット SHA 単位の固定
- GitHub 以外の marketplace(git の URL やローカルのパス)の追加。手動で登録した marketplace の plugin は、マニフェストで管理できます
- user スコープ以外へのインストール
