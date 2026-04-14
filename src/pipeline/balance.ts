/** Balance system — reservoir sampling with ratio-based weighting */

import type { ExtractedPair, BalanceConfig, ExtractorName, SourceStats } from "../types.js";

export interface BalanceResult {
  pairs: ExtractedPair[];
  before: Record<string, SourceStats>;
  after: Record<string, SourceStats>;
  warnings: string[];
  trainability: "good" | "marginal" | "insufficient";
}

const AUTO_BALANCE_RATIOS: Record<ExtractorName, number> = {
  code: 3,
  tests: 2,
  commits: 1,
  docs: 1,
  config: 1,
};

export function getAutoBalanceConfig(): BalanceConfig {
  return { ratios: AUTO_BALANCE_RATIOS, maxPairs: {}, minPairs: {} };
}

export function applyBalance(
  pairs: ExtractedPair[],
  config: BalanceConfig
): BalanceResult {
  // Bucket pairs by source
  const buckets: Record<string, ExtractedPair[]> = {};
  for (const pair of pairs) {
    const src = pair.metadata.source;
    if (!buckets[src]) buckets[src] = [];
    buckets[src].push(pair);
  }

  // Compute "before" stats
  const totalPairsBefore = pairs.length;
  const before: Record<string, SourceStats> = {};
  for (const [src, bucket] of Object.entries(buckets)) {
    const tokens = bucket.reduce((sum, p) => sum + p.metadata.tokens, 0);
    const avgQuality = bucket.reduce((sum, p) => sum + p.metadata.quality_score, 0) / bucket.length;
    before[src] = {
      pairs: bucket.length,
      tokens,
      pct: Math.round((bucket.length / totalPairsBefore) * 100),
      avgQuality: Math.round(avgQuality * 100) / 100,
    };
  }

  // Compute ratio-based targets
  const ratios = config.ratios;
  const ratioSum = Object.values(ratios).reduce((a, b) => a + (b || 0), 0) || 1;

  // Strategy: for each source, compute ideal share then cap
  const result: ExtractedPair[] = [];
  const after: Record<string, SourceStats> = {};

  for (const [src, bucket] of Object.entries(buckets)) {
    const ratio = ratios[src as ExtractorName] || 1;
    const idealShare = ratio / ratioSum;

    // Sort by quality_score descending (take the best if we must trim)
    const sorted = [...bucket].sort((a, b) => b.metadata.quality_score - a.metadata.quality_score);

    // Compute target count: ideal share of total available pairs
    // But capped by what's actually available
    let targetCount = Math.ceil(totalPairsBefore * idealShare);

    // Apply hard cap
    const maxCap = config.maxPairs[src as ExtractorName];
    if (maxCap !== undefined && targetCount > maxCap) {
      targetCount = maxCap;
    }

    // Can't take more than available
    const taken = sorted.slice(0, Math.min(targetCount, sorted.length));
    result.push(...taken);

    const tokens = taken.reduce((sum, p) => sum + p.metadata.tokens, 0);
    const avgQuality = taken.length > 0
      ? taken.reduce((sum, p) => sum + p.metadata.quality_score, 0) / taken.length
      : 0;
    after[src] = {
      pairs: taken.length,
      tokens,
      pct: 0, // computed below
      avgQuality: Math.round(avgQuality * 100) / 100,
    };
  }

  // Compute percentage after balance
  const totalAfter = result.length;
  for (const stats of Object.values(after)) {
    stats.pct = totalAfter > 0 ? Math.round((stats.pairs / totalAfter) * 100) : 0;
  }

  // Check min floors and generate warnings
  const warnings: string[] = [];
  for (const [src, minRequired] of Object.entries(config.minPairs)) {
    const actual = after[src]?.pairs || 0;
    if (minRequired !== undefined && actual < minRequired) {
      warnings.push(`${src}: only ${actual} pairs available (minimum ${minRequired} requested)`);
    }
  }

  // Trainability assessment
  const trainability = assessTrainability(result, after, before);
  if (trainability !== "good") {
    warnings.push(...getTrainabilityWarnings(result, after, before));
  }

  return { pairs: result, before, after, warnings, trainability };
}

export function assessTrainability(
  pairs: ExtractedPair[],
  after: Record<string, SourceStats>,
  before: Record<string, SourceStats>
): "good" | "marginal" | "insufficient" {
  if (pairs.length < 50) return "insufficient";
  if (pairs.length < 200) return "marginal";

  // Check for extreme dominance
  for (const stats of Object.values(after)) {
    if (stats.pct > 80) return "marginal";
  }

  return "good";
}

function getTrainabilityWarnings(
  pairs: ExtractedPair[],
  after: Record<string, SourceStats>,
  before: Record<string, SourceStats>
): string[] {
  const warnings: string[] = [];

  if (pairs.length < 50) {
    warnings.push(`Only ${pairs.length} pairs — too few for meaningful fine-tuning`);
  } else if (pairs.length < 200) {
    warnings.push(`Only ${pairs.length} pairs — marginal for fine-tuning`);
  }

  for (const [src, stats] of Object.entries(before)) {
    if (stats.pct > 80) {
      warnings.push(`${src} dominance: ${stats.pct}% of pairs (recommend --balance or --auto-balance)`);
    }
  }

  const avgTokens = pairs.length > 0
    ? pairs.reduce((sum, p) => sum + p.metadata.tokens, 0) / pairs.length
    : 0;
  if (avgTokens < 30) warnings.push(`Average tokens/pair too low: ${Math.round(avgTokens)}`);
  if (avgTokens > 1000) warnings.push(`Average tokens/pair high: ${Math.round(avgTokens)} (may need truncation for LoRA)`);

  return warnings;
}
