import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findUnmanaged, pruneState, readState, takeSnapshot, writeState } from "../src/state";
import { FakeClaude } from "./helpers";

let claudeDir: string;
let fake: FakeClaude;

beforeEach(() => {
  claudeDir = mkdtempSync(join(tmpdir(), "cpm-state-"));
  fake = new FakeClaude();
});
afterEach(() => rmSync(claudeDir, { recursive: true, force: true }));

test("記録に無い marketplace と plugin を挙げる", async () => {
  fake.marketplaces.push({ name: "manual", source: "github", repo: "x/manual", ref: null });
  fake.marketplaces.push({ name: "mk", source: "github", repo: "o/mk", ref: null });
  fake.plugins.add("m@manual");
  fake.plugins.add("a@mk");
  writeState(claudeDir, { marketplaces: ["mk"], plugins: ["a@mk"] });
  const snap = await takeSnapshot(fake);
  expect(findUnmanaged(snap, readState(claudeDir))).toEqual({ marketplaces: ["manual"], plugins: ["m@manual"] });
});

test("状態ファイルが無ければ、空の記録として読む", () => {
  expect(readState(claudeDir)).toEqual({ marketplaces: [], plugins: [] });
});

test("書いた記録を読み戻す", () => {
  writeState(claudeDir, { marketplaces: ["mk"], plugins: ["a@mk"] });
  expect(readState(claudeDir)).toEqual({ marketplaces: ["mk"], plugins: ["a@mk"] });
});

test("既に存在しないものを記録から外す", async () => {
  fake.marketplaces.push({ name: "mk", source: "github", repo: "o/mk", ref: null });
  fake.plugins.add("a@mk");
  const snap = await takeSnapshot(fake);
  const state = { marketplaces: ["mk", "gone"], plugins: ["a@mk", "b@mk"] };
  expect(pruneState(state, snap)).toEqual({ marketplaces: ["mk"], plugins: ["a@mk"] });
});
