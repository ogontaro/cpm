---
name: release
description: cpm をリリースする。main へ push した後、release-drafter の下書きのタグを package.json の version に揃えて Publish し、資産を確認する。「リリースして」「vX.Y.Z を出して」と言われたときに使う。
---

# リリース

main への push で更新される release-drafter の下書きを、`v<package.json の version>` のタグで Publish する。

## 手順

1. 対象が main に push され、CI と Release Drafter が成功していることを確認する。

   ```sh
   gh run list --limit 4
   ```

2. 下書きのタグと `package.json` の `version` を比べる。

   ```sh
   gh release list --limit 5
   ```

   - 等しい: 3 へ。
   - `package.json` の方が小さい: `package.json` を下書きのタグの `X.Y.Z` に上げて main に push し、Release Drafter の完了後に 2 に戻る。
   - `package.json` の方が大きい: 下書きのタグを `v<version>` に変更して 3 へ。

   下書きのタグが変更内容の semver と合わない場合(`feat` なのに patch など)は、PR のラベルを直して Release Drafter を再実行し、下書きを更新してから 2 に戻る。

3. 下書きを Publish する。

   ```sh
   gh release edit <下書きのタグ> --tag v<version> --title v<version> --draft=false
   ```

   下書きの本文が空のときは、前回のタグ以降のコミットから Features / Bug Fixes / Maintenance に分けたノートを作り、`--notes` で渡す。

4. Release workflow の成功と、タグ・資産を確認する。

   ```sh
   gh run list --limit 2
   gh release view v<version>
   ```

## Publish 後にタグと version がずれて Release workflow が落ちたとき

リリースは公開済みで、資産と Formula は作られていない。リリースとタグを削除し、`package.json` を直してから作り直す。Release workflow の再実行では直らない(イベントのタグのコミットを見るため)。

```sh
gh release delete v<version> --yes --cleanup-tag
```
