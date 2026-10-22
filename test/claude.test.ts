import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClaude } from "../src/claude";

let dir: string;
let path: string | undefined;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cpm-claude-"));
  path = process.env.PATH;
});
afterEach(() => {
  process.env.PATH = path;
  rmSync(dir, { recursive: true, force: true });
});

test("claude には指定した Claude のディレクトリを CLAUDE_CONFIG_DIR で渡す", async () => {
  // 受け取った CLAUDE_CONFIG_DIR を marketplace 名として返す偽の claude
  writeFileSync(join(dir, "claude"), `#!/bin/sh\necho "[{\\"name\\":\\"$CLAUDE_CONFIG_DIR\\",\\"source\\":\\"github\\"}]"\n`);
  chmodSync(join(dir, "claude"), 0o755);
  process.env.PATH = `${dir}:${path}`;
  expect(await createClaude("/custom/dir").listMarketplaces()).toEqual([{ name: "/custom/dir", source: "github" }]);
});

const fakeClaude = (body: string) => {
  writeFileSync(join(dir, "claude"), `#!/bin/sh\n${body}\n`);
  chmodSync(join(dir, "claude"), 0o755);
  process.env.PATH = `${dir}:${path}`;
};

test("plugin update の --json から更新結果を読む", async () => {
  fakeClaude(
    `echo '{"command":"update","outcome":"ok","updateOutcome":"updated","oldVersion":"1.0.0","newVersion":"1.1.0"}'`,
  );
  expect(await createClaude(dir).update("a@mk")).toMatchObject({ updateOutcome: "updated", oldVersion: "1.0.0", newVersion: "1.1.0" });
});

test("plugin update の出力が JSON でなければ結果なしとして扱う", async () => {
  fakeClaude("echo 'not json'");
  expect(await createClaude(dir).update("a@mk")).toEqual({});
});
