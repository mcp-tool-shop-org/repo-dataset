/** Distribution validation — length stats, entropy, source balance */

import { estimateTokens } from "../pipeline/tokens.js";

export interface DistributionResult {
  pass: boolean;
  tokenStats: { mean: number; median: number; stddev: number; cv: number; p10: number; p25: number; p50: number; p75: number; p90: number };
  sourceBalance: Record<string, number>;
  sourceEntropy: number;
  sourceEntropyMax: number;
  signalTypes: Record<string, number>;
  signalEntropy: number;
  signalEntropyMax: number;
  dominantSource: string | null;
}

export function validateDistribution(pairs: ParsedPair[]): DistributionResult {
  // Token lengths
  const lengths = pairs.map((p) => p.tokens);
  lengths.sort((a, b) => a - b);

  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const median = lengths[Math.floor(lengths.length / 2)];
  const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length;
  const stddev = Math.sqrt(variance);
  const cv = mean > 0 ? stddev / mean : 0;

  const p10 = percentile(lengths, 10);
  const p25 = percentile(lengths, 25);
  const p50 = percentile(lengths, 50);
  const p75 = percentile(lengths, 75);
  const p90 = percentile(lengths, 90);

  // Source balance
  const sourceCounts: Record<string, number> = {};
  for (const p of pairs) {
    sourceCounts[p.source] = (sourceCounts[p.source] || 0) + 1;
  }
  const sourceBalance: Record<string, number> = {};
  for (const [src, count] of Object.entries(sourceCounts)) {
    sourceBalance[src] = Math.round((count / pairs.length) * 100) / 100;
  }

  // Source entropy
  const sourceProbs = Object.values(sourceCounts).map((c) => c / pairs.length);
  const sourceEntropy = shannonEntropy(sourceProbs);
  const sourceEntropyMax = Math.log2(Object.keys(sourceCounts).length) || 1;

  // Signal types
  const signalCounts: Record<string, number> = {};
  for (const p of pairs) {
    if (p.signalType) signalCounts[p.signalType] = (signalCounts[p.signalType] || 0) + 1;
  }
  const signalProbs = Object.values(signalCounts).map((c) => c / pairs.length);
  const signalEntropy = shannonEntropy(signalProbs);
  const signalEntropyMax = Math.log2(Object.keys(signalCounts).length) || 1;

  // Dominant source
  let dominantSource: string | null = null;
  for (const [src, pct] of Object.entries(sourceBalance)) {
    if (pct > 0.6) dominantSource = src;
  }

  // Pass conditions
  const pass = cv >= 0.3 && cv <= 2.0 && p10 > 20 && p90 < 2000 && !dominantSource;

  return {
    pass,
    tokenStats: { mean: Math.round(mean), median, stddev: Math.round(stddev), cv: Math.round(cv * 100) / 100, p10, p25, p50, p75, p90 },
    sourceBalance,
    sourceEntropy: Math.round(sourceEntropy * 100) / 100,
    sourceEntropyMax: Math.round(sourceEntropyMax * 100) / 100,
    signalTypes: signalCounts,
    signalEntropy: Math.round(signalEntropy * 100) / 100,
    signalEntropyMax: Math.round(signalEntropyMax * 100) / 100,
    dominantSource,
  };
}

export interface ParsedPair {
  tokens: number;
  source: string;
  signalType: string | null;
  text: string;
  instruction: string;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function shannonEntropy(probs: number[]): number {
  let h = 0;
  for (const p of probs) {
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}
