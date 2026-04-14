import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { passesQuality } from "../pipeline/quality.js";
import type { ExtractedPair, PipelineConfig } from "../types.js";

const defaultConfig: PipelineConfig = {
  repoPath: "/tmp/test",
  repoName: "test",
  outputDir: "/tmp/out",
  format: "alpaca",
  extractors: ["code"],
  maxTokens: 2048,
  minTokens: 20,
  maxCommits: 100,
  include: [],
  exclude: [],
  pipeToBackpropagate: false,
  json: false,
  balance: null,
  fimRate: 0.5,
  fimSpmRate: 0.5,
  globalMaxPairs: 100_000,
};

function makePair(instruction: string, input: string, output: string, tokens = 100): ExtractedPair {
  return {
    instruction, input, output,
    metadata: {
      id: "test", source: "code", repo_name: "test", file: null, language: null,
      commit_sha: null, line_start: null, line_end: null,
      extractor_type: "code:function", extractor_version: "0.2.0",
      extracted_at: new Date().toISOString(),
      tokens, char_count: (instruction + input + output).length,
      has_docstring: false, has_tests: false, complexity: "low",
      quality_score: 0.5, signal_type: "explanation",
    },
  };
}

describe("passesQuality", () => {
  it("passes valid pairs", () => {
    const pair = makePair(
      "Explain what this function does in typescript",
      "export function add(a: number, b: number): number { return a + b; }",
      "This function takes two numbers as parameters and returns their sum."
    );
    assert.equal(passesQuality(pair, defaultConfig), true);
  });

  it("rejects empty instruction", () => {
    const pair = makePair("", "code", "output");
    assert.equal(passesQuality(pair, defaultConfig), false);
  });

  it("rejects empty output", () => {
    const pair = makePair("Explain", "code", "");
    assert.equal(passesQuality(pair, defaultConfig), false);
  });

  it("rejects pairs below min tokens", () => {
    const pair = makePair("x", "", "y", 5);
    assert.equal(passesQuality(pair, { ...defaultConfig, minTokens: 50 }), false);
  });

  it("rejects pairs above max tokens", () => {
    const pair = makePair("Explain", "a".repeat(10000), "long output", 5000);
    assert.equal(passesQuality(pair, { ...defaultConfig, maxTokens: 100 }), false);
  });

  it("rejects excessive repetition", () => {
    const repeated = Array(20).fill("same line here").join("\n");
    // input is the codeContent checked for repetition, so put repetition there
    const pair = makePair("Explain", repeated, "output");
    assert.equal(passesQuality(pair, defaultConfig), false);
  });

  it("empty instruction OK in completion format", () => {
    const code = "export function add(a: number, b: number): number {\n  // adds two numbers together\n  const result = a + b;\n  return result;\n}\n";
    const pair = makePair("", code, "");
    pair.metadata.signal_type = "implementation";
    assert.equal(passesQuality(pair, { ...defaultConfig, format: "completion" }), true);
  });

  it("rejects auto-generated content", () => {
    const pair = makePair("Explain", "// DO NOT EDIT - auto-generated\nconst x = 1;", "output");
    assert.equal(passesQuality(pair, defaultConfig), false);
  });

  it("rejects code with max line >1000 chars", () => {
    const longLine = "a".repeat(1001);
    const pair = makePair("Explain", `const x = "${longLine}";`, "output");
    assert.equal(passesQuality(pair, defaultConfig), false);
  });

  it("rejects code with mean line >100 chars", () => {
    const lines = Array(10).fill("a".repeat(120)).join("\n");
    const pair = makePair("Explain", lines, "output");
    assert.equal(passesQuality(pair, defaultConfig), false);
  });

  it("rejects code with low alphanumeric ratio", () => {
    const symbols = "!@#$%^&*(){}[]|;:',.<>?/\\~`" .repeat(20);
    const pair = makePair("Explain", symbols, "output");
    assert.equal(passesQuality(pair, defaultConfig), false);
  });

  it("non-code source skips code quality checks", () => {
    // Each line is unique (no repetition) but >100 chars mean length
    const longLines = Array.from({ length: 10 }, (_, i) =>
      `This is documentation line ${i} with detailed content: ${"x".repeat(100)}`
    ).join("\n");
    const pair = makePair("Explain", longLines, "output");
    pair.metadata.source = "docs";
    // docs source skips passesCodeQuality (mean line >100 check), so this passes
    assert.equal(passesQuality(pair, defaultConfig), true);
  });
});
