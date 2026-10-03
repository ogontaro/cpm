#!/usr/bin/env bun
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { createClaude } from "./claude";
import { githubManifests } from "./github";
import { renderManifest } from "./init";
import { resolveManifest } from "./manifest";
import pkg from "../package.json";
import { apply, findUnmanaged, plan, pruneState, readState, takeSnapshot, writeState, type Action } from "./sync";

const VERSION = pkg.version;

const HELP = `cpm - Claude Code の plugin をマニフェストから同期する

使い方:
  cpm init [--manifest <path>]     今の環境からマニフェストを作る(既にあれば作らない)
  cpm sync [--update] [--dry-run | --check] [--manifest <path>]
                                   マニフェストの内容に揃える(追加・削除)
                                   --update: marketplace と plugin を最新に更新する
                                   --check:  変更を表示するだけで、差分があれば終了コード 1 にする(CI 向け)
  cpm list                         cpm の管理下と管理外の marketplace・plugin を表示する
  cpm --version

マニフェストの既定: $CLAUDE_CONFIG_DIR/cpm.yml (CLAUDE_CONFIG_DIR 未設定なら ~/.claude/cpm.yml)
環境変数 CPM_MANIFEST でも指定できます。`;

const manualNote = (ids: string[]): string => (ids.length ? `  (手動で入れた ${ids.join(", ")} も外れます)` : "");

function describe(a: Action): string {
  switch (a.kind) {
    case "add-marketplace":
      return `+ marketplace ${a.spec.raw}`;
    case "replace-marketplace":
      return `~ marketplace ${a.spec.repo}  (${a.from ?? "既定ブランチ"} -> ${a.spec.ref ?? "既定ブランチ"})` + manualNote(a.manualPlugins);
    case "set-auto-update":
      return `~ marketplace ${a.name}  (自動更新: ${a.value ? "ON" : "OFF"})`;
    case "update-marketplace":
      return `~ marketplace ${a.spec.repo}  (最新に更新)`;
    case "remove-marketplace":
      return `- marketplace ${a.name}` + manualNote(a.manualPlugins);
    case "adopt-marketplace":
      return `= marketplace ${a.name}  (cpm の管理下に入れる)`;
    case "adopt-plugin":
      return `= plugin ${a.id}  (cpm の管理下に入れる)`;
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
      check: { type: "boolean", default: false },
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

  if (command === "init") {
    if (![".yml", ".yaml"].includes(extname(manifestPath))) {
      console.error(`init が作れるのは YAML(.yml / .yaml)のマニフェストだけです: ${manifestPath}`);
      return 1;
    }
    if (existsSync(manifestPath)) {
      console.error(`マニフェストが既にあります: ${manifestPath}`);
      return 1;
    }
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, renderManifest(await takeSnapshot(claude)));
    console.log(`マニフェストを作りました: ${manifestPath}\n内容を確認して、cpm sync --dry-run で変更内容を確かめてください`);
    return 0;
  }

  if (command === "list") {
    const snap = await takeSnapshot(claude);
    const state = pruneState(readState(configDir), snap);
    for (const name of state.marketplaces) console.log(`marketplace ${name}`);
    for (const id of state.plugins) console.log(`plugin ${id}`);
    const unmanaged = findUnmanaged(snap, state);
    for (const name of unmanaged.marketplaces) console.log(`marketplace ${name}  (管理外)`);
    for (const id of unmanaged.plugins) console.log(`plugin ${id}  (管理外)`);
    return 0;
  }

  if (command === "sync") {
    const desired = await resolveManifest(manifestPath, githubManifests);
    const snap = await takeSnapshot(claude);
    const stored = readState(configDir);
    const state = pruneState(stored, snap);
    if (values.check && values.update) throw new Error("--check と --update は同時に指定できません");
    const actions = plan(desired, snap, state, { update: values.update });
    for (const a of actions) console.log(describe(a));

    if (values["dry-run"] || values.check) {
      console.log(actions.length ? `\n${actions.length} 件の変更があります(未適用)` : "\n変更はありません");
      // 管理下への取り込みは記録だけの変更で、環境はマニフェストどおりになっている
      const drift = actions.some((a) => a.kind !== "adopt-marketplace" && a.kind !== "adopt-plugin");
      return values.check && drift ? 1 : 0;
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
