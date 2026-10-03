import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Claude, MarketplaceInfo } from "./claude";
import type { Desired } from "./manifest";
import type { MarketplaceSpec } from "./spec";

/** cpm が追加した marketplace と plugin の記録。ここに無いものには触れない */
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

export type Action =
  | { kind: "uninstall"; id: string }
  | { kind: "remove-marketplace"; name: string }
  | { kind: "replace-marketplace"; spec: MarketplaceSpec; name: string; from: string | null }
  | { kind: "add-marketplace"; spec: MarketplaceSpec }
  | { kind: "set-auto-update"; name: string; value: boolean }
  | { kind: "update-marketplace"; spec: MarketplaceSpec }
  | { kind: "install"; id: string }
  | { kind: "update"; id: string };

export function readState(configDir: string): State {
  try {
    const doc = JSON.parse(readFileSync(join(configDir, STATE_FILE), "utf8")) as Partial<State>;
    return { marketplaces: doc.marketplaces ?? [], plugins: doc.plugins ?? [] };
  } catch {
    return { marketplaces: [], plugins: [] };
  }
}

export function writeState(configDir: string, state: State): void {
  mkdirSync(configDir, { recursive: true });
  const file = join(configDir, STATE_FILE);
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

const marketOf = (id: string): string => id.slice(id.lastIndexOf("@") + 1);

/**
 * あるべき状態と現在の状態から、行う操作を決める。変更は加えない。
 *
 * - cpm が追加したもの(記録にあるもの)だけを削除する。手動で追加されたものには触れない。
 * - 手動で追加された同じリポジトリ・同じ ref の marketplace は、そのまま使う(所有はしない)。
 */
export function plan(desired: Desired, snap: Snapshot, state: State, opts: { update?: boolean } = {}): Action[] {
  const github = new Map<string, MarketplaceInfo>();
  for (const m of snap.marketplaces) if (m.source === "github" && m.repo) github.set(m.repo, m);

  const owned = new Set(state.marketplaces);
  const kept = new Set<string>();
  const replaced = new Set<string>();
  const adds: Action[] = [];
  const replaces: Action[] = [];
  const marketUpdates: Action[] = [];

  for (const spec of desired.marketplaces) {
    const current = github.get(spec.repo);
    if (!current) {
      adds.push({ kind: "add-marketplace", spec });
      continue;
    }
    kept.add(current.name);
    if ((current.ref ?? null) === spec.ref) {
      if (opts.update) marketUpdates.push({ kind: "update-marketplace", spec });
    } else if (owned.has(current.name)) {
      replaces.push({ kind: "replace-marketplace", spec, name: current.name, from: current.ref ?? null });
      replaced.add(current.name);
    } else {
      throw new Error(
        `marketplace "${current.name}" (${spec.repo}) は cpm の管理外で、ref が異なります` +
          `(登録済み: ${current.ref ?? "既定ブランチ"}、マニフェスト: ${spec.ref ?? "既定ブランチ"})`,
      );
    }
  }

  const existing = new Set(snap.marketplaces.map((m) => m.name));
  const removed = state.marketplaces.filter((name) => existing.has(name) && !kept.has(name));
  const removedSet = new Set(removed);

  // marketplace を外すと、その plugin も外れる
  const installed = new Set(snap.plugins.filter((id) => !replaced.has(marketOf(id))));
  const desiredIds = new Set(desired.plugins.map((p) => p.raw));

  const uninstalls: Action[] = state.plugins
    .filter((id) => !desiredIds.has(id) && snap.plugins.includes(id) && !removedSet.has(marketOf(id)))
    .map((id) => ({ kind: "uninstall", id }));
  const installs: Action[] = desired.plugins
    .filter((p) => !installed.has(p.raw))
    .map((p) => ({ kind: "install", id: p.raw }));
  const updates: Action[] = opts.update
    ? desired.plugins.filter((p) => installed.has(p.raw)).map((p) => ({ kind: "update", id: p.raw }))
    : [];

  // 新しく追加・置き換えた marketplace は、apply の中で追加の直後に設定する
  const autoUpdates: Action[] = [...kept]
    .filter((name) => owned.has(name) && !replaced.has(name) && snap.autoUpdate[name] !== desired.autoUpdate)
    .map((name) => ({ kind: "set-auto-update", name, value: desired.autoUpdate }));

  return [
    ...uninstalls,
    ...removed.map((name): Action => ({ kind: "remove-marketplace", name })),
    ...replaces,
    ...adds,
    ...autoUpdates,
    ...marketUpdates,
    ...installs,
    ...updates,
  ];
}

/**
 * 計画を適用する。1 ステップごとに記録を更新するので、途中で止まっても次の実行で続きから収束する。
 * インストールの前に、plugin が参照する marketplace が全て登録されていることを確認する。
 */
export async function apply(
  actions: Action[],
  opts: { claude: Claude; configDir: string; state: State; autoUpdate: boolean },
): Promise<void> {
  const { claude, configDir, state } = opts;
  const claim = (list: string[], value: string) => {
    if (!list.includes(value)) list.push(value);
  };
  const nameOf = async (spec: MarketplaceSpec): Promise<string> => {
    const found = (await claude.listMarketplaces()).find((m) => m.source === "github" && m.repo === spec.repo);
    if (!found) throw new Error(`marketplace "${spec.raw}" を登録できませんでした`);
    return found.name;
  };
  // 追加した marketplace を所有として記録し、自動更新を設定する(marketplace add は自動更新の設定を消すため)
  const register = async (spec: MarketplaceSpec) => {
    const name = await nameOf(spec);
    claim(state.marketplaces, name);
    await claude.setAutoUpdate(name, opts.autoUpdate);
  };
  const dropMarketplace = (name: string) => {
    state.marketplaces = state.marketplaces.filter((n) => n !== name);
    state.plugins = state.plugins.filter((id) => marketOf(id) !== name);
  };

  let verified = false;
  for (const action of actions) {
    switch (action.kind) {
      case "uninstall":
        await claude.uninstall(action.id);
        state.plugins = state.plugins.filter((id) => id !== action.id);
        break;
      case "remove-marketplace":
        await claude.removeMarketplace(action.name);
        dropMarketplace(action.name);
        break;
      case "replace-marketplace":
        await claude.removeMarketplace(action.name);
        dropMarketplace(action.name);
        writeState(configDir, state);
        await claude.addMarketplace(action.spec.raw);
        await register(action.spec);
        break;
      case "add-marketplace":
        await claude.addMarketplace(action.spec.raw);
        await register(action.spec);
        break;
      case "set-auto-update":
        await claude.setAutoUpdate(action.name, action.value);
        break;
      case "update-marketplace":
        await claude.updateMarketplace(await nameOf(action.spec));
        break;
      case "install": {
        if (!verified) {
          verified = true;
          const names = new Set((await claude.listMarketplaces()).map((m) => m.name));
          for (const a of actions) {
            if (a.kind === "install" && !names.has(marketOf(a.id))) {
              throw new Error(
                `plugin "${a.id}" の marketplace "${marketOf(a.id)}" が見つかりません(登録済み: ${[...names].join(", ") || "なし"})`,
              );
            }
          }
        }
        await claude.install(action.id);
        claim(state.plugins, action.id);
        break;
      }
      case "update":
        await claude.update(action.id);
        break;
    }
    writeState(configDir, state);
  }
}
