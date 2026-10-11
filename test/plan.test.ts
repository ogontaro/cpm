import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Desired } from "../src/manifest";
import { apply, plan, planUninstall, type Action } from "../src/plan";
import { parseMarketplace, parsePlugin } from "../src/spec";
import { pruneState, readState, takeSnapshot } from "../src/state";
import { FakeClaude } from "./helpers";

let claudeDir: string;
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
    case "adopt-plugin":
      return `${a.kind} ${a.id}`;
    case "remove-marketplace":
      return `remove ${a.name}`;
    case "adopt-marketplace":
      return `${a.kind} ${a.name}`;
    case "set-auto-update":
      return `auto ${a.name}=${a.value}`;
    default:
      return `${a.kind} ${a.spec.repo}`;
  }
};

/** cpm install の 1 回分: スナップショット -> 計画 -> 適用 */
async function install(desired: Desired, opts: { update?: boolean } = {}) {
  const snap = await takeSnapshot(fake);
  const state = pruneState(readState(claudeDir), snap);
  const actions = plan(desired, snap, state, opts);
  fake.calls = [];
  await apply(actions, { claude: fake, claudeDir, state, autoUpdate: desired.autoUpdate });
  return actions.map(label);
}

beforeEach(() => {
  claudeDir = mkdtempSync(join(tmpdir(), "cpm-plan-"));
  fake = new FakeClaude();
});
afterEach(() => rmSync(claudeDir, { recursive: true, force: true }));

describe("追加と冪等性", () => {
  test("marketplace を追加して plugin をインストールし、再実行では何もしない", async () => {
    const desired = want(["o/mk#v1"], ["a@mk", "b@mk"]);
    expect(await install(desired)).toEqual(["add-marketplace o/mk", "install a@mk", "install b@mk"]);
    expect(fake.calls).toEqual(["add o/mk#v1", "auto mk=true", "install a@mk", "install b@mk"]);
    expect(readState(claudeDir)).toEqual({ marketplaces: ["mk"], plugins: ["a@mk", "b@mk"] });

    expect(await install(desired)).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  test("GitHub Enterprise の marketplace は https の URL で登録し、登録済みなら再度追加しない", async () => {
    const desired = want(["ghe.example.com/acme/mk#v1"], ["a@mk"]);
    expect(await install(desired)).toEqual(["add-marketplace ghe.example.com/acme/mk", "install a@mk"]);
    expect(fake.calls).toEqual(["add https://ghe.example.com/acme/mk.git#v1", "auto mk=true", "install a@mk"]);
    expect(await install(desired)).toEqual([]);
  });

  test("marketplace 名が owner/repo と異なっていても、plugin@marketplace の名前で解決する", async () => {
    fake.names["o/skills"] = "o-skills";
    expect(await install(want(["o/skills"], ["git@o-skills"]))).toEqual(["add-marketplace o/skills", "install git@o-skills"]);
    expect(readState(claudeDir).marketplaces).toEqual(["o-skills"]);
  });
});

describe("削除", () => {
  test("cpm.yml から外した plugin だけを uninstall し、marketplace は残す", async () => {
    await install(want(["o/mk"], ["a@mk", "b@mk"]));
    expect(await install(want(["o/mk"], ["a@mk"]))).toEqual(["uninstall b@mk"]);
    expect([...fake.plugins]).toEqual(["a@mk"]);
  });

  test("marketplace ごと外したときは remove だけを行い、plugin の uninstall は行わない", async () => {
    await install(want(["o/mk"], ["a@mk"]));
    expect(await install(want([], []))).toEqual(["remove mk"]);
    expect(fake.calls).toEqual(["remove mk"]);
    expect(readState(claudeDir)).toEqual({ marketplaces: [], plugins: [] });
  });

  test("手動で追加されたものは削除しない", async () => {
    fake.marketplaces.push({ name: "manual", source: "github", repo: "x/manual", ref: null });
    fake.plugins.add("m@manual");
    await install(want(["o/mk"], ["a@mk"]));
    expect(await install(want([], []))).toEqual(["remove mk"]);
    expect(fake.marketplaces.map((m) => m.name)).toEqual(["manual"]);
    expect([...fake.plugins]).toEqual(["m@manual"]);
  });

  test("手動で既に入れた plugin を宣言すると採用し、外したときに削除する", async () => {
    await install(want(["o/mk"], []));
    fake.plugins.add("a@mk");
    expect(await install(want(["o/mk"], ["a@mk"]))).toEqual(["adopt-plugin a@mk"]);
    expect(readState(claudeDir)).toEqual({ marketplaces: ["mk"], plugins: ["a@mk"] });

    expect(await install(want(["o/mk"], []))).toEqual(["uninstall a@mk"]);
    expect([...fake.plugins]).toEqual([]);
  });

  test("手動で既に入れた marketplace と plugin を宣言すると、まとめて採用する", async () => {
    fake.marketplaces.push({ name: "mk", source: "github", repo: "o/mk", ref: null });
    fake.plugins.add("a@mk");
    expect(await install(want(["o/mk"], ["a@mk"]))).toEqual(["adopt-marketplace mk", "adopt-plugin a@mk", "auto mk=true"]);
    expect(readState(claudeDir)).toEqual({ marketplaces: ["mk"], plugins: ["a@mk"] });

    expect(await install(want([], []))).toEqual(["remove mk"]);
  });

  test("marketplace を外すと一緒に外れる、管理外の plugin を示す", async () => {
    await install(want(["o/mk"], ["a@mk"]));
    fake.plugins.add("m@mk");
    const snap = await takeSnapshot(fake);
    const actions = plan(want([], []), snap, pruneState(readState(claudeDir), snap));
    expect(actions).toEqual([{ kind: "remove-marketplace", name: "mk", manualPlugins: ["m@mk"] }]);
  });

  test("手動で削除されたものは、記録から外して再インストールする", async () => {
    const desired = want(["o/mk"], ["a@mk"]);
    await install(desired);
    fake.plugins.delete("a@mk");
    expect(await install(desired)).toEqual(["install a@mk"]);
  });
});

describe("ref の変更", () => {
  test("cpm が追加した marketplace の ref が変わると、置き換えて plugin を入れ直す", async () => {
    await install(want(["o/mk#v1"], ["a@mk"]));
    expect(await install(want(["o/mk#v2"], ["a@mk"]))).toEqual(["replace-marketplace o/mk", "install a@mk"]);
    expect(fake.calls).toEqual(["remove mk", "add o/mk#v2", "auto mk=true", "install a@mk"]);
    expect(fake.marketplaces[0]?.ref).toBe("v2");
    expect(readState(claudeDir)).toEqual({ marketplaces: ["mk"], plugins: ["a@mk"] });
  });

  test("手動で追加された marketplace と ref が異なるときはエラーにする", async () => {
    fake.marketplaces.push({ name: "mk", source: "github", repo: "o/mk", ref: "v1" });
    const snap = await takeSnapshot(fake);
    expect(() => plan(want(["o/mk#v2"], []), snap, readState(claudeDir))).toThrow("管理外");
    expect(() => plan(want(["o/mk#v2"], []), snap, readState(claudeDir))).toThrow(
      "`claude plugin marketplace remove mk` を実行してから、再度 install してください",
    );
  });

  test("手動で追加された marketplace と ref が同じなら、採用して使う", async () => {
    fake.marketplaces.push({ name: "mk", source: "github", repo: "o/mk", ref: "v1" });
    expect(await install(want(["o/mk#v1"], ["a@mk"]))).toEqual(["adopt-marketplace mk", "auto mk=true", "install a@mk"]);
    expect(readState(claudeDir).marketplaces).toEqual(["mk"]);
  });
});

describe("検証", () => {
  test("plugin が参照する marketplace が無ければ、インストール前にエラーにする", async () => {
    const desired = want(["o/mk"], ["a@mk", "b@missing"]);
    await expect(install(desired)).rejects.toThrow('marketplace "missing" が見つかりません(登録済み: mk)');
    expect(fake.calls).not.toContain("install a@mk");
  });

  test("marketplace を追加しないなら、参照先が無いことを計画の時点でエラーにする", async () => {
    await install(want(["o/mk"], []));
    const snap = await takeSnapshot(fake);
    expect(() => plan(want(["o/mk"], ["a@typo"]), snap, readState(claudeDir))).toThrow(
      'marketplace "typo" が見つかりません(登録済み: mk)',
    );
  });

  test("参照先が無いときは、削除より前に止める", async () => {
    await install(want(["o/mk"], ["a@mk"]));
    await expect(install(want(["o/mk", "o/new"], ["b@missing"]))).rejects.toThrow('marketplace "missing" が見つかりません');
    expect(fake.calls).toEqual(["add o/new", "auto new=true"]);
    expect([...fake.plugins]).toEqual(["a@mk"]);
  });

  test("途中で失敗しても、そこまでの記録は残り、次の実行で続きから収束する", async () => {
    const desired = want(["o/mk"], ["a@mk"]);
    const original = fake.install.bind(fake);
    fake.install = async () => {
      throw new Error("boom");
    };
    await expect(install(desired)).rejects.toThrow("boom");
    expect(readState(claudeDir)).toEqual({ marketplaces: ["mk"], plugins: [] });

    fake.install = original;
    expect(await install(desired)).toEqual(["install a@mk"]);
  });
});

describe("自動更新", () => {
  test("cpm が追加した marketplace は、既定で自動更新を ON にする", async () => {
    await install(want(["o/mk"], ["a@mk"]));
    expect(fake.auto).toEqual({ mk: true });
  });

  test("cpm.yml で OFF にすると、OFF を設定する", async () => {
    await install(want(["o/mk"], ["a@mk"], false));
    expect(fake.auto).toEqual({ mk: false });
  });

  test("cpm.yml の設定を変えると、追加済みの marketplace にも反映する", async () => {
    await install(want(["o/mk"], []));
    expect(await install(want(["o/mk"], [], false))).toEqual(["auto mk=false"]);
    expect(await install(want(["o/mk"], [], false))).toEqual([]);
    expect(await install(want(["o/mk"], [], true))).toEqual(["auto mk=true"]);
  });

  test("設定が消えていたら(marketplace add の影響など)、次の実行で直す", async () => {
    const desired = want(["o/mk"], []);
    await install(desired);
    delete fake.auto.mk;
    expect(await install(desired)).toEqual(["auto mk=true"]);
  });

  test("採用した marketplace にも設定する", async () => {
    fake.marketplaces.push({ name: "mk", source: "github", repo: "o/mk", ref: null });
    await install(want(["o/mk"], ["a@mk"]));
    expect(fake.auto).toEqual({ mk: true });
  });

  test("cpm.yml で省略すると、追加する marketplace だけを ON にし、既存の設定には触れない", async () => {
    fake.marketplaces.push({ name: "old", source: "github", repo: "o/old", ref: null });
    fake.auto.old = false;
    const desired = { ...want(["o/old", "o/mk"], []), autoUpdate: undefined };
    await install(desired);
    expect(fake.auto).toEqual({ old: false, mk: true });
    expect(await install(desired)).toEqual([]);
  });
});

describe("手動で入れた plugin への影響", () => {
  test("marketplace の削除と ref の変更で一緒に外れる plugin を、計画に載せる", async () => {
    await install(want(["o/mk", "o/gone"], []));
    fake.plugins.add("m@mk");
    fake.plugins.add("g@gone");
    const snap = await takeSnapshot(fake);
    const actions = plan(want(["o/mk#v2"], []), snap, readState(claudeDir));
    expect(actions).toContainEqual(expect.objectContaining({ kind: "remove-marketplace", manualPlugins: ["g@gone"] }));
    expect(actions).toContainEqual(expect.objectContaining({ kind: "replace-marketplace", manualPlugins: ["m@mk"] }));
  });
});

describe("update", () => {
  test("既に入っているものだけを更新し、今回追加したものは更新しない", async () => {
    await install(want(["o/mk"], ["a@mk"]));
    expect(await install(want(["o/mk"], ["a@mk", "b@mk"]), { update: true })).toEqual([
      "update-marketplace o/mk",
      "install b@mk",
      "update a@mk",
    ]);
    expect(fake.calls).toEqual(["update-marketplace mk", "install b@mk", "update a@mk"]);
  });

  test("指定が無ければ更新しない", async () => {
    const desired = want(["o/mk"], ["a@mk"]);
    await install(desired);
    expect(await install(desired)).toEqual([]);
  });
});

describe("cleanup(空の cpm.yml との差分)", () => {
  test("管理下の plugin と marketplace だけを削除し、管理外は残して記録を空にする", async () => {
    fake.marketplaces.push({ name: "manual", source: "github", repo: "x/manual", ref: null });
    fake.plugins.add("m@manual");
    await install(want(["o/mk"], ["a@mk"]));
    fake.plugins.add("b@manual");
    const state = readState(claudeDir);
    state.plugins.push("b@manual"); // 管理外の marketplace に cpm が入れた plugin
    const snap = await takeSnapshot(fake);
    const actions = plan(want([], []), snap, state);
    await apply(actions, { claude: fake, claudeDir, state, autoUpdate: undefined });
    expect(actions.map(label)).toEqual(["uninstall b@manual", "remove mk"]);
    expect([...fake.plugins]).toEqual(["m@manual"]);
    expect(readState(claudeDir)).toEqual({ marketplaces: [], plugins: [] });
  });
});

describe("planUninstall(plugin を 1 つ削除)", () => {
  const run = async (id: string) => {
    const snap = await takeSnapshot(fake);
    const state = pruneState(readState(claudeDir), snap);
    const actions = planUninstall(id, snap, state);
    await apply(actions, { claude: fake, claudeDir, state, autoUpdate: undefined });
    return actions.map(label);
  };

  test("marketplace に他の plugin が残るときは、plugin だけを削除して記録から外す", async () => {
    await install(want(["o/mk"], ["a@mk", "b@mk"]));
    expect(await run("a@mk")).toEqual(["uninstall a@mk"]);
    expect([...fake.plugins]).toEqual(["b@mk"]);
    expect(readState(claudeDir)).toEqual({ marketplaces: ["mk"], plugins: ["b@mk"] });
  });

  test("最後の plugin なら、cpm の管理下の marketplace も削除する", async () => {
    await install(want(["o/mk"], ["a@mk"]));
    expect(await run("a@mk")).toEqual(["uninstall a@mk", "remove mk"]);
    expect(fake.marketplaces).toEqual([]);
    expect(readState(claudeDir)).toEqual({ marketplaces: [], plugins: [] });
  });

  test("管理外の marketplace は残し、管理外の plugin は削除する", async () => {
    fake.marketplaces.push({ name: "manual", source: "github", repo: "x/manual", ref: null });
    fake.plugins.add("m@manual");
    expect(await run("m@manual")).toEqual(["uninstall m@manual"]);
    expect(fake.marketplaces.map((m) => m.name)).toEqual(["manual"]);
  });

  test("インストールされていなければエラーにする", async () => {
    await expect(run("a@mk")).rejects.toThrow("インストールされていません");
  });
});
