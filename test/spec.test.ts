import { describe, expect, test } from "bun:test";
import { parseInclude, parseMarketplace, parsePlugin, repoKeyFromUrl } from "../src/spec";

describe("parseMarketplace", () => {
  test("owner/repo と ref を解釈する", () => {
    expect(parseMarketplace("mksglu/context-mode#v1.0.169")).toEqual({
      raw: "mksglu/context-mode#v1.0.169",
      repo: "mksglu/context-mode",
      ref: "v1.0.169",
      target: "mksglu/context-mode#v1.0.169",
    });
    expect(parseMarketplace("DietrichGebert/ponytail").ref).toBeNull();
  });

  test("GitHub Enterprise は host/owner/repo と ref を解釈し、https の URL にして claude に渡す", () => {
    expect(parseMarketplace("github.example.com/acme/plugins#v1")).toEqual({
      raw: "github.example.com/acme/plugins#v1",
      repo: "github.example.com/acme/plugins",
      ref: "v1",
      target: "https://github.example.com/acme/plugins.git#v1",
    });
    expect(parseMarketplace("github.example.com/acme/plugins").target).toBe("https://github.example.com/acme/plugins.git");
    expect(parseMarketplace("github.com/o/r").repo).toBe("o/r");
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

  test("GitHub Enterprise の host を解釈する", () => {
    expect(parseInclude("github.example.com/o/r/conf/cpm.yml#v1")).toMatchObject({
      host: "github.example.com",
      owner: "o",
      repo: "r",
      file: "conf/cpm.yml",
      ref: "v1",
    });
    expect(parseInclude("o/r/cpm.yml").host).toBe("github.com");
  });

  test.each(["o/r", "o/r/conf", "o/r/cpm.txt", "o/r/../cpm.yml"])("不正な指定 %s は拒否する", (raw) => {
    expect(() => parseInclude(raw)).toThrow();
  });
});

describe("repoKeyFromUrl", () => {
  test.each([
    ["https://github.example.com/acme/plugins.git", "github.example.com/acme/plugins"],
    ["git@github.example.com:acme/plugins.git", "github.example.com/acme/plugins"],
    ["https://github.com/acme/plugins", "acme/plugins"],
  ])("%s", (url, expected) => {
    expect(repoKeyFromUrl(url)).toBe(expected);
  });

  test("リポジトリの URL でなければ null", () => {
    expect(repoKeyFromUrl("/local/path")).toBeNull();
  });
});
