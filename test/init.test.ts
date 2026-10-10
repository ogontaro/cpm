import { describe, expect, test } from "bun:test";
import { renderManifest } from "../src/init";
import { parseManifest } from "../src/manifest";
import type { Snapshot } from "../src/sync";

const snapshot = (partial: Partial<Snapshot>): Snapshot => ({ marketplaces: [], plugins: [], autoUpdate: {}, ...partial });

describe("renderManifest", () => {
  test("GitHub の marketplace と plugin を名前順に出し、ref があれば引用符で囲む", () => {
    const text = renderManifest(
      snapshot({
        marketplaces: [
          { name: "ogontaro-skills", source: "github", repo: "ogontaro/skills" },
          { name: "ponytail", source: "github", repo: "DietrichGebert/ponytail", ref: "v4.10.3" },
        ],
        plugins: ["ponytail@ponytail", "git-usage@ogontaro-skills"],
      }),
    );
    expect(text).toBe(
      [
        "# cpm init で生成しました",
        "marketplaces:",
        "  - ogontaro/skills",
        '  - "DietrichGebert/ponytail#v4.10.3"',
        "plugins:",
        "  - git-usage@ogontaro-skills",
        "  - ponytail@ponytail",
        "",
      ].join("\n"),
    );
    expect(parseManifest(text, "cpm.yml")).toMatchObject({
      marketplaces: ["ogontaro/skills", "DietrichGebert/ponytail#v4.10.3"],
      plugins: ["git-usage@ogontaro-skills", "ponytail@ponytail"],
    });
  });

  test("GitHub 以外の marketplace はコメントで列挙し、その plugin は plugins に出す", () => {
    const text = renderManifest(
      snapshot({
        marketplaces: [
          { name: "local", source: "directory" },
          { name: "ogontaro-skills", source: "github", repo: "ogontaro/skills" },
        ],
        plugins: ["a@local", "git-usage@ogontaro-skills"],
      }),
    );
    expect(text).toContain("  - git-usage@ogontaro-skills\n");
    expect(text).toContain("#   local (directory)\n");
    expect(parseManifest(text, "cpm.yml")).toMatchObject({
      marketplaces: ["ogontaro/skills"],
      plugins: ["a@local", "git-usage@ogontaro-skills"],
    });
  });

  test("GitHub Enterprise の marketplace は host を付けて出す", () => {
    const text = renderManifest(
      snapshot({
        marketplaces: [{ name: "internal", source: "git", url: "https://ghe.example.com/acme/plugins.git", ref: "v1" }],
      }),
    );
    expect(parseManifest(text, "cpm.yml").marketplaces).toEqual(["ghe.example.com/acme/plugins#v1"]);
  });

  test("# を含む ref は cpm.yml に書けないので、コメントに回す", () => {
    const text = renderManifest(
      snapshot({ marketplaces: [{ name: "odd", source: "github", repo: "o/odd", ref: "a#b" }] }),
    );
    expect(parseManifest(text, "cpm.yml").marketplaces).toEqual([]);
    expect(text).toContain("#   odd (github)\n");
  });

  test("何も無いときも有効な YAML になる", () => {
    const text = renderManifest(snapshot({}));
    expect(text).toBe("# cpm init で生成しました\nmarketplaces: []\nplugins: []\n");
    expect(parseManifest(text, "cpm.yml")).toMatchObject({ marketplaces: [], plugins: [] });
  });
});
