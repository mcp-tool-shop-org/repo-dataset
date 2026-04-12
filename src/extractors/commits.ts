/** Commit extractor — generates explain/implement pairs from git history */

import { gitLog, gitDiff } from "../discovery/git.js";
import { estimateTokens } from "../pipeline/tokens.js";
import type { Extractor, ExtractedPair, ExtractionContext } from "../types.js";

export class CommitExtractor implements Extractor {
  name = "commits" as const;
  description = "Extracts change explanation and implementation pairs from commit history";

  async *extract(ctx: ExtractionContext): AsyncIterable<ExtractedPair> {
    const commits = await gitLog(ctx.repoPath, ctx.config.maxCommits);

    for (const commit of commits) {
      // Skip merge commits and trivial commits
      if (commit.message.startsWith("Merge ")) continue;
      if (commit.message.length < 10) continue;

      const diff = await gitDiff(ctx.repoPath, commit.sha);
      if (!diff) continue;

      // Trim diff to reasonable size
      const trimmedDiff = trimDiff(diff, ctx.config.maxTokens);
      const tokens = estimateTokens(trimmedDiff);
      if (tokens < ctx.config.minTokens || tokens > ctx.config.maxTokens) continue;

      // Pair 1: "Explain this change" + diff → commit message
      yield {
        instruction: "Explain what this code change does and why it was made",
        input: trimmedDiff,
        output: commit.message,
        metadata: {
          source: "commits",
          commitSha: commit.sha,
          tokens,
        },
      };

      // Pair 2: "Implement this" + commit message → diff (reversed)
      if (tokens <= ctx.config.maxTokens / 2) {
        yield {
          instruction: `Implement the following change: ${commit.message}`,
          input: `Files affected: ${commit.files.join(", ")}`,
          output: trimmedDiff,
          metadata: {
            source: "commits",
            commitSha: commit.sha,
            tokens,
          },
        };
      }
    }
  }
}

function trimDiff(diff: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (diff.length <= maxChars) return diff;

  // Keep the header and first portion
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
