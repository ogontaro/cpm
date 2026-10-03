import { describe, expect, test } from "bun:test";
import { parseInclude, parseMarketplace, parsePlugin } from "../src/spec";

describe("parseMarketplace", () => {
  test("owner/repo と ref を解釈する", () => {
    expect(parseMarketplace("mksglu/context-mode#v1.0.169")).toEqual({
      raw: "mksglu/context-mode#v1.0.169",
      repo: "mksglu/context-mode",
      ref: "v1.0.169",
    });
    expect(parseMarketplace("DietrichGebert/ponytail").ref).toBeNull();
  });

  test.each(["ponytail", "a/b/c", "a/b#", "a/b#c#d"])("不正な指定 %s は拒否する", (raw) => {
    expect(() => parseMarketplace(raw)).toThrow();
  });
});

describe("parsePlugin", () => {
  test("plugin@marketplace を解釈する", () => {
    expect(parsePlugin("git-usage@ogontaro-skills")).toEqual({
      raw: "git-usage@ogontaro-skills",
      name: "git-usage",
      marketplace: "ogontaro-skills",
    });
  });

  test.each(["git-usage", "git-usage@", "@market", "a@b@c", "a b@c"])("不正な指定 %s は拒否する", (raw) => {
    expect(() => parsePlugin(raw)).toThrow("plugin@marketplace");
  });
});

describe("parseInclude", () => {
  test("ファイルパスと ref を解釈する", () => {
    expect(parseInclude("o/r/conf/cpm.json#v1")).toMatchObject({ owner: "o", repo: "r", file: "conf/cpm.json", ref: "v1" });
  });

  test.each(["o/r", "o/r/conf", "o/r/cpm.txt", "o/r/../cpm.yml"])("不正な指定 %s は拒否する", (raw) => {
    expect(() => parseInclude(raw)).toThrow();
  });
});
