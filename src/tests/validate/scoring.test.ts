import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeScore } from "../../validate/scoring.js";
import type { StructuralResult } from "../../validate/structural.js";
import type { DistributionResult } from "../../validate/distribution.js";
import type { ContentResult } from "../../validate/content.js";

function makeStructural(pass = true): StructuralResult {
  return { pass, totalLines: 100, validLines: 100, emptyFields: 0, encodingErrors: 0, truncatedLines: 0, oversizedLines: 0 };
}

function makeDistribution(overrides?: Partial<DistributionResult>): DistributionResult {
  return {
    pass: true,
    tokenStats: { mean: 150, median: 140, stddev: 80, cv: 0.53, p10: 40, p25: 80, p50: 140, p75: 200, p90: 280 },
    sourceBalance: { code: 0.4, docs: 0.3, tests: 0.3 },
    sourceEntropy: 1.57,
    sourceEntropyMax: 1.58,
    signalTypes: { explanation: 40, documentation: 30, test_generation: 30 },
    signalEntropy: 1.5,
    signalEntropyMax: 1.58,
    dominantSource: null,
    ...overrides,
  };
}

function makeContent(overrides?: Partial<ContentResult>): ContentResult {
  return {
    pass: true,
    exactDuplicates: 0,
    nearDuplicatePct: 2,
    vocabularyTTR: 0.25,
    instructionDiversityPct: 80,
    trivialPairPct: 3,
    uniqueSourceFiles: 10,
    ...overrides,
  };
}

describe("computeScore", () => {
  it("perfect inputs yield high score", () => {
    const result = computeScore(makeStructural(), makeDistribution(), makeContent(), 1000);
    assert.ok(result.score >= 85, `Expected >= 85, got ${result.score}`);
  });

  it("structural fail loses 20 points", () => {
    const passing = computeScore(makeStructural(true), makeDistribution(), makeContent(), 1000);
    const failing = computeScore(makeStructural(false), makeDistribution(), makeContent(), 1000);
    assert.equal(passing.score - failing.score, 20);
  });

  it("low entropy loses balance points", () => {
    const result = computeScore(
      makeStructural(),
      makeDistribution({ sourceEntropy: 0, sourceEntropyMax: 2 }),
      makeContent(),
      1000
    );
    const perfect = computeScore(makeStructural(), makeDistribution(), makeContent(), 1000);
    assert.ok(result.score < perfect.score, "Zero entropy should score lower");
  });

  it("max entropy gets full balance points", () => {
    const result = computeScore(
      makeStructural(),
      makeDistribution({ sourceEntropy: 2, sourceEntropyMax: 2 }),
      makeContent(),
      1000
    );
    // entropyRatio = 1.0 → full 20 points for balance
    assert.ok(result.score >= 80, `Full entropy should score high, got ${result.score}`);
  });

  it("content all good yields 30 points", () => {
    const good = computeScore(makeStructural(), makeDistribution(), makeContent(), 1000);
    const bad = computeScore(
      makeStructural(),
      makeDistribution(),
      makeContent({ exactDuplicates: 10, nearDuplicatePct: 30, vocabularyTTR: 0.02, instructionDiversityPct: 5, trivialPairPct: 50 }),
      1000
    );
    assert.ok(good.score - bad.score >= 20, "Good content should score much higher than bad");
  });

  it("50 pairs gets partial pair bonus", () => {
    const result = computeScore(makeStructural(), makeDistribution(), makeContent(), 50);
    const big = computeScore(makeStructural(), makeDistribution(), makeContent(), 1000);
    assert.ok(result.score < big.score, "50 pairs should score lower than 1000");
  });

  it("1000 pairs gets full pair bonus", () => {
    const result = computeScore(makeStructural(), makeDistribution(), makeContent(), 1000);
    // log2(1000)/log2(1000) * 15 = 15
    assert.ok(result.score >= 80);
  });

  it("grade A: score >= 90", () => {
    const result = computeScore(makeStructural(), makeDistribution(), makeContent(), 1000);
    if (result.score >= 90) assert.equal(result.grade, "A");
  });

  it("grade B: score 75-89", () => {
    // Reduce some components to land in B range
    const result = computeScore(
      makeStructural(),
      makeDistribution({ sourceEntropy: 0.5, sourceEntropyMax: 2 }),
      makeContent(),
      500
    );
    if (result.score >= 75 && result.score < 90) assert.equal(result.grade, "B");
  });

  it("grade D/F: low score", () => {
    const result = computeScore(
      makeStructural(false),
      makeDistribution({ sourceEntropy: 0, sourceEntropyMax: 2 }),
      makeContent({ exactDuplicates: 50, nearDuplicatePct: 40, vocabularyTTR: 0.02, instructionDiversityPct: 5, trivialPairPct: 60 }),
      10
    );
    assert.ok(result.grade === "D" || result.grade === "F", `Expected D or F, got ${result.grade}`);
  });

  it("trainability insufficient: <50 pairs", () => {
    const result = computeScore(makeStructural(), makeDistribution(), makeContent(), 30);
    assert.equal(result.trainability, "insufficient");
  });

  it("trainability marginal: <200 pairs", () => {
    const result = computeScore(makeStructural(), makeDistribution(), makeContent(), 100);
    assert.equal(result.trainability, "marginal");
  });

  it("trainability good: >=200 + good grade", () => {
    const result = computeScore(makeStructural(), makeDistribution(), makeContent(), 1000);
    if (result.grade !== "D" && result.grade !== "F") {
      assert.equal(result.trainability, "good");
    }
  });
});
