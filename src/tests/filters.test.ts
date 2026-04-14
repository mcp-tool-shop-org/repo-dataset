import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isBinary, isVendored, isGenerated, shouldInclude } from "../discovery/filters.js";

describe("isBinary", () => {
  it("detects image files", () => {
    assert.equal(isBinary("icon.png"), true);
    assert.equal(isBinary("photo.jpg"), true);
  });

  it("detects binary executables", () => {
    assert.equal(isBinary("app.exe"), true);
    assert.equal(isBinary("lib.so"), true);
  });

  it("allows source files", () => {
    assert.equal(isBinary("main.ts"), false);
    assert.equal(isBinary("app.py"), false);
  });
});

describe("isVendored", () => {
  it("detects node_modules", () => {
    assert.equal(isVendored("node_modules/foo/index.js"), true);
  });

  it("detects vendor directories", () => {
    assert.equal(isVendored("vendor/lib/foo.rb"), true);
  });

  it("allows source directories", () => {
    assert.equal(isVendored("src/main.ts"), false);
  });
});

describe("isGenerated", () => {
  it("detects lock files", () => {
    assert.equal(isGenerated("package-lock.json"), true);
    assert.equal(isGenerated("yarn.lock"), true);
  });

  it("detects minified files", () => {
    assert.equal(isGenerated("app.min.js"), true);
  });

  it("allows regular source", () => {
    assert.equal(isGenerated("src/utils.ts"), false);
  });
});

describe("shouldInclude", () => {
  it("excludes binary files", () => {
    assert.equal(shouldInclude("photo.png", [], []), false);
  });

  it("excludes vendored files", () => {
    assert.equal(shouldInclude("node_modules/x/y.js", [], []), false);
  });

  it("includes regular source by default", () => {
    assert.equal(shouldInclude("src/main.ts", [], []), true);
  });

  it("respects include patterns", () => {
    assert.equal(shouldInclude("src/main.ts", ["src/**"], []), true);
    assert.equal(shouldInclude("lib/foo.ts", ["src/**"], []), false);
  });

  it("respects exclude patterns", () => {
    assert.equal(shouldInclude("src/main.ts", [], ["src/**"]), false);
  });

  it("T-FT006: adversarial glob pattern completes without hanging", () => {
    // Deeply nested glob that could cause catastrophic backtracking in naive regex
    const adversarialPattern = "**/**/**/**/**/**/*a";
    const longPath = "a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t/u/v/w/x/y/z/deep.ts";
    // The test timeout (default or suite-level) is the safety net.
    // If matchGlob has ReDoS, this will hang and the test runner will timeout → fail.
    const result = shouldInclude(longPath, [adversarialPattern], []);
    assert.equal(typeof result, "boolean", "shouldInclude should return a boolean");
  });

  it("T-FT006: regex metacharacters in patterns do not break matching", () => {
    // Patterns with characters that are regex metacharacters: . + ? ( ) [ ] { } ^ $ |
    assert.equal(
      shouldInclude("src/file.test.ts", ["src/file.test.ts"], []),
      true,
      "Literal dots in pattern should match"
    );
    assert.equal(
      shouldInclude("src/file+plus.ts", ["src/file+plus.ts"], []),
      true,
      "Literal + in pattern should match"
    );
    assert.equal(
      shouldInclude("src/file(1).ts", ["src/file(1).ts"], []),
      true,
      "Literal parens in pattern should match"
    );
    // A pattern with square brackets should not be treated as a character class
    assert.equal(
      shouldInclude("src/[config].ts", ["src/[config].ts"], []),
      true,
      "Literal brackets in pattern should match"
    );
  });
});
