# cpm

cpm(Claude Plugin Manager)は、グローバル(user スコープ)の Claude Code plugin を `cpm.yml` で管理するツールです。入れたい plugin を `cpm.yml` に書いておけば、`cpm install` で Claude Code をその内容に合わせられるので、別のマシンでも同じ plugin を揃えられます。

## インストール

**Homebrew**

```sh
brew tap ogontaro/cpm https://github.com/ogontaro/cpm
brew trust --tap ogontaro/cpm
brew install ogontaro/cpm/cpm
```

**Bun**

[Bun](https://bun.sh) の bunx で、インストールせずに GitHub から直接実行します。

```sh
bunx github:ogontaro/cpm init           # 最新版を実行する
bunx github:ogontaro/cpm#v0.3.0 init    # バージョンを固定して実行する
```

以降の例では `cpm` と書きます。bunx で使うときは、`cpm` を `bunx github:ogontaro/cpm` に読み替えてください。

## 始める

今入っている plugin から、`cpm.yml` を作ります。

```sh
cpm init                # ~/.claude/cpm.yml を作る
cpm install --dry-run   # 変更内容だけを表示する
cpm install             # 適用する
```

作られる `cpm.yml` は、たとえば次のような内容です。

```yaml
marketplaces:
  - ogontaro/skills
plugins:
  - git-usage@ogontaro-skills
```

`cpm.yml` に書いた marketplace と plugin は、cpm の「管理下」に入ります。cpm が入れ替えたり削除したりするのは管理下のものだけで、`/plugin` で入れた plugin など管理下にないものには触りません。

初回の `--dry-run` には `= plugin git-usage@ogontaro-skills  (cpm の管理下に入れる)` のような行が並びます。今入っているものを管理下に入れるという記録で、plugin の構成は変わりません。

plugin の変更は、次のセッションの開始時か、`/reload-plugins` の実行時に反映されます。

## 日常の使い方

`cpm.yml` が正で、`cpm install` は Claude Code をその内容に合わせます。plugin の追加と削除は、コマンドで行えます。

```sh
cpm add git-usage@ogontaro-skills        # cpm.yml に追記してインストールする
cpm add git-usage@ogontaro/skills        # 未登録の marketplace なら、登録して marketplaces にも追記する
cpm list                                 # 管理下と管理外の marketplace・plugin を表示する
cpm uninstall git-usage@ogontaro-skills  # plugin を 1 つ削除し、cpm.yml からも外す
cpm update                               # marketplace と plugin を最新に更新する
```

- plugin は、Claude Code の `/plugin` で探せます。`plugin@marketplace` の `marketplace` には、登録済みの marketplace の名前か、`[host/]owner/repo[#ref]` を書きます。
- marketplace の名前はリポジトリ名と違うことがあります(`ogontaro/skills` の名前は `ogontaro-skills`)。`cpm list` で確かめてください。
- `cpm add` は、インストールに失敗すると `cpm.yml` への追記も取り消します。
- `cpm uninstall` には、`cpm list` に表示される `plugin@marketplace` を渡します。その marketplace の最後の plugin だったときは、marketplace も削除します(管理下のものだけ)。
- `cpm install`、`cpm update`、`cpm uninstall`、`cpm cleanup` は、`--dry-run` で変更内容だけを表示できます。
- `cpm install --check` は、変更内容を表示し、`cpm.yml` とずれていれば終了コード 1 を返します。CI で使えます。

`cpm.yml` を直接編集してから `cpm install` を実行することもできます。`cpm.yml` から消した plugin は、`cpm install` で削除されます。

## cpm.yml の書き方

| キー | 書き方 | 内容 |
|---|---|---|
| `marketplaces` | `[host/]owner/repo[#ref]` | git リポジトリの marketplace。`#ref` はタグかブランチ(コミット SHA は不可) |
| `plugins` | `plugin@marketplace` | インストールする plugin |
| `includes` | `[host/]owner/repo/path/to/cpm.yml[#ref]` | GitHub 上の外部リポジトリにある cpm.yml を取り込む |
| `exclude` | `plugin@marketplace` | 取り込んだ cpm.yml の plugin のうち、自分は入れないもの |
| `autoUpdate` | `true` / `false` | 管理下のすべての marketplace を、Claude Code が自動で更新するか。省略すると、cpm が新しく追加する marketplace だけを ON にし、既存の設定はそのままにする |

`includes` で取り込むファイルは、YAML(`.yml` / `.yaml`)と JSON(`.json`)のどちらでも書けます。

### バージョンの固定と更新

- **固定する**: `#v4.10.3` のようにタグを指定します。
- **追従する**: ブランチを指定するか、`#ref` を省略します。
- **今すぐ更新する**: `cpm update`

タグで固定した marketplace は、自動更新や `cpm update` で更新してもそのタグのままです。ブランチで追従する marketplace は、自動更新が ON なら Claude Code が marketplace と plugin を最新にします。

```yaml
marketplaces:
  - DietrichGebert/ponytail#v4.10.3
  - ogontaro/skills
plugins:
  - ponytail@ponytail
  - git-usage@ogontaro-skills
```

## 別のマシンで使う

別のマシンでは、`cpm.yml` を `~/.claude/cpm.yml` に置いて `cpm install` を実行します。`.cpm-state.json`(cpm が入れたものの記録)はマシンごとのファイルなので、持っていかないでください。dotfiles などで Git 管理している場合は除外します。

GitHub 上の `cpm.yml` を、クローンせずに直接読むこともできます。

```sh
cpm install --remote my-org/claude-config/cpm.yml#v2
cpm install --remote github.example.com/my-org/claude-config/cpm.yml --dry-run
```

`--remote` は `install` でだけ使えます。

## 削除

| やりたいこと | コマンド |
|---|---|
| plugin を 1 つ削除する(`cpm.yml` からも外す) | `cpm uninstall <plugin@marketplace>` |
| `cpm.yml` に合わせて整理する | `cpm.yml` から消して `cpm install` |
| 管理下のものをすべて削除する | `cpm cleanup` |

`cpm cleanup` は `cpm.yml` を読まず、管理外のものには触りません。`cpm.yml` もそのまま残るので、あとで `cpm install` を実行すれば元に戻せます。

管理下の marketplace を外したり ref を変えたりすると、そこから手動で入れた plugin も外れます。対象の plugin は `--dry-run` の出力に表示されます。

## git サーバーを指定する場合

先頭にホスト名を付けると、GitHub 以外の git サーバーも指せます。

```yaml
includes:
  - github.example.com/my-org/claude-config/cpm.yml#v2
marketplaces:
  - github.example.com/my-org/claude-plugins#v2
  - git.example.com/my-org/claude-plugins
```

- `marketplaces` は git サーバーならどれでも使えます。`https://<host>/<owner>/<repo>.git` として登録されます。
- `includes` と `--remote` は、GitHub(github.com と GitHub Enterprise)だけです。GitHub API で cpm.yml を取得するためです。

## 認証

marketplace の取得は `claude` コマンドが行うので、git の認証設定がそのまま使われます。非公開リポジトリの cpm.yml を `includes` や `--remote` で読むときは、次のいずれかを用意してください。

| 接続先 | 環境変数 | 未設定のとき |
|---|---|---|
| github.com | `GITHUB_TOKEN` / `GH_TOKEN` | `gh auth login` でのログイン |
| GitHub Enterprise | `GH_ENTERPRISE_TOKEN` / `GITHUB_ENTERPRISE_TOKEN` | `gh auth login --hostname <host>` でのログイン |

## Claude のディレクトリを変える

cpm は、Claude Code の設定ディレクトリ(既定は `~/.claude`)を操作します。`cpm.yml` と `.cpm-state.json` も、そのディレクトリの直下に置かれます。仕事用と個人用で Claude Code の環境を分けているときに使います。

| 指定 | 操作するディレクトリ |
|---|---|
| `--claude-dir <path>` | `<path>` |
| 環境変数 `CLAUDE_CONFIG_DIR` | その値 |
| 何も指定しない | `~/.claude` |

```sh
cpm install --claude-dir ~/work/.claude   # 仕事用の Claude 環境を操作する
```

指定したディレクトリには `claude` が設定ファイル(`.claude.json` など)を作ります。Claude Code 用の専用のディレクトリを指定してください。

## できないこと

- コミット SHA 単位の固定
- `host/owner/repo` 以外の形(`https://` などの URL やローカルのパス)での marketplace の追加。手動で登録した marketplace の plugin は、`cpm.yml` で管理できます
- GitHub 以外のサーバーにある cpm.yml の取り込み(`includes`、`--remote`)
- user スコープ以外へのインストール
