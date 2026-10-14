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

## 始める

今入っている plugin から `cpm.yml` を作り、plugin を 1 つ足します。

```sh
cpm init                            # 今入っている plugin から ~/.claude/cpm.yml を作る
cpm add git-usage@ogontaro/skills   # plugin を cpm.yml に追加してインストールする
```

`cpm.yml` は、たとえば次のような内容になります。

```yaml
marketplaces:
  - ogontaro/skills
plugins:
  - git-usage@ogontaro-skills
```

`cpm.yml` に書いた marketplace と plugin は、cpm が管理対象として扱います。cpm が更新・削除するのは管理対象のものだけで、`/plugin` で入れた plugin など管理対象外のものには触りません。

初回の `cpm add` の出力には `= plugin git-usage@ogontaro-skills  (cpm の管理下に入れる)` のような行が並びます。これは今入っているものを管理対象に入れる記録で、plugin の構成は変わりません。

## 日常の使い方

基準は `cpm.yml` で、`cpm install` は Claude Code をその内容に合わせます。plugin の追加と削除は、コマンドで行えます。

```sh
cpm add git-usage@ogontaro-skills        # cpm.yml に追加してインストールする
cpm add git-usage@ogontaro/skills        # 未登録の marketplace なら、登録して marketplaces にも追加する
cpm list                                 # 管理対象と管理対象外の marketplace・plugin を表示する
cpm uninstall git-usage@ogontaro-skills  # plugin を 1 つ削除し、cpm.yml からも削除する
cpm update                               # marketplace と plugin を最新に更新する
```

- `plugin@marketplace` の `marketplace` には、登録済みの marketplace の名前か、`[host/]owner/repo[#ref]` を書きます。
- marketplace の名前はリポジトリ名と違うことがあります(`ogontaro/skills` の名前は `ogontaro-skills`)。`cpm list` で確かめてください。
- `cpm add` は、インストールに失敗すると `cpm.yml` への追加も取り消します。
- `cpm uninstall` には、`cpm list` に表示される `plugin@marketplace` を渡します。その plugin が管理対象の marketplace の最後の plugin だったときは、marketplace も削除します。
- `cpm install`、`cpm update`、`cpm uninstall`、`cpm cleanup` は、`--dry-run` で変更内容だけを表示できます。
- `cpm install --check` は、変更内容を表示し、Claude Code の状態が `cpm.yml` とずれていれば終了コード 1 を返します。CI で使えます。

`cpm.yml` を直接編集してから `cpm install` を実行することもできます。`cpm.yml` から消した plugin は、`cpm install` で削除されます。

## cpm.yml の書き方

| キー | 書き方 | 内容 |
|---|---|---|
| `marketplaces` | `[host/]owner/repo[#ref]` | git リポジトリの marketplace。`#ref` はタグかブランチ(コミット SHA は不可) |
| `plugins` | `plugin@marketplace` | インストールする plugin |
| `includes` | `[host/]owner/repo/path/to/cpm.yml[#ref]` | GitHub 上の外部リポジトリにある cpm.yml を読み込む |
| `exclude` | `plugin@marketplace` | 読み込んだ cpm.yml の plugin のうち、自分は入れないもの |
| `autoUpdate` | `true` / `false` | 管理対象のすべての marketplace を、Claude Code が自動で更新するか。省略すると、cpm が新しく追加する marketplace だけを ON にし、既存の設定はそのままにする |

`includes` で読み込むファイルは、YAML(`.yml` / `.yaml`)と JSON(`.json`)のどちらでも書けます。

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

別のマシンでは、`cpm.yml` を `~/.claude/cpm.yml` に置いて `cpm install` を実行します。`.cpm-state.json`(cpm が入れたものの記録)はマシンごとのファイルなので、持っていかないでください。dotfiles などで Git 管理している場合は、このファイルを除外してください。

GitHub 上の `cpm.yml` を、クローンせずに直接読むこともできます。

```sh
cpm install --remote my-org/claude-config/cpm.yml#v2
cpm install --remote github.example.com/my-org/claude-config/cpm.yml --dry-run
```

`--remote` は `install` でだけ使えます。

## 削除

| やりたいこと | コマンド |
|---|---|
| plugin を 1 つ削除する(`cpm.yml` からも削除する) | `cpm uninstall <plugin@marketplace>` |
| `cpm.yml` に合わせて整理する | `cpm.yml` から消して `cpm install` |
| 管理対象のものをすべて削除する | `cpm cleanup` |

`cpm cleanup` は `cpm.yml` を読まず、管理対象外のものには触りません。`cpm.yml` もそのまま残るので、あとで `cpm install` を実行すれば元に戻せます。

管理対象の marketplace を削除したり ref を変えたりすると、そこから手動で入れた plugin も削除されます。対象の plugin は `--dry-run` の出力に表示されます。

## git サーバーを指定する場合

先頭にホスト名を付けると、GitHub 以外の git サーバーも指定できます。

```yaml
includes:
  - github.example.com/my-org/claude-config/cpm.yml#v2
marketplaces:
  - github.example.com/my-org/claude-plugins#v2
  - git.example.com/my-org/claude-plugins
```

- `marketplaces` は git サーバーならどれでも使えます。`https://<host>/<owner>/<repo>.git` として登録されます。
- `includes` と `--remote` は、GitHub(github.com と GitHub Enterprise)でだけ使えます。GitHub API で cpm.yml を取得するためです。

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

## できないこと

- コミット SHA 単位の固定
- `host/owner/repo` 以外の形(`https://` などの URL やローカルのパス)での marketplace の追加。手動で登録した marketplace の plugin は、`cpm.yml` で管理できます
- GitHub 以外のサーバーにある cpm.yml の読み込み(`includes`、`--remote`)
- user スコープ以外へのインストール
