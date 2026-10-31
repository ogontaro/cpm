import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApprove, lockedCommit, readLock, realGit, renderReview, writeLock } from "../src/lock";
import { parseMarketplace } from "../src/spec";

describe("realGit.settled", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cpm-settled-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const git = (cwd: string, args: string[], date?: string): string => {
    const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
    if (date) Object.assign(env, { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    const proc = Bun.spawnSync(["git", "-C", cwd, ...args], { env });
    if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
    return proc.stdout.toString().trim();
  };

  /** 30・20・10・1 日前の 4 コミットを持つリポジトリを作り、depth 1 でクローンする。コミットは古い順 */
  function setup(): { clone: string; commits: string[] } {
    const origin = join(dir, "origin");
    git(dir, ["init", "--quiet", origin]);
    const commits = [30, 20, 10, 1].map((days) => {
      const date = `${Math.floor(Date.now() / 1000) - days * 86400} +0000`;
      git(origin, ["commit", "--quiet", "--allow-empty", "-m", `${days}d`], date);
      return git(origin, ["rev-parse", "HEAD"]);
    });
    const clone = join(dir, "clone");
    git(dir, ["clone", "--quiet", "--depth", "1", `file://${origin}`, clone]);
    return { clone, commits };
  }

  test("経過日数を過ぎた最新のコミットを返す", async () => {
    const { clone, commits } = setup();
    expect(await realGit.settled(clone, 7, commits[0]!)).toBe(commits[2]!);
  });

  test("HEAD が経過日数を過ぎていれば HEAD を返す", async () => {
    const { clone, commits } = setup();
    expect(await realGit.settled(clone, 0.5, commits[0]!)).toBe(commits[3]!);
  });

  test("lock のコミットより新しいものが無ければ null", async () => {
    const { clone, commits } = setup();
    expect(await realGit.settled(clone, 7, commits[2]!)).toBeNull();
    expect(await realGit.settled(clone, 7, commits[3]!)).toBeNull();
  });

  test("経過日数を過ぎたコミットが履歴に無ければ null", async () => {
    const { clone, commits } = setup();
    expect(await realGit.settled(clone, 60, commits[0]!)).toBeNull();
  });
});

describe("lock ファイル", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cpm-lock-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("書いたものを読み戻せる。無ければ空", () => {
    expect(readLock(dir)).toEqual({});
    writeLock(dir, { "o/mk": { ref: "v1", commit: "abc" } });
    expect(readLock(dir)).toEqual({ "o/mk": { ref: "v1", commit: "abc" } });
  });

  test("ref が cpm.yml と同じときだけ、固定したコミットを返す", () => {
    const lock = { "o/mk": { ref: "v1", commit: "abc" } };
    expect(lockedCommit(lock, parseMarketplace("o/mk#v1"))).toBe("abc");
    expect(lockedCommit(lock, parseMarketplace("o/mk#v2"))).toBeNull();
    expect(lockedCommit(lock, parseMarketplace("o/other"))).toBeNull();
  });
});

describe("renderReview", () => {
  test("実行に関わるファイルを全件、そのほかは件数で示す", () => {
    const text = renderReview("o/mk", "1111111aaa", "2222222bbb", ["M\thooks/hooks.json", "A\tplug/.mcp.json", "A\tbin/run.sh", "M\tREADME.md"]);
    expect(text).toContain("o/mk  1111111 -> 2222222");
    expect(text).toContain("hooks/hooks.json");
    expect(text).toContain("bin/run.sh");
    expect(text).not.toContain("README.md");
    expect(text).toContain("変更ファイル 4 件のうち、hooks・MCP・スクリプトが 3 件");
  });

  test("実行に関わるファイルが多いときは、先頭 10 件だけ並べる", () => {
    const changes = Array.from({ length: 12 }, (_, i) => `A\thooks/h${i}.sh`);
    const text = renderReview("o/mk", null, "2222222bbb", changes);
    expect(text).toContain("hooks/h9.sh");
    expect(text).not.toContain("hooks/h10.sh");
    expect(text).toContain("ほか 2 件");
  });

  test("新規の固定は、from が無い表示にする", () => {
    expect(renderReview("o/mk", null, "2222222bbb", ["A\ta.md"])).toContain("2222222 を固定(新規)");
  });
});

describe("createApprove", () => {
  test("--yes なら、内容を表示して承認する", async () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    expect(await createApprove(true)("内容")).toBe(true);
    expect(log).toHaveBeenCalledWith("内容");
    log.mockRestore();
  });

  test("--yes が無く、対話できない環境では停止する", async () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    const tty = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      await expect(createApprove(false)("内容")).rejects.toThrow("--yes");
    } finally {
      process.stdin.isTTY = tty;
      log.mockRestore();
    }
  });
});
