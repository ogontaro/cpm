import { marketplaceRepo, type Snapshot } from "./sync";

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 現在の環境から cpm.yml の本文を作る。
 * GitHub(GitHub Enterprise を含む)以外の marketplace は書けないのでコメントで列挙する。その plugin は、marketplace を手動で登録したまま管理できるので plugins に出す
 */
export function renderManifest(snap: Snapshot): string {
  const marketplaces: string[] = [];
  const unsupported: string[] = [];
  for (const m of [...snap.marketplaces].sort((a, b) => byName(a.name, b.name))) {
    // `#` を含む ref はマニフェストで書けない
    const repo = marketplaceRepo(m);
    if (repo && !m.ref?.includes("#")) {
      marketplaces.push(m.ref ? `${repo}#${m.ref}` : repo);
    } else {
      unsupported.push(`${m.name} (${m.source})`);
    }
  }

  const plugins = [...snap.plugins].sort(byName);

  const list = (key: string, items: string[], quote: boolean): string[] =>
    items.length === 0
      ? [`${key}: []`]
      : [`${key}:`, ...items.map((item) => `  - ${quote && item.includes("#") ? JSON.stringify(item) : item}`)];

  const lines = ["# cpm init で生成しました", ...list("marketplaces", marketplaces, true), ...list("plugins", plugins, false)];
  if (unsupported.length > 0) {
    lines.push(
      "",
      "# 次の marketplace は書けません。手動で登録したまま、その plugin は上の plugins で管理できます:",
      ...unsupported.map((item) => `#   ${item}`),
    );
  }
  return lines.join("\n") + "\n";
}
