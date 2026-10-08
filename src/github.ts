import type { ManifestSource } from "./manifest";
import { GITHUB_HOST, type IncludeSpec } from "./spec";

const tokens = new Map<string, string | null>();

/** github.com は GITHUB_TOKEN / GH_TOKEN、GitHub Enterprise は GH_ENTERPRISE_TOKEN / GITHUB_ENTERPRISE_TOKEN。無ければ `gh auth token` */
function token(host: string): string | null {
  const cached = tokens.get(host);
  if (cached !== undefined) return cached;
  const fromEnv =
    host === GITHUB_HOST
      ? process.env.GITHUB_TOKEN || process.env.GH_TOKEN
      : process.env.GH_ENTERPRISE_TOKEN || process.env.GITHUB_ENTERPRISE_TOKEN;
  let value = fromEnv || null;
  if (!value) {
    try {
      const out = Bun.spawnSync(["gh", "auth", "token", "--hostname", host], { stderr: "ignore" });
      value = out.exitCode === 0 ? out.stdout.toString().trim() || null : null;
    } catch {
      value = null;
    }
  }
  tokens.set(host, value);
  return value;
}

const apiBase = (host: string): string => (host === GITHUB_HOST ? "https://api.github.com" : `https://${host}/api/v3`);

/** 外部リポジトリのマニフェストを GitHub API(GitHub Enterprise は /api/v3)で読む */
export const githubManifests: ManifestSource = {
  async readFile(include: IncludeSpec) {
    const query = include.ref ? `?ref=${encodeURIComponent(include.ref)}` : "";
    const url = `${apiBase(include.host)}/repos/${include.owner}/${include.repo}/contents/${include.file}${query}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.raw+json",
      "User-Agent": "cpm",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const t = token(include.host);
    if (t) headers.Authorization = `Bearer ${t}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const hint = res.status === 404 ? "(ファイルまたは ref が存在しないか、権限がありません)" : "";
      throw new Error(`"${include.raw}": GitHub API が ${res.status} を返しました ${hint}`.trim());
    }
    return res.text();
  },
};
