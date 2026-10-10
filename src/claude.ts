import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** `claude plugin marketplace list --json` の 1 件 */
export interface MarketplaceInfo {
  name: string;
  /** "github" / "git" / "directory" など */
  source: string;
  /** source が github のときの owner/repo */
  repo?: string;
  /** source が git のときの URL */
  url?: string;
  ref?: string | null;
}

/** `claude plugin` コマンドと、marketplace の自動更新設定。本番は実コマンド、テストでは差し替える */
export interface Claude {
  listMarketplaces(): Promise<MarketplaceInfo[]>;
  /** user スコープにインストール済みの plugin ID(plugin@marketplace) */
  listPlugins(): Promise<string[]>;
  /** marketplace 名 -> 自動更新の設定値(未設定は undefined) */
  autoUpdates(): Promise<Record<string, boolean | undefined>>;
  addMarketplace(source: string): Promise<void>;
  removeMarketplace(name: string): Promise<void>;
  updateMarketplace(name: string): Promise<void>;
  setAutoUpdate(name: string, value: boolean): Promise<void>;
  install(id: string): Promise<void>;
  uninstall(id: string): Promise<void>;
  update(id: string): Promise<void>;
}

async function run(configDir: string, args: string[]): Promise<string> {
  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    proc = Bun.spawn(["claude", "plugin", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    });
  } catch {
    throw new Error("claude コマンドが見つかりません。Claude Code をインストールして PATH を通してください");
  }
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    const detail = (stderr.trim() || stdout.trim()).split("\n").filter(Boolean).at(-1) ?? `終了コード ${code}`;
    throw new Error(`claude plugin ${args.join(" ")} に失敗しました: ${detail}`);
  }
  return stdout;
}

type Settings = { extraKnownMarketplaces?: Record<string, { autoUpdate?: boolean } & Record<string, unknown>> } & Record<string, unknown>;

/** user スコープの設定ファイル(`<設定ディレクトリ>/settings.json`)を使う実装 */
export function createClaude(configDir: string): Claude {
  const settingsFile = join(configDir, "settings.json");
  const readSettings = (): Settings => {
    try {
      return JSON.parse(readFileSync(settingsFile, "utf8")) as Settings;
    } catch {
      return {};
    }
  };

  return {
    async listMarketplaces() {
      return JSON.parse(await run(configDir, ["marketplace", "list", "--json"])) as MarketplaceInfo[];
    },
    async listPlugins() {
      const plugins = JSON.parse(await run(configDir, ["list", "--json"])) as { id: string; scope: string }[];
      return plugins.filter((p) => p.scope === "user").map((p) => p.id);
    },
    async autoUpdates() {
      const entries = readSettings().extraKnownMarketplaces ?? {};
      return Object.fromEntries(Object.entries(entries).map(([name, entry]) => [name, entry.autoUpdate]));
    },
    async addMarketplace(source) {
      await run(configDir, ["marketplace", "add", source]);
    },
    async removeMarketplace(name) {
      await run(configDir, ["marketplace", "remove", name]);
    },
    async updateMarketplace(name) {
      await run(configDir, ["marketplace", "update", name]);
    },
    async setAutoUpdate(name, value) {
      const settings = readSettings();
      const entry = settings.extraKnownMarketplaces?.[name];
      if (!entry) throw new Error(`${settingsFile} に marketplace "${name}" の宣言が見つかりません`);
      entry.autoUpdate = value;
      mkdirSync(configDir, { recursive: true });
      writeFileSync(`${settingsFile}.tmp`, JSON.stringify(settings, null, 2) + "\n");
      renameSync(`${settingsFile}.tmp`, settingsFile);
    },
    async install(id) {
      await run(configDir, ["install", id, "--scope", "user"]);
    },
    async uninstall(id) {
      await run(configDir, ["uninstall", id, "--scope", "user"]);
    },
    async update(id) {
      await run(configDir, ["update", id, "--scope", "user"]);
    },
  };
}
