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
  | { kind: "adopt-marketplace"; name: string }
  | { kind: "adopt-plugin"; id: string }
  | { kind: "uninstall"; id: string }
  /** manualPlugins: marketplace を外すと一緒に外れる、cpm 管理外の plugin */
  | { kind: "remove-marketplace"; name: string; manualPlugins: string[] }
  | { kind: "replace-marketplace"; spec: MarketplaceSpec; name: string; from: string | null; manualPlugins: string[] }
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

/** 現在あるもののうち、cpm の記録に無いもの(sync しても削除されない) */
export function findUnmanaged(snap: Snapshot, state: State): { marketplaces: string[]; plugins: string[] } {
  return {
    marketplaces: snap.marketplaces.map((m) => m.name).filter((name) => !state.marketplaces.includes(name)),
    plugins: snap.plugins.filter((id) => !state.plugins.includes(id)),
  };
}

const marketOf = (id: string): string => id.slice(id.lastIndexOf("@") + 1);

const missingMarketplace = (id: string, names: Iterable<string>): Error =>
  new Error(`plugin "${id}" の marketplace "${marketOf(id)}" が見つかりません(登録済み: ${[...names].join(", ") || "なし"})`);

/**
 * あるべき状態と現在の状態から、行う操作を決める。変更は加えない。
 *
 * - cpm が追加したもの(記録にあるもの)だけを削除する。手動で追加されたものには触れない。
 * - マニフェストに書かれていて既に存在するもの(marketplace は同じリポジトリ・同じ ref)は、cpm の管理下に採用する。
 * - 追加する marketplace が無いのに、plugin の参照先が無いときはエラーにする(dry-run でも気付ける)。
 */
export function plan(desired: Desired, snap: Snapshot, state: State, opts: { update?: boolean } = {}): Action[] {
  const github = new Map<string, MarketplaceInfo>();
  for (const m of snap.marketplaces) if (m.source === "github" && m.repo) github.set(m.repo, m);

  // marketplace を外すと、そこから手動で入れた plugin も外れる
  const manualPluginsOf = (name: string): string[] =>
    snap.plugins.filter((id) => marketOf(id) === name && !state.plugins.includes(id));
  const owned = new Set(state.marketplaces);
  const kept = new Set<string>();
  const replaced = new Set<string>();
  const adopts: Action[] = [];
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
      if (!owned.has(current.name)) {
        adopts.push({ kind: "adopt-marketplace", name: current.name });
        owned.add(current.name);
      }
      if (opts.update) marketUpdates.push({ kind: "update-marketplace", spec });
    } else if (owned.has(current.name)) {
      replaces.push({
        kind: "replace-marketplace",
        spec,
        name: current.name,
        from: current.ref ?? null,
        manualPlugins: manualPluginsOf(current.name),
      });
      replaced.add(current.name);
    } else {
      throw new Error(
        `marketplace "${current.name}" (${spec.repo}) は cpm の管理外で、ref が異なります` +
          `(登録済み: ${current.ref ?? "既定ブランチ"}、マニフェスト: ${spec.ref ?? "既定ブランチ"})。` +
          `\`claude plugin marketplace remove ${current.name}\` を実行してから、再度 sync してください`,
      );
    }
  }

  const existing = new Set(snap.marketplaces.map((m) => m.name));
  const removed = state.marketplaces.filter((name) => existing.has(name) && !kept.has(name));
  const removedSet = new Set(removed);

  // marketplace を外すと、その plugin も外れる
  const installed = new Set(snap.plugins.filter((id) => !replaced.has(marketOf(id)) && !removedSet.has(marketOf(id))));
  const desiredIds = new Set(desired.plugins.map((p) => p.raw));

  const adoptPlugins: Action[] = desired.plugins
    .filter((p) => installed.has(p.raw) && !state.plugins.includes(p.raw))
    .map((p) => ({ kind: "adopt-plugin", id: p.raw }));
  const uninstalls: Action[] = state.plugins
    .filter((id) => !desiredIds.has(id) && snap.plugins.includes(id) && !removedSet.has(marketOf(id)))
    .map((id) => ({ kind: "uninstall", id }));
  const toInstall = desired.plugins.filter((p) => !installed.has(p.raw));
  const installs: Action[] = toInstall.map((p) => ({ kind: "install", id: p.raw }));

  if (adds.length === 0) {
    const known = new Set([...existing].filter((name) => !removedSet.has(name)));
    for (const p of toInstall) if (!known.has(p.marketplace)) throw missingMarketplace(p.raw, known);
  }

  const updates: Action[] = opts.update
    ? desired.plugins.filter((p) => installed.has(p.raw)).map((p) => ({ kind: "update", id: p.raw }))
    : [];

  // 新しく追加・置き換えた marketplace は、apply の中で追加の直後に設定する
  const autoUpdates: Action[] = [...kept]
    .filter(
      (name) =>
        desired.autoUpdate !== undefined &&
        owned.has(name) &&
        !replaced.has(name) &&
        name in snap.autoUpdate &&
        snap.autoUpdate[name] !== desired.autoUpdate,
    )
    .map((name) => ({ kind: "set-auto-update", name, value: desired.autoUpdate! }));

  // 追加した marketplace の確認を挟めるよう、削除や置き換えは追加より後に行う
  return [
    ...adopts,
    ...adoptPlugins,
    ...adds,
    ...uninstalls,
    ...removed.map(
      (name): Action => ({
        kind: "remove-marketplace",
        name,
        manualPlugins: manualPluginsOf(name),
      }),
    ),
    ...replaces,
    ...autoUpdates,
    ...marketUpdates,
    ...installs,
    ...updates,
  ];
}

/**
 * 計画を適用する。1 ステップごとに記録を更新するので、途中で止まっても次の実行で続きから収束する。
 * marketplace の追加が済んだ時点で、plugin が参照する marketplace が全て登録されることを確認してから、削除や置き換えに進む。
 */
export async function apply(
  actions: Action[],
  opts: { claude: Claude; configDir: string; state: State; autoUpdate: boolean | undefined },
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
    await claude.setAutoUpdate(name, opts.autoUpdate ?? true);
  };
  const dropMarketplace = (name: string) => {
    state.marketplaces = state.marketplaces.filter((n) => n !== name);
    state.plugins = state.plugins.filter((id) => marketOf(id) !== name);
  };

  const verify = async () => {
    const removing = new Set(actions.flatMap((a) => (a.kind === "remove-marketplace" ? [a.name] : [])));
    const names = new Set((await claude.listMarketplaces()).map((m) => m.name).filter((name) => !removing.has(name)));
    for (const a of actions) if (a.kind === "install" && !names.has(marketOf(a.id))) throw missingMarketplace(a.id, names);
  };

  let verified = false;
  for (const action of actions) {
    if (!verified && action.kind !== "add-marketplace" && action.kind !== "adopt-marketplace" && action.kind !== "adopt-plugin") {
      verified = true;
      await verify();
    }
    switch (action.kind) {
      case "adopt-marketplace":
        claim(state.marketplaces, action.name);
        break;
      case "adopt-plugin":
        claim(state.plugins, action.id);
        break;
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
      case "install":
        await claude.install(action.id);
        claim(state.plugins, action.id);
        break;
      case "update":
        await claude.update(action.id);
        break;
    }
    writeState(configDir, state);
  }
}
