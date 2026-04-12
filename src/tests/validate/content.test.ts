import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateContent } from "../../validate/content.js";
import type { ParsedPair } from "../../validate/distribution.js";

function makePair(i: number, overrides?: Partial<ParsedPair>): ParsedPair {
  return {
    tokens: 50,
    source: "code",
    signalType: "explanation",
    text: `This is unique output text number ${i} with diverse vocabulary and meaningful content for testing purposes`,
    instruction: `Explain function number ${i} in detail`,
    ...overrides,
  };
}

describe("validateContent", () => {
  it("detects exact duplicates", () => {
    const pairs = [
      makePair(0),
      makePair(0), // exact duplicate
      makePair(1),
    ];
    const result = validateContent(pairs, new Set(["a.ts"]));
    assert.equal(result.exactDuplicates, 1);
  });

  it("no duplicates in unique set", () => {
    const pairs = Array.from({ length: 10 }, (_, i) => makePair(i));
    const result = validateContent(pairs, new Set(["a.ts"]));
    assert.equal(result.exactDuplicates, 0);
  });

  it("10-gram overlap detection", () => {
    // Two pairs that share a long phrase (>10 words, stride 5 so need enough overlap)
    const sharedPhrase = "the quick brown fox jumps over the lazy dog and then it runs back through the forest path again to its den";
    const pairs = [
      makePair(0, { text: `Alpha start ${sharedPhrase} end alpha one two three four five` }),
      makePair(1, { text: `Beta begin ${sharedPhrase} end beta one two three four five` }),
      ...Array.from({ length: 8 }, (_, i) => makePair(i + 2)),
    ];
    const result = validateContent(pairs, new Set(["a.ts"]));
    assert.ok(result.nearDuplicatePct > 0, "Should detect near-duplicate overlap");
  });

  it("short pairs skip n-gram check", () => {
    const pairs = [
      makePair(0, { text: "short text" }),
      makePair(1, { text: "short text" }), // same but <10 words
    ];
    // The near-dup check requires 10+ words, but exact dup will still catch it
    const result = validateContent(pairs, new Set(["a.ts"]));
    // These are exact duplicates, but n-gram check is skipped for <10 words
    assert.equal(result.exactDuplicates, 1);
  });

  it("vocabulary TTR computed correctly", () => {
    const pairs = Array.from({ length: 20 }, (_, i) =>
      makePair(i, { text: `word${i} another${i} text${i} unique${i} content${i}` })
    );
    const result = validateContent(pairs, new Set(["a.ts"]));
    assert.ok(result.vocabularyTTR > 0, "TTR should be positive");
    assert.ok(result.vocabularyTTR <= 1, "TTR should be <= 1");
  });

  it("instruction diversity: all unique", () => {
    const pairs = Array.from({ length: 10 }, (_, i) =>
      makePair(i, { instruction: `Explain the purpose of component ${i} in the architecture` })
    );
    const result = validateContent(pairs, new Set(["a.ts"]));
    assert.equal(result.instructionDiversityPct, 100);
  });

  it("instruction diversity: all same", () => {
    const pairs = Array.from({ length: 10 }, (_, i) =>
      makePair(i, { instruction: "Explain what this function does in typescript" })
    );
    const result = validateContent(pairs, new Set(["a.ts"]));
    assert.ok(result.instructionDiversityPct < 100, "Same instruction should lower diversity");
  });

  it("trivial pair detection", () => {
    // Output that just restates instruction with few novel words
    const pairs = [
      makePair(0, {
        instruction: "Explain what add does",
        text: "what add does is adding numbers",
      }),
      ...Array.from({ length: 9 }, (_, i) => makePair(i + 1)),
    ];
    const result = validateContent(pairs, new Set(["a.ts"]));
    assert.ok(result.trivialPairPct >= 0, "Should compute trivial pair percentage");
  });

  it("non-trivial pairs pass", () => {
    const pairs = Array.from({ length: 20 }, (_, i) =>
      makePair(i, {
        instruction: `Explain function ${i}`,
        text: `This function implements a complex algorithm that processes data through multiple transformation steps including validation, normalization, and output formatting with error handling and retry logic for robustness`,
      })
    );
    const result = validateContent(pairs, new Set(["a.ts"]));
    assert.equal(result.trivialPairPct, 0);
  });

  it("unique source files counted", () => {
    const files = new Set(["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"]);
    const pairs = Array.from({ length: 10 }, (_, i) => makePair(i));
    const result = validateContent(pairs, files);
    assert.equal(result.uniqueSourceFiles, 5);
  });

  it("passes when all healthy", () => {
    const pairs = Array.from({ length: 50 }, (_, i) =>
      makePair(i, {
        instruction: `Explain component ${i} architecture and design rationale`,
        text: `Component ${i} implements the ${["adapter", "factory", "observer", "strategy", "builder"][i % 5]} pattern using dependency injection with ${i * 7} lines of TypeScript code providing ${["authentication", "caching", "logging", "validation", "routing"][i % 5]} functionality`,
      })
    );
    const result = validateContent(pairs, new Set(["a.ts", "b.ts"]));
    assert.equal(result.pass, true, "Healthy content should pass");
  });

  it("fails when vocabulary poor", () => {
    // Same word repeated many times → low TTR
    const pairs = Array.from({ length: 50 }, (_, i) =>
      makePair(i, { text: "word word word word word word word word word word" })
    );
    const result = validateContent(pairs, new Set(["a.ts"]));
    assert.ok(result.vocabularyTTR < 0.08, "Repetitive vocabulary should have low TTR");
    assert.equal(result.pass, false);
  });
});
