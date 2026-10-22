# バージョン

`src/` を変更したら、同じ PR の中で `package.json` の `version` を上げる。`bunx github:ogontaro/cpm` は `package.json` の `version` を表示し、リリースの workflow は、タグと `version` が一致しないと失敗する。

| 変更 | 上げる桁 |
|---|---|
| 破壊的変更(PR タイトルが `feat!:` など) | major |
| `feat:` | minor |
| それ以外(`fix:` など) | patch |

Publish するタグは `v<package.json の version>` とする。リリースの手順と失敗時の復旧は `release` skill に従う。
