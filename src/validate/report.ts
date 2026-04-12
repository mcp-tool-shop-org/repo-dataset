/** Validate command — reads JSONL, runs all validation tiers, outputs report */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { validateStructural, type StructuralResult } from "./structural.js";
import { validateDistribution, type DistributionResult, type ParsedPair } from "./distribution.js";
import { validateContent, type ContentResult } from "./content.js";
import { computeScore, type ValidationScore } from "./scoring.js";
import { estimateTokens } from "../pipeline/tokens.js";

export interface ValidationReport {
  totalPairs: number;
  totalTokens: number;
  structural: StructuralResult;
  distribution: DistributionResult;
  content: ContentResult;
  scoring: ValidationScore;
}

export async function runValidation(jsonlPath: string): Promise<ValidationReport> {
  // Step 1: Structural check
  const structural = await validateStructural(jsonlPath);

  // Step 2: Parse all pairs for distribution + content checks
  const pairs: ParsedPair[] = [];
  const files = new Set<string>();

  const rl = createInterface({ input: createReadStream(jsonlPath, "utf-8") });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      const text = parsed.text || parsed.output || "";
      const instruction = parsed.instruction || "";
      const tokens = parsed.metadata?.tokens || estimateTokens(text || instruction);
      const source = parsed.metadata?.source || "unknown";
      const signalType = parsed.metadata?.signal_type || null;
      const file = parsed.metadata?.file;

      pairs.push({ tokens, source, signalType, text, instruction });
      if (file) files.add(file);
    } catch {
      // Skip unparseable lines (already counted in structural)
    }
  }

  // Step 3: Distribution validation
  const distribution = validateDistribution(pairs);

  // Step 4: Content validation
  const content = validateContent(pairs, files);

  // Step 5: Scoring
  const totalTokens = pairs.reduce((sum, p) => sum + p.tokens, 0);
  const scoring = computeScore(structural, distribution, content, pairs.length);

  return {
    totalPairs: pairs.length,
    totalTokens,
    structural,
    distribution,
    content,
    scoring,
  };
}
