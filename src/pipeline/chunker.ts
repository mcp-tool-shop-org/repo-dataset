/** Text chunker — splits content at line boundaries with overlap */

import { estimateTokens } from "./tokens.js";

export interface Chunk {
  text: string;
  startLine: number;
  endLine: number;
  tokens: number;
}

export function chunkText(
  text: string,
  maxTokens: number,
  overlapLines: number = 3
): Chunk[] {
  const lines = text.split("\n");
  const chunks: Chunk[] = [];

  let startLine = 0;
  while (startLine < lines.length) {
    let endLine = startLine;
    let currentText = "";

    // Expand chunk until we hit token limit
    while (endLine < lines.length) {
      const candidate = currentText + (currentText ? "\n" : "") + lines[endLine];
      if (estimateTokens(candidate) > maxTokens && endLine > startLine) break;
      currentText = candidate;
      endLine++;
    }

    if (currentText.trim()) {
      chunks.push({
        text: currentText,
        startLine,
        endLine: endLine - 1,
        tokens: estimateTokens(currentText),
      });
    }

    // Move forward, accounting for overlap
    // If only one line was taken (oversized line), skip overlap to avoid degenerate chunks
    if (endLine === startLine + 1) {
      startLine = endLine;
    } else {
      startLine = Math.max(startLine + 1, endLine - overlapLines);
      if (startLine >= endLine) startLine = endLine;
    }
  }

  return chunks;
}
