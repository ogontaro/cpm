import type { Claude, MarketplaceInfo, UpdateResult } from "../src/claude";
import type { Git } from "../src/lock";

const marketOf = (id: string) => id.slice(id.lastIndexOf("@") + 1);

/** `claude plugin` の挙動を模した偽物。存在しないものの削除は本物と同じく失敗する */
export class FakeClaude implements Claude {
  marketplaces: MarketplaceInfo[] = [];
  plugins = new Set<string>();
  calls: string[] = [];
  /** owner/repo -> marketplace 名(既定はリポジトリ名) */
  names: Record<string, string> = {};
  /** marketplace 名 -> settings.json の autoUpdate */
  auto: Record<string, boolean | undefined> = {};
  /** plugin ID -> `claude plugin update --json` の結果 */
  updateResults: Record<string, UpdateResult> = {};

  async listMarketplaces() {
    return this.marketplaces.map((m) => ({ ...m }));
  }
  async listPlugins() {
    return [...this.plugins];
  }
  async autoUpdates() {
    // 本物と同じく、github の marketplace は settings.json に宣言があり、値だけが未設定になりうる
    return Object.fromEntries(
      this.marketplaces.filter((m) => m.source !== "directory").map((m) => [m.name, this.auto[m.name]]),
    );
  }
  async addMarketplace(source: string) {
    this.calls.push(`add ${source}`);
    const [repo = "", ref = null] = source.split("#");
    if (repo.startsWith("https://")) {
      // GitHub Enterprise は git の URL として登録される
      if (!this.marketplaces.some((m) => m.url === repo)) {
        this.marketplaces.push({ name: repo.split("/")[4]!.replace(/\.git$/, ""), source: "git", url: repo, ref });
      }
      return;
    }
    const existing = this.marketplaces.find((m) => m.repo === repo);
    // 本物と同じく、marketplace add は自動更新の設定を消す
    if (existing) {
      delete this.auto[existing.name];
      return;
    }
    const name = this.names[repo] ?? repo.split("/")[1]!;
    this.marketplaces.push({ name, source: "github", repo, ref, installLocation: `/${name}` });
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
    return this.updateResults[id] ?? {};
  }
}

/** marketplace の checkout を模した偽物。checkout 先(`/<marketplace 名>`)ごとに HEAD を持つ */
export class FakeGit implements Git {
  heads: Record<string, string> = {};
  calls: string[] = [];
  /** settled が返すコミット */
  settledTo: string | null = null;

  async head(dir: string) {
    return (this.heads[dir] ??= "new0000");
  }
  async checkout(dir: string, commit: string) {
    this.calls.push(`checkout ${commit}`);
    this.heads[dir] = commit;
  }
  async changes(_dir: string, from: string | null, to: string) {
    this.calls.push(`changes ${from}..${to}`);
    return ["A\thooks/hooks.json", "M\tREADME.md"];
  }
  async settled(_dir: string, days: number, locked: string) {
    this.calls.push(`settled ${days}d ${locked}`);
    return this.settledTo;
  }
}
