/** Commit extractor — generates explain/implement pairs from git history */

import { createHash } from "node:crypto";
import { gitLog, gitDiff } from "../discovery/git.js";
import { estimateTokens } from "../pipeline/tokens.js";
import type { Extractor, ExtractedPair, ExtractionContext, PairMetadata } from "../types.js";

const EXTRACTOR_VERSION = "0.2.0";

export class CommitExtractor implements Extractor {
  name = "commits" as const;
  description = "Extracts change explanation and implementation pairs from commit history";

  async *extract(ctx: ExtractionContext): AsyncIterable<ExtractedPair> {
    const commits = await gitLog(ctx.repoPath, ctx.config.maxCommits);

    for (const commit of commits) {
      if (commit.message.startsWith("Merge ")) continue;
      if (commit.message.length < 10) continue;

      const diff = await gitDiff(ctx.repoPath, commit.sha);
      if (!diff) continue;

      const trimmedDiff = trimDiff(diff, ctx.config.maxTokens);
      const tokens = estimateTokens(trimmedDiff);
      if (tokens < ctx.config.minTokens || tokens > ctx.config.maxTokens) continue;

      const baseId = createHash("sha256").update(commit.sha).digest("hex").slice(0, 16);

      // Pair 1: "Explain this change" + diff → commit message
      const explainMeta: PairMetadata = {
        id: `${baseId}-explain`,
        source: "commits",
        repo_name: ctx.repoName,
        file: commit.files[0] || null,
        language: null,
        commit_sha: commit.sha,
        line_start: null,
        line_end: null,
        extractor_type: "commits:explain",
        extractor_version: EXTRACTOR_VERSION,
        extracted_at: new Date().toISOString(),
        tokens,
        char_count: trimmedDiff.length,
        has_docstring: false,
        has_tests: false,
        complexity: "medium",
        quality_score: scoreCommit(commit, tokens),
        signal_type: "change_explanation",
      };

      yield {
        instruction: "Explain what this code change does and why it was made",
        input: trimmedDiff,
        output: commit.message,
        metadata: explainMeta,
      };

      // Pair 2: "Implement this" + commit message → diff
      if (tokens <= ctx.config.maxTokens / 2) {
        yield {
          instruction: `Implement the following change: ${commit.message}`,
          input: `Files affected: ${commit.files.join(", ")}`,
          output: trimmedDiff,
          metadata: {
            ...explainMeta,
            id: `${baseId}-implement`,
            extractor_type: "commits:implement",
            signal_type: "change_implementation",
          },
        };
      }
    }
  }
}

function scoreCommit(commit: { message: string; files: string[] }, tokens: number): number {
  let score = 0.3;

  // Longer message = more descriptive
  if (commit.message.length > 50) score += 0.2;
  if (commit.message.length > 100) score += 0.1;

  // Reasonable diff size
  if (tokens >= 50 && tokens <= 500) score += 0.2;

  // Touches few files (focused change)
  if (commit.files.length <= 5) score += 0.1;
  if (commit.files.length === 1) score += 0.1;

  return Math.min(score, 1.0);
}

function trimDiff(diff: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (diff.length <= maxChars) return diff;

  const lines = diff.split("\n");
  const result: string[] = [];
  let charCount = 0;

  for (const line of lines) {
    if (charCount + line.length > maxChars) {
      result.push("... (diff truncated)");
      break;
    }
    result.push(line);
    charCount += line.length + 1;
  }

  return result.join("\n");
}
