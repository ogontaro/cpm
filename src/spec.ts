/** GitHub 上の取得先。ref が null なら既定ブランチ */
export interface Ref {
  /** マニフェストに書かれた文字列そのまま */
  raw: string;
  owner: string;
  repo: string;
  ref: string | null;
}

/** 外部リポジトリにあるマニフェストファイル */
export interface IncludeSpec extends Ref {
  /** リポジトリ内のファイルパス */
  file: string;
}

/** `claude plugin marketplace add` で登録する GitHub リポジトリ */
export interface MarketplaceSpec {
  raw: string;
  /** owner/repo */
  repo: string;
  ref: string | null;
}

/** `plugin@marketplace` */
export interface PluginSpec {
  raw: string;
  name: string;
  marketplace: string;
}

const MANIFEST_FILE = /\.(ya?ml|json)$/;
const PLUGIN_ID = /^([A-Za-z0-9][A-Za-z0-9._-]*)@([A-Za-z0-9][A-Za-z0-9._-]*)$/;

/** `owner/repo[/path][#ref]` を分解する */
function split(raw: string): { owner: string; repo: string; pathParts: string[]; ref: string | null } {
  const fail = (reason: string): never => {
    throw new Error(`"${raw}": ${reason}`);
  };

  const [source = "", ...refParts] = raw.trim().split("#");
  if (refParts.length > 1) fail("# は 1 つだけ指定できます");
  const ref = refParts[0] ?? null;
  if (ref === "") fail("# の後に ref を指定してください");

  const [owner, repo, ...pathParts] = source.split("/").filter(Boolean);
  if (!owner || !repo) fail("owner/repo[#ref] の形式で指定してください");
  if (pathParts.some((p) => p === "." || p === "..")) fail("path に . や .. は使えません");
  return { owner: owner!, repo: repo!, pathParts, ref };
}

/** `owner/repo[#ref]` を解釈する */
export function parseMarketplace(raw: string): MarketplaceSpec {
  const { owner, repo, pathParts, ref } = split(raw);
  if (pathParts.length > 0) throw new Error(`"${raw}": owner/repo[#ref] の形式で指定してください`);
  return { raw, repo: `${owner}/${repo}`, ref };
}

/** `plugin@marketplace` を解釈する */
export function parsePlugin(raw: string): PluginSpec {
  const match = PLUGIN_ID.exec(raw.trim());
  if (!match) throw new Error(`"${raw}": plugin@marketplace の形式で指定してください`);
  return { raw: raw.trim(), name: match[1]!, marketplace: match[2]! };
}

/** `owner/repo/path/to/cpm.yml[#ref]` を解釈する。拡張子は .yml / .yaml / .json */
export function parseInclude(raw: string): IncludeSpec {
  const { owner, repo, pathParts, ref } = split(raw);
  const file = pathParts.join("/");
  if (!MANIFEST_FILE.test(file)) {
    throw new Error(`"${raw}": owner/repo/path/to/cpm.yml[#ref] の形式で指定してください(拡張子は .yml / .yaml / .json)`);
  }
  return { raw, owner, repo, ref, file };
}
