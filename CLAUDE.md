# cpm

## バージョン

`src/` を変更したら、同じ変更の中で `package.json` の `version` を上げる。`bunx github:ogontaro/cpm` は `package.json` の `version` を表示し、リリースの workflow は、タグと `version` が一致しないと失敗する。

| 変更 | 上げる桁 |
|---|---|
| 破壊的変更(PR タイトルが `feat!:` など) | major |
| `feat:` | minor |
| それ以外(`fix:` など) | patch |

リリースは、main への push で更新される release-drafter の下書きを Publish して行う。下書きのタグは `package.json` の `version` と揃える。
