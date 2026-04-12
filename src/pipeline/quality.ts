/** Quality filters — token bounds, empty rejection, repetition check */

import { estimateTokens } from "./tokens.js";
import type { ExtractedPair, PipelineConfig } from "../types.js";

export function passesQuality(pair: ExtractedPair, config: PipelineConfig): boolean {
  // Reject empty fields
  if (!pair.instruction.trim()) return false;
  if (!pair.output.trim()) return false;

  // Token bounds
  const totalTokens = estimateTokens(
    `${pair.instruction} ${pair.input} ${pair.output}`
  );
  if (totalTokens < config.minTokens) return false;
  if (totalTokens > config.maxTokens) return false;

  // Reject excessive repetition (>50% repeated lines)
  if (hasExcessiveRepetition(pair.output)) return false;
  if (pair.input && hasExcessiveRepetition(pair.input)) return false;

  return true;
}

function hasExcessiveRepetition(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 5) return false;

  const counts = new Map<string, number>();
  for (const line of lines) {
    const trimmed = line.trim();
    counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
  }

  const maxRepeat = Math.max(...counts.values());
  return maxRepeat / lines.length > 0.5;
}
