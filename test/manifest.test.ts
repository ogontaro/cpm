import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseManifest, resolveManifest, type ManifestSource } from "../src/manifest";

let dir: string;
/** "owner/repo/file" -> ファイルの中身(外部リポジトリの代わり) */
let remote: Record<string, string>;
let requested: string[];

const source: ManifestSource = {
  async readFile(include) {
    requested.push(include.raw);
    const body = remote[`${include.owner}/${include.repo}/${include.file}`];
    if (body === undefined) throw new Error(`not found: ${include.raw}`);
    return body;
  },
};

function local(body: string, name = "cpm.yml"): string {
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

async function resolve(path: string) {
  const r = await resolveManifest(path, source);
  return { marketplaces: r.marketplaces.map((m) => m.raw).sort(), plugins: r.plugins.map((p) => p.raw).sort() };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cpm-manifest-"));
  remote = {};
  requested = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("parseManifest", () => {
  test("JSON と YAML を拡張子で読み分ける", () => {
    const expected = { includes: [], marketplaces: ["o/r"], plugins: ["a@r"] };
    expect(parseManifest('{"marketplaces":["o/r"],"plugins":["a@r"]}', "cpm.json")).toEqual(expected);
    expect(parseManifest("marketplaces:\n  - o/r\nplugins:\n  - a@r\n", "cpm.yml")).toEqual(expected);
  });

  test("文字列のリストでなければエラーにする", () => {
    expect(() => parseManifest("plugins: 1", "cpm.yml")).toThrow("plugins");
    expect(() => parseManifest("{", "cpm.json")).toThrow("解析できません");
  });
});

describe("resolveManifest", () => {
  test("marketplaces と plugins を読む", async () => {
    const r = await resolve(local("marketplaces:\n  - o/r#v1\nplugins:\n  - a@r\n"));
    expect(r).toEqual({ marketplaces: ["o/r#v1"], plugins: ["a@r"] });
  });

  test("外部マニフェストを取り込む。ref も取得時に渡す", async () => {
    remote["o/common/cpm.json"] = '{"marketplaces":["x/one"],"plugins":["p@one"]}';
    const r = await resolve(local("includes:\n  - o/common/cpm.json#v2\nmarketplaces:\n  - y/two\nplugins:\n  - q@two\n"));
    expect(r).toEqual({ marketplaces: ["x/one", "y/two"], plugins: ["p@one", "q@two"] });
    expect(requested).toEqual(["o/common/cpm.json#v2"]);
  });

  test("自分の marketplaces は、取り込んだ同じリポジトリの指定を上書きする", async () => {
    remote["o/common/cpm.yml"] = "marketplaces:\n  - x/one#v1\n";
    const r = await resolve(local("includes:\n  - o/common/cpm.yml\nmarketplaces:\n  - x/one#v2\n"));
    expect(r.marketplaces).toEqual(["x/one#v2"]);
  });

  test("別々の外部マニフェストが、同じリポジトリを異なる ref で指定するとエラーにする", async () => {
    remote["o/a/cpm.yml"] = "marketplaces:\n  - x/one#v1\n";
    remote["o/b/cpm.yml"] = "marketplaces:\n  - x/one#v2\n";
    await expect(resolve(local("includes:\n  - o/a/cpm.yml\n  - o/b/cpm.yml\n"))).rejects.toThrow("異なる ref");
  });

  test("同じ指定なら重複しても問題にしない", async () => {
    remote["o/a/cpm.yml"] = "marketplaces:\n  - x/one\nplugins:\n  - p@one\n";
    remote["o/b/cpm.yml"] = "marketplaces:\n  - x/one\nplugins:\n  - p@one\n";
    const r = await resolve(local("includes:\n  - o/a/cpm.yml\n  - o/b/cpm.yml\n"));
    expect(r).toEqual({ marketplaces: ["x/one"], plugins: ["p@one"] });
  });

  test("入れ子の includes も取り込む", async () => {
    remote["o/a/cpm.yml"] = "includes:\n  - o/b/cpm.yml\nplugins:\n  - a@m\n";
    remote["o/b/cpm.yml"] = "plugins:\n  - b@m\n";
    const r = await resolve(local("includes:\n  - o/a/cpm.yml\n"));
    expect(r.plugins).toEqual(["a@m", "b@m"]);
  });

  test("循環する includes はエラーにする", async () => {
    remote["o/a/cpm.yml"] = "includes:\n  - o/b/cpm.yml\n";
    remote["o/b/cpm.yml"] = "includes:\n  - o/a/cpm.yml\n";
    await expect(resolve(local("includes:\n  - o/a/cpm.yml\n"))).rejects.toThrow("循環");
  });

  test("自身の marketplaces に同じリポジトリが複数あるとエラーにする", async () => {
    await expect(resolve(local("marketplaces:\n  - x/one#v1\n  - x/one#v2\n"))).rejects.toThrow("複数");
  });

  test("autoUpdate は既定で true。自分のマニフェストの指定だけが有効", async () => {
    expect((await resolveManifest(local("plugins: []\n"), source)).autoUpdate).toBe(true);
    expect((await resolveManifest(local("autoUpdate: false\n"), source)).autoUpdate).toBe(false);

    remote["o/common/cpm.yml"] = "autoUpdate: false\n";
    expect((await resolveManifest(local("includes:\n  - o/common/cpm.yml\n"), source)).autoUpdate).toBe(true);
  });

  test("autoUpdate が真偽値でなければエラーにする", async () => {
    await expect(resolve(local("autoUpdate: yes please\n"))).rejects.toThrow("autoUpdate");
  });

  test("マニフェストが無ければエラーにする", async () => {
    await expect(resolve(join(dir, "none.yml"))).rejects.toThrow("読み込めません");
  });
});
