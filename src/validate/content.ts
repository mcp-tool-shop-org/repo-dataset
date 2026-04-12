/** Content validation — near-dedup, vocabulary richness, instruction diversity, trivial detection */

import type { ParsedPair } from "./distribution.js";

export interface ContentResult {
  pass: boolean;
  exactDuplicates: number;
  nearDuplicatePct: number;
  vocabularyTTR: number;
  instructionDiversityPct: number;
  trivialPairPct: number;
  uniqueSourceFiles: number;
}

export function validateContent(pairs: ParsedPair[], files: Set<string>): ContentResult {
  const n = pairs.length;
  if (n === 0) return { pass: false, exactDuplicates: 0, nearDuplicatePct: 0, vocabularyTTR: 0, instructionDiversityPct: 0, trivialPairPct: 0, uniqueSourceFiles: 0 };

  // Exact duplicates (by text content hash)
  const seen = new Set<string>();
  let exactDuplicates = 0;
  for (const p of pairs) {
    const key = p.text || p.instruction;
    if (seen.has(key)) exactDuplicates++;
    else seen.add(key);
  }

  // Near-duplicate detection via 10-gram overlap
  const nearDupPairs = detect10gramOverlap(pairs);
  const nearDuplicatePct = Math.round((nearDupPairs / n) * 100 * 10) / 10;

  // Vocabulary richness (Type-Token Ratio on sample)
  const sample = pairs.slice(0, Math.min(1000, n));
  const allWords = sample.flatMap((p) => (p.text || "").split(/\s+/).filter(Boolean));
  const uniqueWords = new Set(allWords);
  const vocabularyTTR = allWords.length > 0
    ? Math.round((uniqueWords.size / allWords.length) * 100) / 100
    : 0;

  // Instruction diversity (unique first-10-word prefixes)
  const prefixes = new Set<string>();
  for (const p of pairs) {
    if (p.instruction) {
      const prefix = p.instruction.split(/\s+/).slice(0, 10).join(" ");
      prefixes.add(prefix);
    }
  }
  const instructionsWithContent = pairs.filter((p) => p.instruction).length;
  const instructionDiversityPct = instructionsWithContent > 0
    ? Math.round((prefixes.size / instructionsWithContent) * 100)
    : 100; // completion format has no instructions, that's fine

  // Trivial pair detection (output restates input with <20 novel tokens)
  let trivialCount = 0;
  for (const p of pairs) {
    if (isTrivialPair(p)) trivialCount++;
  }
  const trivialPairPct = Math.round((trivialCount / n) * 100 * 10) / 10;

  const pass = exactDuplicates === 0 &&
    nearDuplicatePct < 15 &&
    vocabularyTTR > 0.08 &&
    instructionDiversityPct > 20 &&
    trivialPairPct < 15;

  return {
    pass,
    exactDuplicates,
    nearDuplicatePct,
    vocabularyTTR,
    instructionDiversityPct,
    trivialPairPct,
    uniqueSourceFiles: files.size,
  };
}

/** Detect pairs that share 10-grams with other pairs */
function detect10gramOverlap(pairs: ParsedPair[]): number {
  const ngramIndex = new Map<string, number>(); // ngram → first pair index
  let overlapCount = 0;
  const flagged = new Set<number>();

  for (let i = 0; i < pairs.length; i++) {
    const text = pairs[i].text || pairs[i].instruction;
    const words = text.split(/\s+/);
    if (words.length < 10) continue;

    let pairFlagged = false;
    for (let j = 0; j <= words.length - 10; j += 5) { // stride 5 for performance
      const ngram = words.slice(j, j + 10).join(" ");
      const existing = ngramIndex.get(ngram);
      if (existing !== undefined && existing !== i && !pairFlagged) {
        overlapCount++;
        pairFlagged = true;
        flagged.add(i);
      } else if (!ngramIndex.has(ngram)) {
        ngramIndex.set(ngram, i);
      }
    }
  }

  return overlapCount;
}

/** A pair is trivial if output adds fewer than 20 novel words beyond the instruction */
function isTrivialPair(pair: ParsedPair): boolean {
  if (!pair.instruction || !pair.text) return false;

  const instructionWords = new Set(pair.instruction.toLowerCase().split(/\s+/));
  const outputWords = (pair.text).toLowerCase().split(/\s+/);

  let novelTokens = 0;
  for (const w of outputWords) {
    if (!instructionWords.has(w) && w.length > 2) novelTokens++;
  }

  // Trivial if output is short AND doesn't add much
  return novelTokens < 20 && outputWords.length < instructionWords.size * 2;
}
