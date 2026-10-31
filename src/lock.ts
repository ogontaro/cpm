import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MarketplaceSpec } from "./spec";

/** ロックファイル(Claude のディレクトリ直下)。marketplace ごとのコミットを記録する。マシン共通なので Git で共有する */
export const LOCK_FILE = "cpm.lock";

/** リポジトリの識別子 -> 固定したコミット */
export type Lock = Record<string, { ref: string | null; commit: string }>;

export function readLock(claudeDir: string): Lock {
  try {
    return JSON.parse(readFileSync(join(claudeDir, LOCK_FILE), "utf8")) as Lock;
  } catch {
    return {};
  }
}

export function writeLock(claudeDir: string, lock: Lock): void {
  mkdirSync(claudeDir, { recursive: true });
  const file = join(claudeDir, LOCK_FILE);
  writeFileSync(`${file}.tmp`, JSON.stringify(lock, null, 2) + "\n");
  renameSync(`${file}.tmp`, file);
}

/** cpm.yml の指定(ref)と一致する、ロック済みのコミット。無ければ null */
export function lockedCommit(lock: Lock, spec: MarketplaceSpec): string | null {
  const entry = lock[spec.repo];
  return entry && entry.ref === spec.ref ? entry.commit : null;
}

/** marketplace の checkout に対する git 操作。テストでは差し替える */
export interface Git {
  /** HEAD のコミット(40 桁) */
  head(dir: string): Promise<string>;
  /** 指定のコミットを checkout する。checkout は shallow なので、手元に無ければ取得する */
  checkout(dir: string, commit: string): Promise<void>;
  /** from から to への変更ファイル(`A\tpath` の形)。from が null なら to の全ファイル */
  changes(dir: string, from: string | null, to: string): Promise<string[]>;
  /** locked より新しく、days 日以上前にコミットされた最新のコミット。HEAD が該当すれば HEAD。無ければ null */
  settled(dir: string, days: number, locked: string): Promise<string | null>;
}

async function git(dir: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`git ${args.join(" ")} に失敗しました: ${err.trim().split("\n").at(-1) ?? `終了コード ${code}`}`);
  return out.trim();
}

async function ensure(dir: string, commit: string): Promise<void> {
  try {
    await git(dir, ["cat-file", "-e", `${commit}^{commit}`]);
  } catch {
    await git(dir, ["fetch", "--depth", "1", "origin", commit]);
  }
}

export const realGit: Git = {
  head: (dir) => git(dir, ["rev-parse", "HEAD"]),
  async checkout(dir, commit) {
    await ensure(dir, commit);
    await git(dir, ["checkout", "--quiet", "--detach", commit]);
  },
  async changes(dir, from, to) {
    await ensure(dir, to);
    if (from === null) return (await git(dir, ["ls-tree", "-r", "--name-only", to])).split("\n").map((p) => `A\t${p}`);
    await ensure(dir, from);
    return (await git(dir, ["diff", "--name-status", from, to])).split("\n").filter(Boolean);
  },
  async settled(dir, days, locked) {
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    const committedAt = async (rev: string) => Number(await git(dir, ["log", "-1", "--format=%ct", rev]));
    let candidate = await git(dir, ["rev-parse", "HEAD"]);
    if ((await committedAt(candidate)) > cutoff) {
      // checkout は shallow なので、cutoff 以降の履歴を取り、その最古のコミットの親を「cutoff より前の最新」とする
      await git(dir, ["fetch", "--quiet", `--shallow-since=${cutoff}`, "origin", candidate]);
      const oldest = (await git(dir, ["rev-list", "--first-parent", candidate])).split("\n").at(-1)!;
      const parent = /^parent (\S+)$/m.exec(await git(dir, ["cat-file", "-p", oldest]))?.[1];
      if (!parent) return null;
      await ensure(dir, parent);
      if ((await committedAt(parent)) > cutoff) return null;
      candidate = parent;
    }
    await ensure(dir, locked);
    return candidate !== locked && (await committedAt(candidate)) > (await committedAt(locked)) ? candidate : null;
  },
};

/** plugin が hooks・MCP サーバー・スクリプトを持ち込む、実行に関わるファイル */
const SENSITIVE = /(^|\/)(hooks\/|hooks\.json$|\.mcp\.json$|plugin\.json$)|\.(sh|bash|zsh)$/;

/** 承認を求める内容に並べる、実行に関わるファイルの上限 */
const MAX_LISTED = 10;

/** 承認を求める内容。hooks・MCP・スクリプトのファイルを先頭から並べ、そのほかは件数だけ表示する */
export function renderReview(repo: string, from: string | null, to: string, changes: string[]): string {
  const sensitive = changes.filter((line) => SENSITIVE.test(line.split("\t").at(-1)!));
  const header = from ? `${repo}  ${from.slice(0, 7)} -> ${to.slice(0, 7)}` : `${repo}  ${to.slice(0, 7)} を固定(新規)`;
  const rest = sensitive.length - MAX_LISTED;
  return [
    header,
    `  変更ファイル ${changes.length} 件のうち、hooks・MCP・スクリプトが ${sensitive.length} 件`,
    ...sensitive.slice(0, MAX_LISTED).map((line) => `    ${line.replace("\t", "  ")}`),
    ...(rest > 0 ? [`    ほか ${rest} 件`] : []),
  ].join("\n");
}

/** 内容を表示して承認を求める。--yes なら表示だけして承認、対話できない環境では停止する */
export function createApprove(yes: boolean): (review: string) => Promise<boolean> {
  return async (review) => {
    console.log(review);
    if (yes) return true;
    if (!process.stdin.isTTY) throw new Error("承認するには対話できる端末が必要です。内容を確認したうえで --yes を付けてください");
    return prompt("承認しますか? [y/N]")?.trim().toLowerCase() === "y";
  };
}
