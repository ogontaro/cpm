/** `key:` 行の位置と、その行に書かれた値(コメントを除く)。key が無ければ head は -1 */
function findKey(lines: string[], key: string): { head: number; rest: string } {
  const head = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  const rest = head < 0 ? "" : lines[head]!.slice(key.length + 1).replace(/\s+#.*$/, "").trim();
  return { head, rest };
}

/**
 * cpm.yml(YAML)の `key` のリストに item を追記する。コメントや並びを保つため、本文を文字列のまま書き換える。
 * 既にあれば何もしない。リストが `key: []` なら block 形式に直し、`key` が無ければ末尾に作る。
 */
export function addToManifest(text: string, key: string, item: string): string {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const entry = (indent: string) => `${indent}- ${item}`;

  const { head, rest } = findKey(lines, key);
  if (head < 0) return [...lines, `${key}:`, entry("  ")].join("\n") + "\n";

  if (rest === "[]") {
    lines.splice(head, 1, `${key}:`, entry("  "));
  } else if (rest === "") {
    let last = head;
    let indent = "  ";
    for (let i = head + 1; i < lines.length; i++) {
      const dash = /^(\s*)-\s+(.*?)\s*$/.exec(lines[i]!);
      if (dash) {
        if (dash[2] === item) return text;
        last = i;
        indent = dash[1]!;
      } else if (!/^\s*(#.*)?$/.test(lines[i]!)) break;
    }
    lines.splice(last + 1, 0, entry(indent));
  } else {
    throw new Error(`${key} は block 形式のリストで書いてください(${key}: ${rest})`);
  }
  return lines.join("\n") + "\n";
}

/**
 * cpm.yml(YAML)の `key` のリストから、match に合う項目の行を取り除く。addToManifest と同じく本文を文字列のまま書き換える。
 * match には、コメントと引用符を除いた項目が渡される。該当が無ければ何もしない。
 */
export function removeFromManifest(text: string, key: string, match: (item: string) => boolean): string {
  const lines = text.split("\n");
  const { head, rest } = findKey(lines, key);
  if (head < 0) return text;
  if (rest === "[]") return text;
  if (rest !== "") throw new Error(`${key} は block 形式のリストで書いてください(${key}: ${rest})`);

  const drop: number[] = [];
  for (let end = head + 1; end < lines.length; end++) {
    const dash = /^\s*-\s+(.*?)\s*$/.exec(lines[end]!);
    if (dash) {
      const item = dash[1]!.replace(/\s+#.*$/, "").replace(/^(["'])(.*)\1$/, "$2");
      if (match(item)) drop.push(end);
    } else if (!/^\s*(#.*)?$/.test(lines[end]!)) break;
  }
  return drop.length ? lines.filter((_, i) => !drop.includes(i)).join("\n") : text;
}
