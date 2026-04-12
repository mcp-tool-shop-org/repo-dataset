import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyBalance, getAutoBalanceConfig, assessTrainability } from "../pipeline/balance.js";
import type { ExtractedPair, ExtractorName, BalanceConfig, SourceStats } from "../types.js";

function makePairs(source: ExtractorName, count: number, quality = 0.5): ExtractedPair[] {
  return Array.from({ length: count }, (_, i) => ({
    instruction: `inst-${source}-${i}`,
    input: `input-${source}-${i}`,
    output: `output-${source}-${i}`,
    metadata: {
      id: `${source}-${i}`,
      source,
      repo_name: "test/repo",
      file: null,
      language: null,
      commit_sha: null,
      line_start: null,
      line_end: null,
      extractor_type: `${source}:function` as any,
      extractor_version: "0.2.0",
      extracted_at: new Date().toISOString(),
      tokens: 50,
      char_count: 200,
      has_docstring: false,
      has_tests: false,
      complexity: "low" as const,
      quality_score: quality + (i * 0.001),
      signal_type: "explanation" as const,
    },
  }));
}

describe("getAutoBalanceConfig", () => {
  it("returns code:3, tests:2, commits:1, docs:1", () => {
    const config = getAutoBalanceConfig();
    assert.equal(config.ratios.code, 3);
    assert.equal(config.ratios.tests, 2);
    assert.equal(config.ratios.commits, 1);
    assert.equal(config.ratios.docs, 1);
  });
});

describe("applyBalance", () => {
  it("reduces dominant source", () => {
    const pairs = [...makePairs("docs", 100), ...makePairs("code", 10)];
    const config: BalanceConfig = { ratios: { code: 3, docs: 1 }, maxPairs: {}, minPairs: {} };
    const result = applyBalance(pairs, config);
    assert.ok(result.after.docs!.pairs < 100, "Docs should be reduced from 100");
  });

  it("preserves small sources fully", () => {
    const pairs = [...makePairs("code", 10), ...makePairs("docs", 100)];
    const config: BalanceConfig = { ratios: { code: 3, docs: 1 }, maxPairs: {}, minPairs: {} };
    const result = applyBalance(pairs, config);
    assert.equal(result.after.code!.pairs, 10, "All 10 code pairs should be kept");
  });

  it("sorts by quality_score when trimming", () => {
    const pairs = makePairs("docs", 50, 0.1);
    // Highest quality pairs have quality 0.1 + 49*0.001 = 0.149
    const config: BalanceConfig = { ratios: { docs: 1 }, maxPairs: { docs: 10 }, minPairs: {} };
    const result = applyBalance(pairs, config);
    // The kept pairs should be the highest-quality ones
    const keptScores = result.pairs.map((p) => p.metadata.quality_score);
    for (const score of keptScores) {
      assert.ok(score >= 0.14, `Kept pair should have high quality, got ${score}`);
    }
  });

  it("hard cap maxPairs is respected", () => {
    const pairs = makePairs("docs", 50);
    const config: BalanceConfig = { ratios: { docs: 1 }, maxPairs: { docs: 5 }, minPairs: {} };
    const result = applyBalance(pairs, config);
    assert.ok(result.after.docs!.pairs <= 5, "Should respect maxPairs cap");
  });

  it("minPairs generates warning when unmet", () => {
    const pairs = makePairs("code", 10);
    const config: BalanceConfig = { ratios: { code: 1 }, maxPairs: {}, minPairs: { code: 50 } };
    const result = applyBalance(pairs, config);
    const minWarning = result.warnings.find((w) => w.includes("minimum"));
    assert.ok(minWarning, "Should warn when minPairs not met");
  });

  it("before/after stats computed correctly", () => {
    const pairs = [...makePairs("docs", 100), ...makePairs("code", 20)];
    const config: BalanceConfig = { ratios: { code: 3, docs: 1 }, maxPairs: {}, minPairs: {} };
    const result = applyBalance(pairs, config);
    assert.equal(result.before.docs!.pairs, 100);
    assert.equal(result.before.code!.pairs, 20);
    assert.ok(result.after.docs!.pairs < 100, "After should have fewer docs");
  });

  it("pct values are reasonable", () => {
    const pairs = [...makePairs("code", 30), ...makePairs("docs", 30)];
    const config: BalanceConfig = { ratios: { code: 1, docs: 1 }, maxPairs: {}, minPairs: {} };
    const result = applyBalance(pairs, config);
    const pctSum = Object.values(result.after).reduce((sum, s) => sum + s.pct, 0);
    assert.ok(pctSum >= 95 && pctSum <= 105, `Pct sum should be ~100, got ${pctSum}`);
  });
});

describe("assessTrainability", () => {
  it("<50 pairs → insufficient", () => {
    const pairs = makePairs("code", 30);
    const result = assessTrainability(pairs, {}, {});
    assert.equal(result, "insufficient");
  });

  it("50-199 pairs → marginal", () => {
    const pairs = makePairs("code", 100);
    const result = assessTrainability(pairs, {}, {});
    assert.equal(result, "marginal");
  });

  it(">=200 balanced pairs → good", () => {
    const pairs = makePairs("code", 250);
    const after: Record<string, SourceStats> = {
      code: { pairs: 250, tokens: 12500, pct: 100, avgQuality: 0.5 },
    };
    // 100% is >80% so this will be marginal. Need multiple sources.
    const mixed = [...makePairs("code", 150), ...makePairs("docs", 100)];
    const afterMixed: Record<string, SourceStats> = {
      code: { pairs: 150, tokens: 7500, pct: 60, avgQuality: 0.5 },
      docs: { pairs: 100, tokens: 5000, pct: 40, avgQuality: 0.5 },
    };
    const result = assessTrainability(mixed, afterMixed, {});
    assert.equal(result, "good");
  });

  it(">80% single source → marginal", () => {
    const pairs = makePairs("docs", 300);
    const after: Record<string, SourceStats> = {
      docs: { pairs: 300, tokens: 15000, pct: 90, avgQuality: 0.5 },
      code: { pairs: 30, tokens: 1500, pct: 10, avgQuality: 0.5 },
    };
    const result = assessTrainability([...pairs, ...makePairs("code", 30)], after, {});
    assert.equal(result, "marginal");
  });
});
