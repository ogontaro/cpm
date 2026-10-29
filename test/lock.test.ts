import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApprove, lockedCommit, readLock, renderReview, writeLock } from "../src/lock";
import { parseMarketplace } from "../src/spec";

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
