import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateDistribution, type ParsedPair } from "../../validate/distribution.js";

function makePairs(source: string, count: number, tokenRange = [50, 200]): ParsedPair[] {
  return Array.from({ length: count }, (_, i) => ({
    tokens: tokenRange[0] + Math.floor((tokenRange[1] - tokenRange[0]) * (i / Math.max(count - 1, 1))),
    source,
    signalType: "explanation",
    text: `text content ${source} ${i} `.repeat(10),
    instruction: `instruction ${source} ${i}`,
  }));
}

describe("validateDistribution", () => {
  it("computes mean/median/stddev correctly", () => {
    // 10 pairs with tokens: 10,20,30,...,100
    const pairs: ParsedPair[] = Array.from({ length: 10 }, (_, i) => ({
      tokens: (i + 1) * 10, source: "code", signalType: "explanation", text: `t${i}`, instruction: `i${i}`,
    }));
    const result = validateDistribution(pairs);
    assert.equal(result.tokenStats.mean, 55); // (10+20+...+100)/10 = 55
    assert.ok(result.tokenStats.stddev > 0);
  });

  it("computes percentiles correctly", () => {
    const pairs: ParsedPair[] = Array.from({ length: 100 }, (_, i) => ({
      tokens: i + 1, source: "code", signalType: "explanation", text: `t${i}`, instruction: `i${i}`,
    }));
    const result = validateDistribution(pairs);
    assert.equal(result.tokenStats.p50, result.tokenStats.median);
  });

  it("CV is stddev/mean", () => {
    const pairs: ParsedPair[] = Array.from({ length: 100 }, (_, i) => ({
      tokens: 50 + (i % 50), source: "code", signalType: "explanation", text: `t${i}`, instruction: `i${i}`,
    }));
    const result = validateDistribution(pairs);
    assert.ok(typeof result.tokenStats.cv === "number");
    assert.ok(result.tokenStats.cv > 0);
  });

  it("source balance as fractions", () => {
    const pairs = [...makePairs("code", 50), ...makePairs("docs", 50)];
    const result = validateDistribution(pairs);
    assert.equal(result.sourceBalance.code, 0.5);
    assert.equal(result.sourceBalance.docs, 0.5);
  });

  it("Shannon entropy: single source = 0", () => {
    const pairs = makePairs("code", 50);
    const result = validateDistribution(pairs);
    assert.equal(result.sourceEntropy, 0);
  });

  it("Shannon entropy: uniform = log2(n)", () => {
    const pairs = [
      ...makePairs("code", 25),
      ...makePairs("docs", 25),
      ...makePairs("tests", 25),
      ...makePairs("commits", 25),
    ];
    const result = validateDistribution(pairs);
    assert.equal(result.sourceEntropy, 2); // log2(4) = 2
  });

  it("detects dominant source", () => {
    const pairs = [...makePairs("code", 80), ...makePairs("docs", 20)];
    const result = validateDistribution(pairs);
    assert.equal(result.dominantSource, "code");
  });

  it("no dominant when balanced", () => {
    const pairs = [...makePairs("code", 40), ...makePairs("docs", 30), ...makePairs("tests", 30)];
    const result = validateDistribution(pairs);
    assert.equal(result.dominantSource, null);
  });

  it("signal types counted correctly", () => {
    const pairs: ParsedPair[] = [
      { tokens: 50, source: "code", signalType: "explanation", text: "a", instruction: "a" },
      { tokens: 50, source: "code", signalType: "implementation", text: "b", instruction: "b" },
      { tokens: 50, source: "docs", signalType: "documentation", text: "c", instruction: "c" },
    ];
    const result = validateDistribution(pairs);
    assert.equal(result.signalTypes.explanation, 1);
    assert.equal(result.signalTypes.implementation, 1);
    assert.equal(result.signalTypes.documentation, 1);
  });

  it("passes when healthy", () => {
    // Good CV, no dominant, reasonable percentiles
    const pairs = [
      ...makePairs("code", 30, [30, 300]),
      ...makePairs("docs", 30, [40, 400]),
      ...makePairs("tests", 30, [50, 500]),
    ];
    const result = validateDistribution(pairs);
    assert.equal(result.pass, true);
  });

  it("warns when uniform lengths (low CV)", () => {
    // All identical tokens → CV = 0
    const pairs: ParsedPair[] = Array.from({ length: 50 }, (_, i) => ({
      tokens: 100, source: i < 25 ? "code" : "docs", signalType: "explanation", text: `t${i}`, instruction: `i${i}`,
    }));
    const result = validateDistribution(pairs);
    assert.equal(result.pass, false, "CV < 0.3 should fail");
  });

  it("warns when extreme lengths", () => {
    // P10 very small
    const pairs: ParsedPair[] = Array.from({ length: 100 }, (_, i) => ({
      tokens: i < 20 ? 5 : 200, source: i < 50 ? "code" : "docs", signalType: "explanation", text: `t${i}`, instruction: `i${i}`,
    }));
    const result = validateDistribution(pairs);
    assert.equal(result.pass, false, "P10 < 20 should fail");
  });
});
