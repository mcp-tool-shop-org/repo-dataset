import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectLanguage, isSourceFile, isDocFile } from "../discovery/languages.js";

describe("detectLanguage", () => {
  it("detects TypeScript", () => {
    assert.equal(detectLanguage(".ts"), "typescript");
    assert.equal(detectLanguage(".tsx"), "typescript");
  });

  it("detects Python", () => {
    assert.equal(detectLanguage(".py"), "python");
  });

  it("detects Rust", () => {
    assert.equal(detectLanguage(".rs"), "rust");
  });

  it("returns unknown for unrecognized", () => {
    assert.equal(detectLanguage(".xyz"), "unknown");
  });
});

describe("isSourceFile", () => {
  it("includes programming languages", () => {
    assert.equal(isSourceFile(".ts"), true);
    assert.equal(isSourceFile(".py"), true);
    assert.equal(isSourceFile(".rs"), true);
  });

  it("excludes config/data formats", () => {
    assert.equal(isSourceFile(".md"), false);
    assert.equal(isSourceFile(".json"), false);
    assert.equal(isSourceFile(".yaml"), false);
  });
});

describe("isDocFile", () => {
  it("includes markdown", () => {
    assert.equal(isDocFile(".md"), true);
    assert.equal(isDocFile(".mdx"), true);
  });

  it("excludes source files", () => {
    assert.equal(isDocFile(".ts"), false);
  });
});
