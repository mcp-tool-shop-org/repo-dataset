/** Scoring — composite score + letter grade */

import type { StructuralResult } from "./structural.js";
import type { DistributionResult } from "./distribution.js";
import type { ContentResult } from "./content.js";
import type { ContaminationResult } from "./contamination.js";

export interface ValidationScore {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  trainability: "good" | "marginal" | "insufficient";
  contaminationPenalty: number;
}

export function computeScore(
  structural: StructuralResult,
  distribution: DistributionResult,
  content: ContentResult,
  totalPairs: number,
  contamination?: ContaminationResult,
): ValidationScore {
  let score = 0;

  // Structural integrity: 20% (binary)
  score += structural.pass ? 20 : 0;

  // Source balance entropy: 20%
  const entropyRatio = distribution.sourceEntropyMax > 0
    ? distribution.sourceEntropy / distribution.sourceEntropyMax
    : 0;
  score += Math.round(entropyRatio * 20);

  // Content quality composite: 30%
  let contentScore = 0;
  if (content.exactDuplicates === 0) contentScore += 5;
  if (content.nearDuplicatePct < 5) contentScore += 7;
  else if (content.nearDuplicatePct < 15) contentScore += 3;
  if (content.vocabularyTTR > 0.15) contentScore += 6;
  else if (content.vocabularyTTR > 0.08) contentScore += 3;
  if (content.instructionDiversityPct > 40) contentScore += 6;
  else if (content.instructionDiversityPct > 20) contentScore += 3;
  if (content.trivialPairPct < 5) contentScore += 6;
  else if (content.trivialPairPct < 15) contentScore += 3;
  score += contentScore;

  // Length distribution health: 15%
  const { cv, p10, p90 } = distribution.tokenStats;
  let lengthScore = 0;
  if (cv >= 0.3 && cv <= 1.5) lengthScore += 8;
  else if (cv >= 0.2 && cv <= 2.0) lengthScore += 4;
  if (p10 > 30) lengthScore += 4;
  if (p90 < 1500) lengthScore += 3;
  score += lengthScore;

  // Pair count bonus: 15% (log-scaled)
  const pairScore = Math.min(15, Math.round(Math.log2(Math.max(totalPairs, 1)) / Math.log2(1000) * 15));
  score += pairScore;

  // Contamination penalty: -10 per secret, -5 per PII, -15 per benchmark leak
  const contaminationPenalty = contamination?.scorePenalty ?? 0;
  score += contaminationPenalty;

  // Clamp
  score = Math.min(100, Math.max(0, score));

  // Grade
  let grade: "A" | "B" | "C" | "D" | "F";
  if (score >= 90) grade = "A";
  else if (score >= 75) grade = "B";
  else if (score >= 60) grade = "C";
  else if (score >= 40) grade = "D";
  else grade = "F";

  // Trainability
  let trainability: "good" | "marginal" | "insufficient";
  if (totalPairs < 50) trainability = "insufficient";
  else if (totalPairs < 200 || grade === "D" || grade === "F") trainability = "marginal";
  else trainability = "good";

  return { score, grade, trainability, contaminationPenalty };
}
