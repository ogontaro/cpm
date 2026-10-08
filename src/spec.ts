export const GITHUB_HOST = "github.com";

/** GitHub(github.com または GitHub Enterprise)上の取得先。ref が null なら既定ブランチ */
export interface Ref {
  /** マニフェストに書かれた文字列そのまま */
  raw: string;
  host: string;
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
  /** リポジトリの識別子。github.com は owner/repo、GitHub Enterprise は host/owner/repo */
  repo: string;
  ref: string | null;
  /** `claude plugin marketplace add` に渡す文字列 */
  target: string;
}

/** リポジトリの識別子。github.com は host を省く */
export function repoKey(host: string, owner: string, repo: string): string {
  return host === GITHUB_HOST ? `${owner}/${repo}` : `${host}/${owner}/${repo}`;
}

/** `plugin@marketplace` */
export interface PluginSpec {
  raw: string;
  name: string;
  marketplace: string;
}

const MANIFEST_FILE = /\.(ya?ml|json)$/;
const PLUGIN_ID = /^([A-Za-z0-9][A-Za-z0-9._-]*)@([A-Za-z0-9][A-Za-z0-9._-]*)$/;

/** `[host/]owner/repo[/path][#ref]` を分解する。先頭が `.` を含めば host(owner 名に `.` は使えない) */
function split(raw: string): { host: string; owner: string; repo: string; pathParts: string[]; ref: string | null } {
  const fail = (reason: string): never => {
    throw new Error(`"${raw}": ${reason}`);
  };

  const [source = "", ...refParts] = raw.trim().split("#");
  if (refParts.length > 1) fail("# は 1 つだけ指定できます");
  const ref = refParts[0] ?? null;
  if (ref === "") fail("# の後に ref を指定してください");

  const parts = source.split("/").filter(Boolean);
  const host = parts[0]?.includes(".") ? parts.shift()! : GITHUB_HOST;
  const [owner, repo, ...pathParts] = parts;
  if (!owner || !repo) fail("[host/]owner/repo[#ref] の形式で指定してください");
  if (pathParts.some((p) => p === "." || p === "..")) fail("path に . や .. は使えません");
  return { host, owner: owner!, repo: repo!, pathParts, ref };
}

/** `[host/]owner/repo[#ref]` を解釈する。host は GitHub Enterprise のホスト名 */
export function parseMarketplace(raw: string): MarketplaceSpec {
  const { host, owner, repo, pathParts, ref } = split(raw);
  if (pathParts.length > 0) throw new Error(`"${raw}": [host/]owner/repo[#ref] の形式で指定してください`);
  const suffix = ref ? `#${ref}` : "";
  const target = host === GITHUB_HOST ? raw : `https://${host}/${owner}/${repo}.git${suffix}`;
  return { raw, repo: repoKey(host, owner, repo), ref, target };
}

/**
 * git の URL(`https://host/owner/repo[.git]` / `git@host:owner/repo[.git]`)から、リポジトリの識別子を取り出す。
 * GitHub のリポジトリでなければ null
 */
export function repoKeyFromUrl(url: string): string | null {
  const match = /^(?:https?:\/\/(?:[^@/]+@)?|(?:ssh:\/\/)?git@)([^/:]+)[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match ? repoKey(match[1]!, match[2]!, match[3]!) : null;
}

/** `plugin@marketplace` を解釈する */
export function parsePlugin(raw: string): PluginSpec {
  const match = PLUGIN_ID.exec(raw.trim());
  if (!match) throw new Error(`"${raw}": plugin@marketplace の形式で指定してください`);
  return { raw: raw.trim(), name: match[1]!, marketplace: match[2]! };
}

/** `[host/]owner/repo/path/to/cpm.yml[#ref]` を解釈する。拡張子は .yml / .yaml / .json */
export function parseInclude(raw: string): IncludeSpec {
  const { host, owner, repo, pathParts, ref } = split(raw);
  const file = pathParts.join("/");
  if (!MANIFEST_FILE.test(file)) {
    throw new Error(`"${raw}": [host/]owner/repo/path/to/cpm.yml[#ref] の形式で指定してください(拡張子は .yml / .yaml / .json)`);
  }
  return { raw, host, owner, repo, ref, file };
}
