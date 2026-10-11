import { describe, expect, test } from "bun:test";
import { addToManifest, removeFromManifest } from "../src/edit";

describe("addToManifest", () => {
  test("既存のリストの末尾に、同じインデントで追記する", () => {
    const text = "# memo\nmarketplaces:\n    - a/b\nplugins:\n    - x@a  # 説明\n    - y@a\n\nexclude: []\n";
    expect(addToManifest(text, "plugins", "z@a")).toBe(
      "# memo\nmarketplaces:\n    - a/b\nplugins:\n    - x@a  # 説明\n    - y@a\n    - z@a\n\nexclude: []\n",
    );
  });

  test("`key: []` は block 形式に直す", () => {
    expect(addToManifest("plugins: []\n", "plugins", "x@a")).toBe("plugins:\n  - x@a\n");
  });

  test("key が無ければ末尾に作る", () => {
    expect(addToManifest("marketplaces:\n  - a/b\n", "plugins", "x@a")).toBe("marketplaces:\n  - a/b\nplugins:\n  - x@a\n");
  });

  test("既にあれば変更しない", () => {
    const text = "plugins:\n  - x@a\n";
    expect(addToManifest(text, "plugins", "x@a")).toBe(text);
  });

  test("flow 形式のリストはエラーにする", () => {
    expect(() => addToManifest("plugins: [x@a]\n", "plugins", "y@a")).toThrow();
  });
});

describe("removeFromManifest", () => {
  test("該当する行だけを消し、コメントや並びは保つ", () => {
    const text = "# memo\nmarketplaces:\n  - a/b\nplugins:\n  - x@a  # 説明\n  # 注釈\n  - \"y@a\"\n  - z@a\n\nexclude: []\n";
    expect(removeFromManifest(text, "plugins", (i) => i === "x@a")).toBe(
      "# memo\nmarketplaces:\n  - a/b\nplugins:\n  # 注釈\n  - \"y@a\"\n  - z@a\n\nexclude: []\n",
    );
    expect(removeFromManifest(text, "plugins", (i) => i === "y@a")).not.toContain("y@a");
  });

  test("他のキーのリストには触れない", () => {
    const text = "marketplaces:\n  - x@a\nplugins:\n  - y@a\n";
    expect(removeFromManifest(text, "plugins", (i) => i === "x@a")).toBe(text);
  });

  test("該当が無い・key が無い・`key: []` は変更しない", () => {
    expect(removeFromManifest("plugins:\n  - x@a\n", "plugins", (i) => i === "y@a")).toBe("plugins:\n  - x@a\n");
    expect(removeFromManifest("plugins: []\n", "plugins", () => true)).toBe("plugins: []\n");
    expect(removeFromManifest("exclude: []\n", "plugins", () => true)).toBe("exclude: []\n");
  });

  test("flow 形式のリストはエラーにする", () => {
    expect(() => removeFromManifest("plugins: [x@a]\n", "plugins", () => true)).toThrow();
  });
});
