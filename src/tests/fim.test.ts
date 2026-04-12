import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FimFormatter } from "../formatters/fim.js";
import type { ExtractedPair, PairMetadata } from "../types.js";

function makeMeta(overrides?: Partial<PairMetadata>): PairMetadata {
  return {
    id: "test", source: "code", repo_name: "test", file: "main.ts", language: "typescript",
    commit_sha: null, line_start: 1, line_end: 20,
    extractor_type: "code:function", extractor_version: "0.2.0",
    extracted_at: new Date().toISOString(),
    tokens: 100, char_count: 400, has_docstring: false, has_tests: false,
    complexity: "medium", quality_score: 0.6, signal_type: "implementation",
    ...overrides,
  };
}

// Multi-line code that is long enough for FIM (>= 3 lines)
const MULTI_LINE_CODE = [
  "export function greet(name: string): string {",
  "  const greeting = `Hello, ${name}!`;",
  "  console.log(greeting);",
  "  return greeting;",
  "}",
  "",
  "export function farewell(name: string): string {",
  "  return `Goodbye, ${name}!`;",
  "}",
].join("\n");

function makePair(input: string = MULTI_LINE_CODE): ExtractedPair {
  return {
    instruction: "",
    input,
    output: "",
    metadata: makeMeta(),
  };
}

describe("FimFormatter", () => {
  it("produces text and metadata", () => {
    const formatter = new FimFormatter(0.5, 0.5, 42);
    const parsed = JSON.parse(formatter.formatPair(makePair()));
    assert.ok(typeof parsed.text === "string");
    assert.ok(parsed.metadata, "Should include metadata");
  });

  it("FIM tokens appear at rate 1.0", () => {
    const formatter = new FimFormatter(1.0, 0.5, 42);
    for (let i = 0; i < 5; i++) {
      const pair = makePair();
      pair.metadata.id = `test-${i}`;
      const parsed = JSON.parse(formatter.formatPair(pair));
      assert.ok(parsed.text.includes("<fim_prefix>"), `Iteration ${i}: should have FIM tokens at rate 1.0`);
    }
  });

  it("no FIM tokens at rate 0", () => {
    const formatter = new FimFormatter(0, 0.5, 42);
    for (let i = 0; i < 5; i++) {
      const pair = makePair();
      pair.metadata.id = `test-${i}`;
      const parsed = JSON.parse(formatter.formatPair(pair));
      assert.ok(!parsed.text.includes("<fim_prefix>"), `Iteration ${i}: should have no FIM tokens at rate 0`);
    }
  });

  it("PSM format has prefix-suffix-middle order when spmRate=0", () => {
    const formatter = new FimFormatter(1.0, 0, 42);
    const parsed = JSON.parse(formatter.formatPair(makePair()));
    const text = parsed.text;
    const prefixIdx = text.indexOf("<fim_prefix>");
    const suffixIdx = text.indexOf("<fim_suffix>");
    const middleIdx = text.indexOf("<fim_middle>");
    assert.ok(prefixIdx < suffixIdx, "prefix should come before suffix in PSM");
    assert.ok(suffixIdx < middleIdx, "suffix should come before middle in PSM");
  });

  it("SPM format has suffix before middle when spmRate=1.0", () => {
    const formatter = new FimFormatter(1.0, 1.0, 42);
    const parsed = JSON.parse(formatter.formatPair(makePair()));
    const text = parsed.text;
    // SPM: <fim_prefix><fim_suffix>suffix\n<fim_middle>prefix\nmiddle
    assert.ok(text.startsWith("<fim_prefix><fim_suffix>"), "SPM should start with prefix+suffix tokens");
  });

  it("short code (<3 lines) is not FIM-transformed", () => {
    const formatter = new FimFormatter(1.0, 0.5, 42);
    const shortCode = "const a = 1;\nconst b = 2;";
    const parsed = JSON.parse(formatter.formatPair(makePair(shortCode)));
    assert.ok(!parsed.text.includes("<fim_prefix>"), "Short code should not get FIM tokens");
  });

  it("seeded PRNG is deterministic", () => {
    const f1 = new FimFormatter(0.5, 0.5, 99);
    const f2 = new FimFormatter(0.5, 0.5, 99);
    const result1 = f1.formatPair(makePair());
    const result2 = f2.formatPair(makePair());
    assert.equal(result1, result2, "Same seed should produce same output");
  });

  it("different seeds produce different output", () => {
    const f1 = new FimFormatter(1.0, 0.5, 1);
    const f2 = new FimFormatter(1.0, 0.5, 999);
    const result1 = f1.formatPair(makePair());
    const result2 = f2.formatPair(makePair());
    // With rate 1.0 both get FIM, but split points differ
    assert.notEqual(result1, result2, "Different seeds should produce different output");
  });
});
