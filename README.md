# cpm

cpm(Claude Plugin Manager)は、Claude Code の user スコープの plugin を `cpm.yml` で宣言的に管理するツールです。入れたい plugin を `cpm.yml` に書いて `cpm install` を実行すると、Claude Code の状態がその内容に揃います。

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
bunx github:ogontaro/cpm init
```

## クイックスタート

今入っている plugin から、`~/.claude/cpm.yml` を作ります。

```sh
cpm init
```

`cpm.yml` は、たとえば次のような内容になります。

```yaml
marketplaces:
  - ogontaro/skills
plugins:
  - git-usage@ogontaro-skills
```

### plugin を足す

```sh
cpm add git-usage@ogontaro/skills
```

plugin を `cpm.yml` に追加し、そのまま Claude Code にインストールします。

### cpm.yml の内容を反映する

```sh
cpm install
```

`cpm.yml` を直接編集したあとや、別のマシンに `cpm.yml` を置いたあとに実行します。Claude Code が `cpm.yml` の内容に揃います。

`cpm.yml` に書いた marketplace と plugin は、cpm が管理対象として扱います。cpm が更新・削除するのは管理対象のものだけで、`/plugin` で入れた plugin など管理対象外のものには触りません。

初回の `cpm add` や `cpm install` の出力には `= plugin git-usage@ogontaro-skills  (cpm の管理下に入れる)` のような行が並びます。これは今入っているものを管理対象に入れる記録で、plugin の構成は変わりません。

## plugin の書き方

plugin は `<plugin>@<marketplace>` の形で書きます。`cpm add`、`cpm uninstall`、`cpm.yml` の `plugins` と `exclude` で共通です。

### marketplace の plugin を追加する

`@` の後ろに、登録済みの marketplace の名前を書きます。

```sh
cpm add git-usage@ogontaro-skills
```

登録済みの名前は `cpm list` で確かめられます。

### git リポジトリの plugin を追加する

`@` の後ろに、marketplace のリポジトリを書きます。

```sh
cpm add git-usage@ogontaro/skills
```

- 未登録の marketplace は、このときに登録されます。名前は Claude Code が marketplace に付けたもので、リポジトリ名とは限りません(`ogontaro/skills` は `ogontaro-skills`)。上の例では、`cpm.yml` の `plugins` に `git-usage@ogontaro-skills` と書かれます。
- 登録済みのリポジトリを書いた場合は、その登録名が使われます。

リポジトリは `[host/]owner/repo[#ref]` の形で書きます。`cpm.yml` の `marketplaces` も同じ書き方です。

- `host/`: git サーバーのホスト名。省略すると github.com。GitHub 以外の git サーバーも指定できます
- `owner/repo`: リポジトリ
- `#ref`: タグかブランチ。タグを指定するとそのバージョンに固定され、ブランチを指定するか省略すると最新に追従します。コミット SHA は指定できません

`git.example.com/my-org/claude-plugins#v2` は、`https://git.example.com/my-org/claude-plugins.git` の `v2` を指します。

## cpm.yml の書き方

| キー | 書き方 | 内容 |
|---|---|---|
| `marketplaces` | `[host/]owner/repo[#ref]` | git リポジトリの marketplace。`#ref` はタグかブランチ(コミット SHA は不可) |
| `plugins` | `plugin@marketplace` | インストールする plugin |
| `includes` | `[host/]owner/repo/path/to/cpm.yml[#ref]` | GitHub 上の外部リポジトリにある cpm.yml を読み込む |
| `exclude` | `plugin@marketplace` | 読み込んだ cpm.yml の plugin のうち、自分は入れないもの |
| `autoUpdate` | `true` / `false` | 管理対象のすべての marketplace を、Claude Code が自動で更新するか。省略すると、cpm が新しく追加する marketplace だけを ON にし、既存の設定はそのままにする |

さまざまな構成の例は、[docs/cpm-yml-examples.md](docs/cpm-yml-examples.md) を参照してください。

### includes

GitHub 上の外部リポジトリにある `cpm.yml` を読み込みます。ファイルは、YAML(`.yml` / `.yaml`)と JSON(`.json`)のどちらでも書けます。先頭にホスト名を付けると、GitHub Enterprise のリポジトリも指定できます。GitHub(github.com と GitHub Enterprise)でだけ使えます。

```yaml
includes:
  - my-org/claude-config/cpm.yml#v2
  - github.example.com/my-org/claude-config/cpm.yml#v2
```

### cpm install --remote

ローカルの `cpm.yml` の代わりに、GitHub 上の `cpm.yml` をクローンせずに直接読んで適用します。`install` でだけ使えます。`includes` と同じく、GitHub でだけ使えます。

```sh
cpm install --remote my-org/claude-config/cpm.yml#v2
```

## コマンド

コマンドとオプションの一覧は、[docs/commands.md](docs/commands.md) を参照してください。

## 削除

| やりたいこと | コマンド |
|---|---|
| plugin を 1 つ削除する(`cpm.yml` からも削除する) | `cpm uninstall <plugin@marketplace>` |
| `cpm.yml` に合わせて整理する | `cpm.yml` から消して `cpm install` |
| 管理対象のものをすべて削除する | `cpm cleanup` |

`cpm cleanup` は `cpm.yml` を読まず、管理対象外のものには触りません。`cpm.yml` もそのまま残るので、あとで `cpm install` を実行すれば元に戻せます。

管理対象の marketplace を削除したり ref を変えたりすると、そこから手動で入れた plugin も削除されます。対象の plugin は `--dry-run` の出力に表示されます。

## .cpm-state.json

`.cpm-state.json` は、cpm が入れた marketplace と plugin の記録で、Claude の設定ディレクトリ(既定は `~/.claude`)の直下に置かれます。cpm はこの記録にあるものを管理対象として扱い、`cpm.yml` から消えたものの削除や `cpm cleanup` の対象にします。

記録はマシンごとのファイルです。別のマシンでは、`cpm.yml` だけを `~/.claude/cpm.yml` に置いて `cpm install` を実行すれば、そのマシンの記録が作られます。`.cpm-state.json` は持っていかないでください。dotfiles などで Git 管理している場合は、このファイルを除外してください。

## 認証

非公開リポジトリの `cpm.yml` を `includes` や `--remote` で読むには、`gh auth login` でログインしてください(GitHub Enterprise は `--hostname <host>` を付けます)。CI など対話できない環境では、`GITHUB_TOKEN`(GitHub Enterprise は `GH_ENTERPRISE_TOKEN`)を設定します。marketplace は `claude` が clone するので、git の認証設定がそのまま使われます。

## Claude のディレクトリを変える

cpm は、Claude Code の設定ディレクトリ(既定は `~/.claude`)を操作します。`cpm.yml` と `.cpm-state.json` も、そのディレクトリの直下に置かれます。仕事用と個人用で Claude Code の環境を分けているときは、操作するディレクトリを次の方法で変えられます。

| 指定 | 操作するディレクトリ |
|---|---|
| `--claude-dir <path>` | `<path>` |
| 環境変数 `CLAUDE_CONFIG_DIR` | その値 |
| 何も指定しない | `~/.claude` |

```sh
cpm install --claude-dir ~/work/.claude   # 仕事用の Claude 環境を操作する
```

指定したディレクトリには `claude` が設定ファイル(`.claude.json` など)を作ります。Claude Code 専用のディレクトリを指定してください。
