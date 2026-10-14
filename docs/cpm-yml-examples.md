# cpm.yml の例

キーごとの書き方は、README の「cpm.yml の書き方」を参照してください。

## 最小の構成

```yaml
marketplaces:
  - ogontaro/skills
plugins:
  - git-usage@ogontaro-skills
```

## バージョンを固定する

`#` でタグを指定した marketplace は、自動更新や `cpm update` でもそのタグのままです。`#ref` を省略するか、ブランチを指定すると、最新に追従します。

```yaml
marketplaces:
  - DietrichGebert/ponytail#v4.10.3   # タグで固定する
  - ogontaro/skills                   # 最新に追従する
  - my-org/claude-plugins#develop     # ブランチに追従する
plugins:
  - ponytail@ponytail
  - git-usage@ogontaro-skills
```

## GitHub 以外の git サーバーを使う

先頭にホスト名を付けます。`https://<host>/<owner>/<repo>.git` として登録されます。

```yaml
marketplaces:
  - github.example.com/my-org/claude-plugins#v2
  - git.example.com/my-org/claude-plugins
plugins:
  - team-tools@my-org-plugins
```

## 外部の cpm.yml を読み込む

`includes` で、GitHub 上のリポジトリにある `cpm.yml` を読み込みます。読み込んだ plugin のうち入れないものは、`exclude` に書きます。

```yaml
includes:
  - my-org/claude-config/cpm.yml#v2
  - github.example.com/my-org/claude-config/cpm.yml#v2
exclude:
  - heavy-tool@my-org-plugins
plugins:
  - git-usage@ogontaro-skills
```

## 自動更新を設定する

`autoUpdate` で、管理対象のすべての marketplace を Claude Code が自動で更新するかを決めます。

```yaml
autoUpdate: false
marketplaces:
  - ogontaro/skills
plugins:
  - git-usage@ogontaro-skills
```
