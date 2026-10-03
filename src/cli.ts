#!/usr/bin/env bun
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClaude } from "./claude";
import { githubManifests } from "./github";
import { resolveManifest } from "./manifest";
import { apply, plan, pruneState, readState, takeSnapshot, writeState, type Action } from "./sync";

declare const CPM_VERSION: string | undefined;
const VERSION = typeof CPM_VERSION === "string" ? CPM_VERSION : "dev";

const HELP = `cpm - Claude Code の plugin をマニフェストから同期する

使い方:
  cpm sync [--update] [--dry-run] [--manifest <path>]
                                   マニフェストの内容に揃える(追加・削除)
                                   --update: marketplace と plugin を最新に更新する
  cpm list                         cpm が追加した marketplace と plugin を表示する
  cpm --version

マニフェストの既定: $CLAUDE_CONFIG_DIR/cpm.yml (CLAUDE_CONFIG_DIR 未設定なら ~/.claude/cpm.yml)
環境変数 CPM_MANIFEST でも指定できます。`;

function describe(a: Action): string {
  switch (a.kind) {
    case "add-marketplace":
      return `+ marketplace ${a.spec.raw}`;
    case "replace-marketplace":
      return `~ marketplace ${a.spec.repo}  (${a.from ?? "既定ブランチ"} -> ${a.spec.ref ?? "既定ブランチ"})`;
    case "set-auto-update":
      return `~ marketplace ${a.name}  (自動更新: ${a.value ? "ON" : "OFF"})`;
    case "update-marketplace":
      return `~ marketplace ${a.spec.repo}  (最新に更新)`;
    case "remove-marketplace":
      return `- marketplace ${a.name}`;
    case "install":
      return `+ plugin ${a.id}`;
    case "update":
      return `~ plugin ${a.id}  (最新に更新)`;
    case "uninstall":
      return `- plugin ${a.id}`;
  }
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      manifest: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      update: { type: "boolean", default: false },
      version: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.version) {
    console.log(VERSION);
    return 0;
  }
  const [command] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return values.help ? 0 : 1;
  }

  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const manifestPath = values.manifest ?? process.env.CPM_MANIFEST ?? join(configDir, "cpm.yml");
  const claude = createClaude(configDir);

  if (command === "list") {
    const state = pruneState(readState(configDir), await takeSnapshot(claude));
    for (const name of state.marketplaces) console.log(`marketplace ${name}`);
    for (const id of state.plugins) console.log(`plugin ${id}`);
    return 0;
  }

  if (command === "sync") {
    const desired = await resolveManifest(manifestPath, githubManifests);
    const snap = await takeSnapshot(claude);
    const stored = readState(configDir);
    const state = pruneState(stored, snap);
    const actions = plan(desired, snap, state, { update: values.update });
    for (const a of actions) console.log(describe(a));

    if (values["dry-run"]) {
      console.log(actions.length ? `\n${actions.length} 件の変更があります(dry-run のため未適用)` : "\n変更はありません");
      return 0;
    }
    if (actions.length) {
      await apply(actions, { claude, configDir, state, autoUpdate: desired.autoUpdate });
    } else if (JSON.stringify(stored) !== JSON.stringify(state)) {
      writeState(configDir, state);
    }
    console.log(actions.length ? `\n${actions.length} 件を適用しました` : "\n変更はありません");
    return 0;
  }

  console.error(`不明なコマンド: ${command}\n\n${HELP}`);
  return 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
