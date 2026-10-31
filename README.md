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

## plugin の書き方

plugin は `<plugin>@<marketplace>` の形で書きます。`cpm add`、`cpm uninstall`、`cpm.yml` の `plugins` と `exclude` で共通です。

### git リポジトリの plugin を追加する

`@` の後ろに、marketplace のリポジトリを書きます。

```sh
cpm add git-usage@ogontaro/skills
```

リポジトリは `[host/]owner/repo[#ref]` の形で書きます。`cpm.yml` の `marketplaces` も同じ書き方です。

- `host/`: git サーバーのホスト名。省略すると github.com。GitHub 以外の git サーバーも指定できます
- `owner/repo`: リポジトリ
- `#ref`: タグかブランチ。タグを指定するとそのバージョンに固定され、ブランチを指定するか省略すると最新に追従します。コミット SHA は指定できません

`git.example.com/my-org/claude-plugins#v2` は、`https://git.example.com/my-org/claude-plugins.git` の `v2` を指します。

### marketplace の名前で plugin を追加する

Claude Code に追加済みの marketplace は、名前で指定できます。`/plugin` で追加したものや、以前に `cpm add` で追加したものが対象で、`cpm list` に表示されます。

```sh
cpm add git-usage@ogontaro-skills
```

名前はリポジトリ名とは限りません(リポジトリ `ogontaro/skills` の名前は `ogontaro-skills`)。`cpm list` で確かめてください。

## cpm.yml の書き方

| キー | 書き方 | 内容 |
|---|---|---|
| `marketplaces` | `[host/]owner/repo[#ref]` | git リポジトリの marketplace。`#ref` はタグかブランチ(コミット SHA は不可) |
| `plugins` | `plugin@marketplace` | インストールする plugin |
| `includes` | `[host/]owner/repo/path/to/cpm.yml[#ref]` | 外部リポジトリにある cpm.yml を読み込む |
| `exclude` | `plugin@marketplace` | 読み込んだ cpm.yml の plugin のうち、自分は入れないもの |
| `cooldown` | `7d` | `cpm update` で採用するコミットの最小の経過日数。[公開直後の更新を避ける](#公開直後の更新を避ける) |

さまざまな構成の例は、[docs/cpm-yml-examples.md](docs/cpm-yml-examples.md) を参照してください。

### includes

外部リポジトリにある `cpm.yml` を読み込みます。ファイルは、YAML(`.yml` / `.yaml`)と JSON(`.json`)のどちらでも書けます。先頭にホスト名を付けると、GitHub Enterprise のリポジトリも指定できます。GitHub(github.com と GitHub Enterprise)でだけ使えます。

```yaml
includes:
  - my-org/claude-config/cpm.yml#v2
  - github.example.com/my-org/claude-config/cpm.yml#v2
```

### cpm install --remote

ローカルの `cpm.yml` の代わりに、リポジトリにある `cpm.yml` をクローンせずに直接読んで適用します。`install` でだけ使えます。`includes` と同じく、GitHub でだけ使えます。

```sh
cpm install --remote my-org/claude-config/cpm.yml#v2
```

## コマンド

コマンドとオプションの一覧は、[docs/commands.md](docs/commands.md) を参照してください。

## バージョンを固定する

`cpm install` は、marketplace のコミットを `cpm.lock` に記録し、次回以降は同じコミットで揃えます。`cpm.lock` を `cpm.yml` と一緒に Git で共有すれば、どのマシンでも同じ plugin が入ります。ブランチに追従する marketplace も固定できます。

| やりたいこと | コマンド |
|---|---|
| 初めて入れる | `cpm install`。marketplace の内容を表示し、承認すると `cpm.lock` に記録する |
| 同じ状態を再現する | `cpm install`。`cpm.lock` のコミットで揃える |
| 最新に上げる | `cpm update`。変更内容を表示し、承認すると `cpm.lock` を更新する |
| ずれを検知する | `cpm install --check`。`cpm.lock` と実際のコミットが違えば終了コード 1 を返す |

承認の画面には、変更されたファイルの数と、hooks・MCP 設定・スクリプトのファイルが表示されます。承認しなければ、`cpm.lock` のコミットのまま中止します。対話できない環境では `--yes` を付けると、内容を表示するだけで承認として進みます。

固定の単位は marketplace です。固定したコミットを保つため、cpm は管理対象の marketplace の自動更新を OFF にします。

### 公開直後の更新を避ける

`cpm.yml` に `cooldown` を書くと、`cpm update` は、その日数以上前にコミットされた最新のコミットまでしか進みません。悪意のあるコミットが混入しても、発覚して取り下げられるまでの期間を避けられます。

```yaml
cooldown: 7d
```

- 対象はブランチに追従する marketplace の `cpm update` です。タグで固定した marketplace と、新しく追加する marketplace には適用しません
- 日数以上前のコミットが無ければ、`cpm.lock` のコミットのまま、更新を見送ります
- `cpm update --ignore-cooldown` で、最新のコミットまで更新できます。承認の画面は省略されません
- 基準はコミットの日時です。コミットの作者は日時を設定できるため、偽装されうる点に注意してください
- `includes` で読み込んだ `cpm.yml` の `cooldown` は使いません

## plugin を削除する

Claude Code にインストールされている plugin を削除する方法は、次の 2 つです。

| やり方 | 内容 |
|---|---|
| `cpm uninstall git-usage@ogontaro-skills` | plugin を 1 つ削除する。`cpm.yml` からも、その plugin の行を取り除く |
| `cpm.yml` から plugin の行を取り除いて `cpm install` | `cpm.yml` に載っていない plugin を削除する |

cpm でインストールした plugin と marketplace をすべて削除するには、`cpm cleanup` を使います。`cpm.yml` は変わらないので、`cpm install` でインストールし直せます。

`cpm.yml` の `marketplaces` から marketplace の行を取り除いたり、`#ref` を書き換えたりして `cpm install` すると、その marketplace が削除されます。同じ marketplace から `/plugin` でインストールした plugin も、一緒に削除されます。何が削除されるかは `cpm install --dry-run` で確認できます。

## .cpm-state.json

`.cpm-state.json` は、cpm が入れた marketplace と plugin の記録で、Claude の設定ディレクトリ(既定は `~/.claude`)の直下に置かれます。cpm はこの記録にあるものを管理対象として扱い、`cpm.yml` から消えたものの削除や `cpm cleanup` の対象にします。`/plugin` で入れた plugin など、記録にないものには触りません。

記録はマシンごとのファイルです。別のマシンでは、`cpm.yml` だけを `~/.claude/cpm.yml` に置いて `cpm install` を実行すれば、そのマシンの記録が作られます。`.cpm-state.json` は持っていかないでください。dotfiles などで Git 管理している場合は、このファイルを除外してください。

## cpm.lock

`cpm.lock` は、marketplace ごとに固定したコミットの記録で、`cpm.yml` と同じ Claude の設定ディレクトリの直下に置かれます。マシンに依存しないので、`cpm.yml` と一緒に Git で共有してください。`cpm.yml` から外した marketplace の記録は、`cpm install` が取り除きます。

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
