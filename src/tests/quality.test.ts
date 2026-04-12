import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { passesQuality } from "../pipeline/quality.js";
import type { ExtractedPair, PipelineConfig } from "../types.js";

const defaultConfig: PipelineConfig = {
  repoPath: "/tmp/test",
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
};

function makePair(instruction: string, input: string, output: string, tokens = 100): ExtractedPair {
  return { instruction, input, output, metadata: { source: "code", tokens } };
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
    const pair = makePair("Explain", "code", repeated);
    assert.equal(passesQuality(pair, defaultConfig), false);
  });
});
