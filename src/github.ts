import type { ManifestSource } from "./manifest";
import type { IncludeSpec } from "./spec";

const API = "https://api.github.com";

let cachedToken: string | null | undefined;

/** GITHUB_TOKEN / GH_TOKEN、無ければ `gh auth token` */
function token(): string | null {
  if (cachedToken !== undefined) return cachedToken;
  const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (fromEnv) return (cachedToken = fromEnv);
  try {
    const out = Bun.spawnSync(["gh", "auth", "token"], { stderr: "ignore" });
    const value = out.exitCode === 0 ? out.stdout.toString().trim() : "";
    return (cachedToken = value || null);
  } catch {
    return (cachedToken = null);
  }
}

/** 外部リポジトリのマニフェストを GitHub API で読む */
export const githubManifests: ManifestSource = {
  async readFile(include: IncludeSpec) {
    const query = include.ref ? `?ref=${encodeURIComponent(include.ref)}` : "";
    const url = `${API}/repos/${include.owner}/${include.repo}/contents/${include.file}${query}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.raw+json",
      "User-Agent": "cpm",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const hint = res.status === 404 ? "(ファイルまたは ref が存在しないか、権限がありません)" : "";
      throw new Error(`"${include.raw}": GitHub API が ${res.status} を返しました ${hint}`.trim());
    }
    return res.text();
  },
};
