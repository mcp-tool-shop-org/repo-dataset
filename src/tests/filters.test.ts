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
});
