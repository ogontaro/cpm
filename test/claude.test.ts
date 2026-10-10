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

test("claude には指定した config ディレクトリを CLAUDE_CONFIG_DIR で渡す", async () => {
  // 受け取った CLAUDE_CONFIG_DIR を marketplace 名として返す偽の claude
  writeFileSync(join(dir, "claude"), `#!/bin/sh\necho "[{\\"name\\":\\"$CLAUDE_CONFIG_DIR\\",\\"source\\":\\"github\\"}]"\n`);
  chmodSync(join(dir, "claude"), 0o755);
  process.env.PATH = `${dir}:${path}`;
  expect(await createClaude("/custom/dir").listMarketplaces()).toEqual([{ name: "/custom/dir", source: "github" }]);
});
