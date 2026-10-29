# コマンドとオプション

cpm のすべてのコマンドとオプションの一覧です。

## コマンド

| コマンド | できること |
|---|---|
| `cpm init` | 今の環境から `cpm.yml` を作る |
| `cpm install` | `cpm.yml` の内容に Claude Code を合わせる(追加・削除) |
| `cpm update` | `cpm.yml` の内容に合わせつつ、marketplace と plugin を最新に更新する |
| `cpm add <plugin>@<marketplace>` | plugin を `cpm.yml` に追加し、インストールする |
| `cpm uninstall <plugin>@<marketplace>` | plugin を 1 つ削除し、`cpm.yml` からも削除する |
| `cpm cleanup` | 管理対象の marketplace と plugin をすべて削除する |
| `cpm list` | 管理対象と管理対象外の marketplace・plugin を表示する |

### cpm init

今の環境から `cpm.yml` を作ります。`cpm.yml` がすでにあるときは作りません。YAML(`.yml` / `.yaml`)の `cpm.yml` だけを作れます。

### cpm install

`cpm.yml` に書いた marketplace と plugin を Claude Code に反映します。`cpm.yml` から消した plugin は削除されます。

| オプション | 内容 |
|---|---|
| `--dry-run` | 変更内容だけを表示する |
| `--check` | 変更内容を表示し、Claude Code の状態が `cpm.yml` とずれていれば終了コード 1 を返す。CI で使える |
| `--remote <repo>` | ローカルの `cpm.yml` の代わりに、リポジトリにある `cpm.yml` をクローンせずに直接読む。`<repo>` は `[host/]owner/repo/path/to/cpm.yml[#ref]` |
| `--yes` | `cpm.lock` に無い marketplace の承認を求めず、内容を表示して進める。対話できない環境で使う |

marketplace は `cpm.lock` のコミットに揃えます。`cpm.lock` に無い marketplace は、内容を表示して承認を求め、承認すると記録します。

### cpm update

`cpm install` と同じく `cpm.yml` の内容に合わせたうえで、marketplace と plugin を最新に更新します。`#` でタグを指定した marketplace は、そのタグのままです。コミットが変わる marketplace は、変更内容を表示して承認を求め、承認すると `cpm.lock` を更新します。承認しなければ、`cpm.lock` のコミットに戻して中止します。実行後は、変更のあった marketplace / plugin だけを `before -> after` で表示します。

| オプション | 内容 |
|---|---|
| `--dry-run` | 変更内容だけを表示する |
| `--yes` | 承認を求めず、内容を表示して進める。対話できない環境で使う |

### cpm add

`<plugin>@<marketplace>` を `cpm.yml` に追加し、インストールします。`@` の後ろには、登録済みの marketplace の名前か、`[host/]owner/repo[#ref]` を書きます。リポジトリを書いたときは、marketplace を登録し、`cpm.yml` の `marketplaces` にも追加します。

- YAML(`.yml` / `.yaml`)の `cpm.yml` が、あらかじめ必要です(`cpm init` で作れます)
- インストールに失敗すると、`cpm.yml` への追加も取り消します
- `--dry-run` と `--check` は使えません

### cpm uninstall

`cpm list` に表示される `plugin@marketplace` を渡し、その plugin を削除します。

- 管理対象外の plugin も削除できます
- その plugin が管理対象の marketplace の最後の plugin だったときは、marketplace も削除します
- YAML の `cpm.yml` に書かれていれば、その行も削除します

| オプション | 内容 |
|---|---|
| `--dry-run` | 変更内容だけを表示する |

### cpm cleanup

管理対象の marketplace と plugin をすべて削除します。`cpm.yml` は読まず、管理対象外のものには触りません。`cpm.yml` はそのまま残るので、あとで `cpm install` を実行すれば元に戻せます。

| オプション | 内容 |
|---|---|
| `--dry-run` | 変更内容だけを表示する |

### cpm list

管理対象と管理対象外の marketplace・plugin を表示します。表示される plugin の ID は、`cpm uninstall` に渡せます。

## オプション

| オプション | init | install | update | add | uninstall | cleanup | list |
|---|---|---|---|---|---|---|---|
| `--dry-run` | — | ✓ | ✓ | エラー | ✓ | ✓ | — |
| `--check` | — | ✓ | エラー | エラー | エラー | エラー | — |
| `--remote <repo>` | エラー | ✓ | エラー | エラー | エラー | エラー | エラー |
| `--claude-dir <path>` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

`✓` は使えるもの、`エラー` は指定するとエラーになるもの、`—` は指定しても何も変わらないものです。

| オプション | 内容 |
|---|---|
| `--dry-run` | 変更内容だけを表示し、適用しない |
| `--check` | 変更内容を表示し、差分があれば終了コード 1 を返す |
| `--remote <repo>` | リポジトリにある `cpm.yml` を直接読む |
| `--claude-dir <path>` | 操作する Claude のディレクトリ。既定は環境変数 `CLAUDE_CONFIG_DIR`、未設定なら `~/.claude`。`cpm.yml` と `.cpm-state.json` もこのディレクトリに置かれる |
| `-v`, `--version` | cpm のバージョンを表示する |
| `-h`, `--help` | ヘルプを表示する |
