#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { createClaude, type Claude } from "./claude";
import { githubManifests } from "./github";
import { renderManifest } from "./init";
import { addToManifest, removeFromManifest, resolveManifest } from "./manifest";
import { parseInclude, parseMarketplace, parsePlugin } from "./spec";
import pkg from "../package.json";
import { apply, findUnmanaged, marketplaceRepo, plan, planUninstall, pruneState, readState, takeSnapshot, writeState, type Action, type State } from "./sync";

const VERSION = pkg.version;

const HELP = `cpm - Claude Code の plugin を cpm.yml から同期する

使い方:
  cpm init                         今の環境から cpm.yml を作る(既にあれば作らない)
  cpm install [--dry-run | --check | --remote <repo>]
                                   cpm.yml の内容に揃える(追加・削除)
                                   --remote: クローンせず、GitHub 上の cpm.yml を直接読む
                                             [host/]owner/repo/path/to/cpm.yml[#ref] (host は GitHub Enterprise)
                                   --check:  変更を表示するだけで、差分があれば終了コード 1 にする(CI 向け)
  cpm update [--dry-run]           cpm.yml の内容に揃えつつ、marketplace と plugin を最新に更新する
  cpm add <plugin>@<marketplace>   cpm.yml に plugin を追記してインストールする
                                   <marketplace> は登録済みの名前、または [host/]owner/repo[#ref](未登録なら登録して marketplaces にも追記)
  cpm uninstall <plugin>@<marketplace> [--dry-run]
                                   plugin を 1 つ削除する(cpm list に出る ID を指定。管理外の plugin も削除できる)
                                   その marketplace に他の plugin が残らず、cpm の管理下なら marketplace も削除する
                                   cpm.yml(YAML)に書かれていれば、その行も消す
  cpm cleanup [--dry-run]          cpm の管理下の marketplace・plugin をすべて削除する(管理外には触れない)
  cpm list                         cpm の管理下と管理外の marketplace・plugin を表示する(plugin の ID は uninstall に使える)
  cpm --version

共通オプション:
  --claude-dir <path>              操作する Claude のディレクトリ(既定: $CLAUDE_CONFIG_DIR、未設定なら ~/.claude)
                                   cpm.yml と .cpm-state.json もこのディレクトリに置かれる`;

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

interface Context {
  claude: Claude;
  configDir: string;
  manifestPath: string;
  dryRun: boolean;
  check: boolean;
  remote: string | undefined;
}

const isYaml = (path: string): boolean => [".yml", ".yaml"].includes(extname(path));

async function init({ claude, manifestPath }: Context): Promise<number> {
  if (!isYaml(manifestPath)) {
    console.error(`init が作れるのは YAML(.yml / .yaml)の cpm.yml だけです: ${manifestPath}`);
    return 1;
  }
  if (existsSync(manifestPath)) {
    console.error(`cpm.yml が既にあります: ${manifestPath}`);
    return 1;
  }
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, renderManifest(await takeSnapshot(claude)));
  console.log(`cpm.yml を作りました: ${manifestPath}\n内容を確認して、cpm install --dry-run で変更内容を確かめてください`);
  return 0;
}

async function list({ claude, configDir }: Context): Promise<number> {
  const snap = await takeSnapshot(claude);
  const state = pruneState(readState(configDir), snap);
  for (const name of state.marketplaces) console.log(`marketplace ${name}`);
  for (const id of state.plugins) console.log(`plugin ${id}`);
  const unmanaged = findUnmanaged(snap, state);
  for (const name of unmanaged.marketplaces) console.log(`marketplace ${name}  (管理外)`);
  for (const id of unmanaged.plugins) console.log(`plugin ${id}  (管理外)`);
  return 0;
}

/** 操作を適用する。操作が無くても、記録から消えたものがあれば記録を更新する */
async function applyActions(ctx: Context, actions: Action[], stored: State, state: State, autoUpdate: boolean | undefined): Promise<void> {
  const { claude, configDir } = ctx;
  if (actions.length) {
    await apply(actions, { claude, configDir, state, autoUpdate });
  } else if (JSON.stringify(stored) !== JSON.stringify(state)) {
    writeState(configDir, state);
  }
}

async function install(ctx: Context, update: boolean): Promise<number> {
  const desired = await resolveManifest(ctx.remote ? parseInclude(ctx.remote) : ctx.manifestPath, githubManifests);
  const snap = await takeSnapshot(ctx.claude);
  const stored = readState(ctx.configDir);
  const state = pruneState(stored, snap);
  const actions = plan(desired, snap, state, { update });
  for (const a of actions) console.log(describe(a));

  if (ctx.dryRun || ctx.check) {
    console.log(actions.length ? `\n${actions.length} 件の変更があります(未適用)` : "\n変更はありません");
    // 管理下への取り込みは記録だけの変更で、環境は cpm.yml どおりになっている
    const drift = actions.some((a) => a.kind !== "adopt-marketplace" && a.kind !== "adopt-plugin");
    return ctx.check && drift ? 1 : 0;
  }
  await applyActions(ctx, actions, stored, state, desired.autoUpdate);
  console.log(actions.length ? `\n${actions.length} 件を適用しました` : "\n変更はありません");
  return 0;
}

async function add(ctx: Context, args: string[]): Promise<number> {
  const { claude, manifestPath } = ctx;
  const arg = args[0] ?? "";
  const at = arg.lastIndexOf("@");
  if (args.length !== 1 || at < 1) throw new Error("cpm add <plugin>@<marketplace> の形式で指定してください");
  if (!isYaml(manifestPath)) throw new Error(`add が書き換えられるのは YAML(.yml / .yaml)の cpm.yml だけです: ${manifestPath}`);
  if (!existsSync(manifestPath)) throw new Error(`cpm.yml がありません: ${manifestPath}(cpm init で作れます)`);

  const original = readFileSync(manifestPath, "utf8");
  let text = original;
  let market = arg.slice(at + 1);
  if (market.includes("/")) {
    const spec = parseMarketplace(market);
    const find = async () => (await claude.listMarketplaces()).find((m) => marketplaceRepo(m) === spec.repo);
    const registered = (await find()) ?? (await claude.addMarketplace(spec.target), await find());
    if (!registered) throw new Error(`marketplace "${market}" を登録しましたが、名前を特定できませんでした`);
    market = registered.name;
    text = addToManifest(text, "marketplaces", spec.ref ? JSON.stringify(spec.raw) : spec.raw);
  }
  text = addToManifest(text, "plugins", parsePlugin(`${arg.slice(0, at)}@${market}`).raw);
  writeFileSync(manifestPath, text);
  try {
    return await install(ctx, false);
  } catch (err) {
    writeFileSync(manifestPath, original); // 適用できなかった追記は cpm.yml に残さない
    throw err;
  }
}

/** 削除する操作を表示し、--dry-run でなければ適用する */
async function remove(ctx: Context, actions: Action[], stored: State, state: State): Promise<number> {
  for (const a of actions) console.log(describe(a));
  if (ctx.dryRun) {
    console.log(actions.length ? `\n${actions.length} 件を削除します(未適用)` : "\n削除するものはありません");
    return 0;
  }
  await applyActions(ctx, actions, stored, state, undefined);
  console.log(actions.length ? `\n${actions.length} 件を削除しました` : "\n削除するものはありません");
  return 0;
}

async function cleanup(ctx: Context): Promise<number> {
  const snap = await takeSnapshot(ctx.claude);
  const stored = readState(ctx.configDir);
  const state = pruneState(stored, snap);
  // 何も望まない cpm.yml との差分は、管理下のものすべての削除になる
  return remove(ctx, plan({ marketplaces: [], plugins: [], autoUpdate: undefined }, snap, state), stored, state);
}

async function uninstall(ctx: Context, args: string[]): Promise<number> {
  if (args.length !== 1) throw new Error("cpm uninstall <plugin>@<marketplace> の形式で指定してください(cpm list で確認できます)");
  const { raw: id, marketplace: marketOfId } = parsePlugin(args[0]!);
  const snap = await takeSnapshot(ctx.claude);
  const stored = readState(ctx.configDir);
  const state = pruneState(stored, snap);
  const actions = planUninstall(id, snap, state);

  // cpm.yml が YAML で存在するときだけ、削除した plugin と marketplace の行を消す(適用前に作って、書けない形式なら先にエラーにする)
  const { manifestPath } = ctx;
  let text: string | undefined;
  let next = "";
  if (isYaml(manifestPath) && existsSync(manifestPath)) {
    text = readFileSync(manifestPath, "utf8");
    next = removeFromManifest(text, "plugins", (item) => item === id);
    const dropped = actions.some((a) => a.kind === "remove-marketplace");
    const repo = dropped && marketplaceRepo(snap.marketplaces.find((m) => m.name === marketOfId)!);
    if (repo) {
      next = removeFromManifest(next, "marketplaces", (item) => {
        try {
          return parseMarketplace(item).repo === repo;
        } catch {
          return false;
        }
      });
    }
  }
  const code = await remove(ctx, actions, stored, state);
  if (!ctx.dryRun && text !== undefined && next !== text) {
    writeFileSync(manifestPath, next);
    console.log(`cpm.yml から外しました: ${manifestPath}`);
  }
  return code;
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "claude-dir": { type: "string" },
      remote: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      check: { type: "boolean", default: false },
      version: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.version) {
    console.log(VERSION);
    return 0;
  }
  const [command, ...args] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return values.help ? 0 : 1;
  }

  const configDir = values["claude-dir"] || process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  if (values.remote && command !== "install" && command !== "update") throw new Error("--remote は install でだけ使えます");
  if (command === "update" && (values.remote || values.check)) throw new Error("--remote と --check は update では使えません");
  if (["uninstall", "cleanup", "add"].includes(command) && values.check) throw new Error(`--check は ${command} では使えません`);
  if (command === "add" && values["dry-run"]) throw new Error("--dry-run は add では使えません");

  const ctx: Context = {
    claude: createClaude(configDir),
    configDir,
    manifestPath: join(configDir, "cpm.yml"),
    dryRun: values["dry-run"],
    check: values.check,
    remote: values.remote,
  };
  switch (command) {
    case "init":
      return init(ctx);
    case "list":
      return list(ctx);
    case "install":
    case "update":
      return install(ctx, command === "update");
    case "cleanup":
      return cleanup(ctx);
    case "add":
      return add(ctx, args);
    case "uninstall":
      return uninstall(ctx, args);
    default:
      console.error(`不明なコマンド: ${command}\n\n${HELP}`);
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
