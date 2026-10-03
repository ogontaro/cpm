import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Claude, MarketplaceInfo } from "../src/claude";
import type { Desired } from "../src/manifest";
import { parseMarketplace, parsePlugin } from "../src/spec";
import { apply, plan, pruneState, readState, takeSnapshot, type Action } from "../src/sync";

const marketOf = (id: string) => id.slice(id.lastIndexOf("@") + 1);

/** `claude plugin` の挙動を模した偽物。存在しないものの削除は本物と同じく失敗する */
class FakeClaude implements Claude {
  marketplaces: MarketplaceInfo[] = [];
  plugins = new Set<string>();
  calls: string[] = [];
  /** owner/repo -> marketplace 名(既定はリポジトリ名) */
  names: Record<string, string> = {};
  /** marketplace 名 -> settings.json の autoUpdate */
  auto: Record<string, boolean | undefined> = {};

  async listMarketplaces() {
    return this.marketplaces.map((m) => ({ ...m }));
  }
  async listPlugins() {
    return [...this.plugins];
  }
  async autoUpdates() {
    return { ...this.auto };
  }
  async addMarketplace(source: string) {
    this.calls.push(`add ${source}`);
    const [repo = "", ref = null] = source.split("#");
    const existing = this.marketplaces.find((m) => m.repo === repo);
    // 本物と同じく、marketplace add は自動更新の設定を消す
    if (existing) {
      delete this.auto[existing.name];
      return;
    }
    this.marketplaces.push({ name: this.names[repo] ?? repo.split("/")[1]!, source: "github", repo, ref });
  }
  async removeMarketplace(name: string) {
    this.calls.push(`remove ${name}`);
    if (!this.marketplaces.some((m) => m.name === name)) throw new Error(`no marketplace ${name}`);
    this.marketplaces = this.marketplaces.filter((m) => m.name !== name);
    delete this.auto[name];
    for (const id of [...this.plugins]) if (marketOf(id) === name) this.plugins.delete(id);
  }
  async setAutoUpdate(name: string, value: boolean) {
    this.calls.push(`auto ${name}=${value}`);
    if (!this.marketplaces.some((m) => m.name === name)) throw new Error(`no marketplace ${name}`);
    this.auto[name] = value;
  }
  async updateMarketplace(name: string) {
    this.calls.push(`update-marketplace ${name}`);
  }
  async install(id: string) {
    this.calls.push(`install ${id}`);
    if (!this.marketplaces.some((m) => m.name === marketOf(id))) throw new Error(`no marketplace for ${id}`);
    this.plugins.add(id);
  }
  async uninstall(id: string) {
    this.calls.push(`uninstall ${id}`);
    if (!this.plugins.has(id)) throw new Error(`not installed ${id}`);
    this.plugins.delete(id);
  }
  async update(id: string) {
    this.calls.push(`update ${id}`);
  }
}

let configDir: string;
let fake: FakeClaude;

const want = (marketplaces: string[], plugins: string[], autoUpdate = true): Desired => ({
  marketplaces: marketplaces.map(parseMarketplace),
  plugins: plugins.map(parsePlugin),
  autoUpdate,
});

const label = (a: Action): string => {
  switch (a.kind) {
    case "uninstall":
    case "install":
    case "update":
      return `${a.kind} ${a.id}`;
    case "remove-marketplace":
      return `remove ${a.name}`;
    case "set-auto-update":
      return `auto ${a.name}=${a.value}`;
    default:
      return `${a.kind} ${a.spec.repo}`;
  }
};

/** sync の 1 回分: スナップショット -> 計画 -> 適用 */
async function sync(desired: Desired, opts: { update?: boolean } = {}) {
  const snap = await takeSnapshot(fake);
  const state = pruneState(readState(configDir), snap);
  const actions = plan(desired, snap, state, opts);
  fake.calls = [];
  await apply(actions, { claude: fake, configDir, state, autoUpdate: desired.autoUpdate });
  return actions.map(label);
}

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "cpm-sync-"));
  fake = new FakeClaude();
});
afterEach(() => rmSync(configDir, { recursive: true, force: true }));

describe("追加と冪等性", () => {
  test("marketplace を追加して plugin をインストールし、再実行では何もしない", async () => {
    const desired = want(["o/mk#v1"], ["a@mk", "b@mk"]);
    expect(await sync(desired)).toEqual(["add-marketplace o/mk", "install a@mk", "install b@mk"]);
    expect(fake.calls).toEqual(["add o/mk#v1", "auto mk=true", "install a@mk", "install b@mk"]);
    expect(readState(configDir)).toEqual({ marketplaces: ["mk"], plugins: ["a@mk", "b@mk"] });

    expect(await sync(desired)).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  test("marketplace 名が owner/repo と異なっていても、plugin@marketplace の名前で解決する", async () => {
    fake.names["o/skills"] = "o-skills";
    expect(await sync(want(["o/skills"], ["git@o-skills"]))).toEqual(["add-marketplace o/skills", "install git@o-skills"]);
    expect(readState(configDir).marketplaces).toEqual(["o-skills"]);
  });
});

describe("削除", () => {
  test("マニフェストから外した plugin だけを uninstall し、marketplace は残す", async () => {
    await sync(want(["o/mk"], ["a@mk", "b@mk"]));
    expect(await sync(want(["o/mk"], ["a@mk"]))).toEqual(["uninstall b@mk"]);
    expect([...fake.plugins]).toEqual(["a@mk"]);
  });

  test("marketplace ごと外したときは remove だけを行い、plugin の uninstall は行わない", async () => {
    await sync(want(["o/mk"], ["a@mk"]));
    expect(await sync(want([], []))).toEqual(["remove mk"]);
    expect(fake.calls).toEqual(["remove mk"]);
    expect(readState(configDir)).toEqual({ marketplaces: [], plugins: [] });
  });

  test("手動で追加されたものは削除しない", async () => {
    fake.marketplaces.push({ name: "manual", source: "github", repo: "x/manual", ref: null });
    fake.plugins.add("m@manual");
    await sync(want(["o/mk"], ["a@mk"]));
    expect(await sync(want([], []))).toEqual(["remove mk"]);
    expect(fake.marketplaces.map((m) => m.name)).toEqual(["manual"]);
    expect([...fake.plugins]).toEqual(["m@manual"]);
  });

  test("手動で既に入れた plugin を宣言しても所有せず、外しても削除しない", async () => {
    fake.marketplaces.push({ name: "mk", source: "github", repo: "o/mk", ref: null });
    fake.plugins.add("a@mk");
    expect(await sync(want(["o/mk"], ["a@mk"]))).toEqual([]);
    expect(readState(configDir)).toEqual({ marketplaces: [], plugins: [] });

    expect(await sync(want(["o/mk"], []))).toEqual([]);
    expect([...fake.plugins]).toEqual(["a@mk"]);
  });

  test("手動で削除されたものは、記録から外して再インストールする", async () => {
    const desired = want(["o/mk"], ["a@mk"]);
    await sync(desired);
    fake.plugins.delete("a@mk");
    expect(await sync(desired)).toEqual(["install a@mk"]);
  });
});

describe("ref の変更", () => {
  test("cpm が追加した marketplace の ref が変わると、置き換えて plugin を入れ直す", async () => {
    await sync(want(["o/mk#v1"], ["a@mk"]));
    expect(await sync(want(["o/mk#v2"], ["a@mk"]))).toEqual(["replace-marketplace o/mk", "install a@mk"]);
    expect(fake.calls).toEqual(["remove mk", "add o/mk#v2", "auto mk=true", "install a@mk"]);
    expect(fake.marketplaces[0]?.ref).toBe("v2");
    expect(readState(configDir)).toEqual({ marketplaces: ["mk"], plugins: ["a@mk"] });
  });

  test("手動で追加された marketplace と ref が異なるときはエラーにする", async () => {
    fake.marketplaces.push({ name: "mk", source: "github", repo: "o/mk", ref: "v1" });
    const snap = await takeSnapshot(fake);
    expect(() => plan(want(["o/mk#v2"], []), snap, readState(configDir))).toThrow("管理外");
  });

  test("手動で追加された marketplace と ref が同じなら、そのまま使う", async () => {
    fake.marketplaces.push({ name: "mk", source: "github", repo: "o/mk", ref: "v1" });
    expect(await sync(want(["o/mk#v1"], ["a@mk"]))).toEqual(["install a@mk"]);
    expect(readState(configDir).marketplaces).toEqual([]);
  });
});

describe("検証", () => {
  test("plugin が参照する marketplace が無ければ、インストール前にエラーにする", async () => {
    const desired = want(["o/mk"], ["a@mk", "b@missing"]);
    await expect(sync(desired)).rejects.toThrow('marketplace "missing" が見つかりません(登録済み: mk)');
    expect(fake.calls).not.toContain("install a@mk");
  });

  test("途中で失敗しても、そこまでの記録は残り、次の実行で続きから収束する", async () => {
    const desired = want(["o/mk"], ["a@mk"]);
    const install = fake.install.bind(fake);
    fake.install = async () => {
      throw new Error("boom");
    };
    await expect(sync(desired)).rejects.toThrow("boom");
    expect(readState(configDir)).toEqual({ marketplaces: ["mk"], plugins: [] });

    fake.install = install;
    expect(await sync(desired)).toEqual(["install a@mk"]);
  });
});

describe("自動更新", () => {
  test("cpm が追加した marketplace は、既定で自動更新を ON にする", async () => {
    await sync(want(["o/mk"], ["a@mk"]));
    expect(fake.auto).toEqual({ mk: true });
  });

  test("マニフェストで OFF にすると、OFF を設定する", async () => {
    await sync(want(["o/mk"], ["a@mk"], false));
    expect(fake.auto).toEqual({ mk: false });
  });

  test("マニフェストの設定を変えると、追加済みの marketplace にも反映する", async () => {
    await sync(want(["o/mk"], []));
    expect(await sync(want(["o/mk"], [], false))).toEqual(["auto mk=false"]);
    expect(await sync(want(["o/mk"], [], false))).toEqual([]);
    expect(await sync(want(["o/mk"], [], true))).toEqual(["auto mk=true"]);
  });

  test("設定が消えていたら(marketplace add の影響など)、次の実行で直す", async () => {
    const desired = want(["o/mk"], []);
    await sync(desired);
    delete fake.auto.mk;
    expect(await sync(desired)).toEqual(["auto mk=true"]);
  });

  test("手動で追加された marketplace には設定しない", async () => {
    fake.marketplaces.push({ name: "mk", source: "github", repo: "o/mk", ref: null });
    await sync(want(["o/mk"], ["a@mk"]));
    expect(fake.auto).toEqual({});
  });
});

describe("--update", () => {
  test("既に入っているものだけを更新し、今回追加したものは更新しない", async () => {
    await sync(want(["o/mk"], ["a@mk"]));
    expect(await sync(want(["o/mk"], ["a@mk", "b@mk"]), { update: true })).toEqual([
      "update-marketplace o/mk",
      "install b@mk",
      "update a@mk",
    ]);
    expect(fake.calls).toEqual(["update-marketplace mk", "install b@mk", "update a@mk"]);
  });

  test("指定が無ければ更新しない", async () => {
    const desired = want(["o/mk"], ["a@mk"]);
    await sync(desired);
    expect(await sync(desired)).toEqual([]);
  });
});
