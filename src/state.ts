import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Claude, MarketplaceInfo } from "./claude";
import { repoKeyFromUrl } from "./spec";

/** 状態ファイル(Claude のディレクトリ直下)。cpm が追加した marketplace と plugin を記録し、ここに無いものには触れない */
export const STATE_FILE = ".cpm-state.json";

export interface State {
  /** marketplace の名前 */
  marketplaces: string[];
  /** plugin@marketplace */
  plugins: string[];
}

/** 現在の登録状況 */
export interface Snapshot {
  marketplaces: MarketplaceInfo[];
  plugins: string[];
  /** marketplace 名 -> 自動更新の設定値 */
  autoUpdate: Record<string, boolean | undefined>;
}

export function readState(claudeDir: string): State {
  try {
    const doc = JSON.parse(readFileSync(join(claudeDir, STATE_FILE), "utf8")) as Partial<State>;
    return { marketplaces: doc.marketplaces ?? [], plugins: doc.plugins ?? [] };
  } catch {
    return { marketplaces: [], plugins: [] };
  }
}

export function writeState(claudeDir: string, state: State): void {
  mkdirSync(claudeDir, { recursive: true });
  const file = join(claudeDir, STATE_FILE);
  writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2) + "\n");
  renameSync(`${file}.tmp`, file);
}

export async function takeSnapshot(claude: Claude): Promise<Snapshot> {
  return {
    marketplaces: await claude.listMarketplaces(),
    plugins: await claude.listPlugins(),
    autoUpdate: await claude.autoUpdates(),
  };
}

/** 既に存在しないものを記録から外す(手動で削除された場合など) */
export function pruneState(state: State, snap: Snapshot): State {
  const names = new Set(snap.marketplaces.map((m) => m.name));
  const plugins = new Set(snap.plugins);
  return {
    marketplaces: state.marketplaces.filter((n) => names.has(n)),
    plugins: state.plugins.filter((id) => plugins.has(id)),
  };
}

/** 現在あるもののうち、cpm の記録に無いもの(install しても削除されない) */
export function findUnmanaged(snap: Snapshot, state: State): { marketplaces: string[]; plugins: string[] } {
  return {
    marketplaces: snap.marketplaces.map((m) => m.name).filter((name) => !state.marketplaces.includes(name)),
    plugins: snap.plugins.filter((id) => !state.plugins.includes(id)),
  };
}

/** 登録済み marketplace のリポジトリの識別子。GitHub 以外なら null */
export function marketplaceRepo(m: MarketplaceInfo): string | null {
  if (m.source === "github") return m.repo ?? null;
  return m.source === "git" && m.url ? repoKeyFromUrl(m.url) : null;
}
