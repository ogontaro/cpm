import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseInclude } from "../src/spec";
import { parseManifest, resolveManifest, type ManifestSource } from "../src/manifest";

let dir: string;
/** "host/owner/repo/file" -> ファイルの中身(外部リポジトリの代わり) */
let remote: Record<string, string>;
let requested: string[];

const source: ManifestSource = {
  async readFile(include) {
    requested.push(include.raw);
    const body = remote[`${include.host}/${include.owner}/${include.repo}/${include.file}`];
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
    const expected = { includes: [], marketplaces: ["o/r"], plugins: ["a@r"], exclude: [] };
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
    remote["github.com/o/common/cpm.json"] = '{"marketplaces":["x/one"],"plugins":["p@one"]}';
    const r = await resolve(local("includes:\n  - o/common/cpm.json#v2\nmarketplaces:\n  - y/two\nplugins:\n  - q@two\n"));
    expect(r).toEqual({ marketplaces: ["x/one", "y/two"], plugins: ["p@one", "q@two"] });
    expect(requested).toEqual(["o/common/cpm.json#v2"]);
  });

  test("自分の marketplaces は、取り込んだ同じリポジトリの指定を上書きする", async () => {
    remote["github.com/o/common/cpm.yml"] = "marketplaces:\n  - x/one#v1\n";
    const r = await resolve(local("includes:\n  - o/common/cpm.yml\nmarketplaces:\n  - x/one#v2\n"));
    expect(r.marketplaces).toEqual(["x/one#v2"]);
  });

  test("別々の外部マニフェストが、同じリポジトリを異なる ref で指定するとエラーにする", async () => {
    remote["github.com/o/a/cpm.yml"] = "marketplaces:\n  - x/one#v1\n";
    remote["github.com/o/b/cpm.yml"] = "marketplaces:\n  - x/one#v2\n";
    await expect(resolve(local("includes:\n  - o/a/cpm.yml\n  - o/b/cpm.yml\n"))).rejects.toThrow("異なる ref");
  });

  test("同じ指定なら重複しても問題にしない", async () => {
    remote["github.com/o/a/cpm.yml"] = "marketplaces:\n  - x/one\nplugins:\n  - p@one\n";
    remote["github.com/o/b/cpm.yml"] = "marketplaces:\n  - x/one\nplugins:\n  - p@one\n";
    const r = await resolve(local("includes:\n  - o/a/cpm.yml\n  - o/b/cpm.yml\n"));
    expect(r).toEqual({ marketplaces: ["x/one"], plugins: ["p@one"] });
  });

  test("入れ子の includes も取り込む", async () => {
    remote["github.com/o/a/cpm.yml"] = "includes:\n  - o/b/cpm.yml\nplugins:\n  - a@m\n";
    remote["github.com/o/b/cpm.yml"] = "plugins:\n  - b@m\n";
    const r = await resolve(local("includes:\n  - o/a/cpm.yml\n"));
    expect(r.plugins).toEqual(["a@m", "b@m"]);
  });

  test("exclude に書いた plugin は、取り込んだ includes からも外れる", async () => {
    remote["github.com/o/a/cpm.yml"] = "includes:\n  - o/b/cpm.yml\nplugins:\n  - a@m\n";
    remote["github.com/o/b/cpm.yml"] = "plugins:\n  - b@m\n  - c@m\n";
    const r = await resolve(local("includes:\n  - o/a/cpm.yml\nexclude:\n  - a@m\n  - b@m\n"));
    expect(r.plugins).toEqual(["c@m"]);
  });

  test("plugins と exclude の両方に同じ plugin があるとエラーにする", async () => {
    await expect(resolve(local("plugins:\n  - a@m\nexclude:\n  - a@m\n"))).rejects.toThrow("exclude");
  });

  test("循環する includes はエラーにする", async () => {
    remote["github.com/o/a/cpm.yml"] = "includes:\n  - o/b/cpm.yml\n";
    remote["github.com/o/b/cpm.yml"] = "includes:\n  - o/a/cpm.yml\n";
    await expect(resolve(local("includes:\n  - o/a/cpm.yml\n"))).rejects.toThrow("循環");
  });

  test("自身の marketplaces に同じリポジトリが複数あるとエラーにする", async () => {
    await expect(resolve(local("marketplaces:\n  - x/one#v1\n  - x/one#v2\n"))).rejects.toThrow("複数");
  });

  test("autoUpdate は省略できる。自分のマニフェストの指定だけが有効", async () => {
    expect((await resolveManifest(local("plugins: []\n"), source)).autoUpdate).toBeUndefined();
    expect((await resolveManifest(local("autoUpdate: false\n"), source)).autoUpdate).toBe(false);

    remote["github.com/o/common/cpm.yml"] = "autoUpdate: false\n";
    expect((await resolveManifest(local("includes:\n  - o/common/cpm.yml\n"), source)).autoUpdate).toBeUndefined();
  });

  test("autoUpdate が真偽値でなければエラーにする", async () => {
    await expect(resolve(local("autoUpdate: yes please\n"))).rejects.toThrow("autoUpdate");
  });

  test("GitHub Enterprise の外部マニフェストと marketplace を取り込む", async () => {
    remote["ghe.example.com/o/common/cpm.yml"] = "marketplaces:\n  - ghe.example.com/o/mk#v1\nplugins:\n  - p@mk\n";
    const r = await resolve(local("includes:\n  - ghe.example.com/o/common/cpm.yml#v2\n"));
    expect(r).toEqual({ marketplaces: ["ghe.example.com/o/mk#v1"], plugins: ["p@mk"] });
    expect(requested).toEqual(["ghe.example.com/o/common/cpm.yml#v2"]);
  });

  test("GitHub 上のマニフェストを起点にして、ローカルのファイルなしで解決する", async () => {
    remote["ghe.example.com/o/common/cpm.yml"] = "includes:\n  - o/base/cpm.yml\nmarketplaces:\n  - x/one\nautoUpdate: false\n";
    remote["github.com/o/base/cpm.yml"] = "plugins:\n  - b@one\n";
    const r = await resolveManifest(parseInclude("ghe.example.com/o/common/cpm.yml"), source);
    expect(r.marketplaces.map((m) => m.raw)).toEqual(["x/one"]);
    expect(r.plugins.map((p) => p.raw)).toEqual(["b@one"]);
    expect(r.autoUpdate).toBe(false);
  });

  test("起点のマニフェストを自分自身で取り込むと循環としてエラーにする", async () => {
    remote["github.com/o/a/cpm.yml"] = "includes:\n  - o/a/cpm.yml\n";
    await expect(resolveManifest(parseInclude("o/a/cpm.yml"), source)).rejects.toThrow("循環");
  });

  test("マニフェストが無ければエラーにする", async () => {
    await expect(resolve(join(dir, "none.yml"))).rejects.toThrow("読み込めません");
  });
});
