import { readFileSync } from "node:fs";
import { extname } from "node:path";
import {
  parseInclude,
  parseMarketplace,
  parsePlugin,
  repoKey,
  type IncludeSpec,
  type MarketplaceSpec,
  type PluginSpec,
} from "./spec";

const includeKey = (inc: IncludeSpec): string => `${repoKey(inc.host, inc.owner, inc.repo)}/${inc.file}`;

/** includes の入れ子の深さの上限 */
const MAX_DEPTH = 5;

/** 外部マニフェストのファイルを読む。本番は GitHub / GitHub Enterprise、テストでは差し替える */
export interface ManifestSource {
  readFile(include: IncludeSpec): Promise<string>;
}

interface RawManifest {
  includes: string[];
  marketplaces: string[];
  plugins: string[];
  /** includes で取り込んだ plugin のうち、入れない plugin */
  exclude: string[];
  autoUpdate?: boolean;
}

export interface Desired {
  marketplaces: MarketplaceSpec[];
  plugins: PluginSpec[];
  /**
   * 管理下の marketplace の自動更新。省略時(undefined)は、新しく追加する marketplace だけを ON にし、
   * 既にある marketplace の設定には触れない
   */
  autoUpdate: boolean | undefined;
}

/** `.json` は JSON、それ以外は YAML として読む */
export function parseManifest(text: string, file: string): RawManifest {
  let doc: Record<string, unknown> | null;
  try {
    doc = extname(file) === ".json" ? JSON.parse(text) : Bun.YAML.parse(text);
  } catch (err) {
    throw new Error(`${file}: 解析できません: ${err instanceof Error ? err.message : String(err)}`);
  }

  const list = (key: keyof RawManifest): string[] => {
    const value = doc?.[key] ?? [];
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      throw new Error(`${file}: ${key} は文字列のリストで指定してください`);
    }
    return value as string[];
  };
  const autoUpdate = doc?.autoUpdate;
  if (autoUpdate !== undefined && typeof autoUpdate !== "boolean") {
    throw new Error(`${file}: autoUpdate は true か false で指定してください`);
  }
  return { includes: list("includes"), marketplaces: list("marketplaces"), plugins: list("plugins"), exclude: list("exclude"), autoUpdate };
}

interface Entry<T> {
  spec: T;
  /** どのマニフェストに書かれていたか(エラー表示用) */
  origin: string;
}

interface Merged {
  /** owner/repo -> marketplace */
  marketplaces: Map<string, Entry<MarketplaceSpec>>;
  /** plugin@marketplace -> plugin */
  plugins: Map<string, Entry<PluginSpec>>;
}

/**
 * マニフェスト(ローカルのファイル、または GitHub 上のファイル)を読み、includes で参照された外部マニフェストを再帰的に取り込んで、
 * あるべき marketplace と plugin の一覧にする。
 *
 * - マニフェスト自身の marketplaces は、その includes から来た同じリポジトリの指定を上書きする。
 * - 別々の includes が、同じリポジトリを異なる ref で指定するときはエラーにする。
 * - exclude に書いた plugin は、取り込んだ includes からも外す。
 */
export async function resolveManifest(root: string | IncludeSpec, source: ManifestSource): Promise<Desired> {
  const path = typeof root === "string" ? root : root.raw;
  let text: string;
  if (typeof root === "string") {
    try {
      text = readFileSync(root, "utf8");
    } catch {
      throw new Error(`マニフェストを読み込めません: ${root}`);
    }
  } else {
    text = await source.readFile(root);
  }

  async function load(body: string, file: string, trail: string[]): Promise<Merged> {
    const manifest = parseManifest(body, file);
    const merged: Merged = { marketplaces: new Map(), plugins: new Map() };

    for (const raw of manifest.includes) {
      const inc = parseInclude(raw);
      const key = includeKey(inc);
      if (trail.includes(key)) throw new Error(`includes が循環しています: ${[...trail, key].join(" -> ")}`);
      if (trail.length >= MAX_DEPTH) throw new Error(`includes の入れ子が ${MAX_DEPTH} 段を超えています: ${raw}`);

      const child = await load(await source.readFile(inc), inc.raw, [...trail, key]);
      for (const [repo, entry] of child.marketplaces) {
        const prev = merged.marketplaces.get(repo);
        if (prev && prev.spec.raw !== entry.spec.raw) {
          throw new Error(
            `${prev.origin} の "${prev.spec.raw}" と ${entry.origin} の "${entry.spec.raw}" が、同じリポジトリを異なる ref で指定しています`,
          );
        }
        merged.marketplaces.set(repo, entry);
      }
      for (const [id, entry] of child.plugins) merged.plugins.set(id, entry);
    }

    const ownRepos = new Set<string>();
    for (const raw of manifest.marketplaces) {
      const spec = parseMarketplace(raw);
      if (ownRepos.has(spec.repo)) throw new Error(`${file} に同じリポジトリ "${spec.repo}" の指定が複数あります`);
      ownRepos.add(spec.repo);
      merged.marketplaces.set(spec.repo, { spec, origin: file });
    }
    for (const raw of manifest.plugins) {
      const spec = parsePlugin(raw);
      merged.plugins.set(spec.raw, { spec, origin: file });
    }
    for (const raw of manifest.exclude) {
      const { raw: id } = parsePlugin(raw);
      if (manifest.plugins.some((p) => parsePlugin(p).raw === id)) {
        throw new Error(`${file}: "${id}" が plugins と exclude の両方に指定されています`);
      }
      merged.plugins.delete(id);
    }
    return merged;
  }

  const merged = await load(text, path, typeof root === "string" ? [] : [includeKey(root)]);
  return {
    marketplaces: [...merged.marketplaces.values()].map((e) => e.spec),
    plugins: [...merged.plugins.values()].map((e) => e.spec),
    // 自動更新は、取り込んだマニフェストではなく、自分のマニフェストで決める
    autoUpdate: parseManifest(text, path).autoUpdate,
  };
}
