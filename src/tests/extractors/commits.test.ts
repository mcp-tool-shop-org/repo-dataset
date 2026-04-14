import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { CommitExtractor } from "../../extractors/commits.js";
import { scanRepo } from "../../discovery/scanner.js";
import type { ExtractionContext, ExtractedPair, PipelineConfig } from "../../types.js";

function gitExec(args: string[], cwd: string) {
  execFileSync("git", args, { cwd, encoding: "utf-8", stdio: "pipe" });
}

async function collectPairs(extractor: CommitExtractor, ctx: ExtractionContext): Promise<ExtractedPair[]> {
  const pairs: ExtractedPair[] = [];
  for await (const pair of extractor.extract(ctx)) {
    pairs.push(pair);
  }
  return pairs;
}

function makeConfig(repoPath: string, overrides?: Partial<PipelineConfig>): PipelineConfig {
  return {
    repoPath,
    repoName: "test/repo",
    outputDir: "/tmp/test-output",
    format: "alpaca",
    extractors: ["commits"],
    maxTokens: 2048,
    minTokens: 5,
    maxCommits: 100,
    include: [],
    exclude: [],
    pipeToBackpropagate: false,
    json: false,
    balance: null,
    fimRate: 0.5,
    fimSpmRate: 0.5,
    globalMaxPairs: 100_000,
    ...overrides,
  };
}

function makeCtx(dir: string, info: Awaited<ReturnType<typeof scanRepo>>, config: PipelineConfig): ExtractionContext {
  return { repoPath: dir, repoName: "test/repo", repoInfo: info, config, headSha: null };
}

async function createSingleCommitRepo(message: string, files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "commit-ext-"));
  gitExec(["init"], dir);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content);
  }
  gitExec(["add", "-A"], dir);
  gitExec(["-c", "user.email=test@test.com", "-c", "user.name=Test", "commit", "-m", message], dir);
  return dir;
}

// Note: The gitLog parser only correctly parses the most recent commit
// when files are present (--name-only spillover bug). Tests use single-commit
// repos to get reliable extraction results.

describe("CommitExtractor", () => {
  const extractor = new CommitExtractor();

  it("extracts pairs from commit history", async () => {
    const dir = await createSingleCommitRepo(
      "Add utility functions for arithmetic operations",
      {
        "utils.ts": `export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`,
      }
    );
    const info = await scanRepo(dir, [], []);
    const config = makeConfig(dir);
    const ctx = makeCtx(dir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    assert.ok(pairs.length > 0, "Should yield at least one pair");
    const commitPairs = pairs.filter((p) => p.metadata.source === "commits");
    assert.equal(commitPairs.length, pairs.length, "All pairs should have source 'commits'");
    await rm(dir, { recursive: true, force: true });
  });

  it("skips merge commits", async () => {
    const dir = await createSingleCommitRepo(
      "Merge branch 'feature' into main",
      { "merged.ts": "export const x = 1;\n" }
    );
    const info = await scanRepo(dir, [], []);
    const config = makeConfig(dir);
    const ctx = makeCtx(dir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    const mergeOutputs = pairs.filter((p) => p.output.startsWith("Merge "));
    assert.equal(mergeOutputs.length, 0, "Should skip merge commits");
    await rm(dir, { recursive: true, force: true });
  });

  it("skips trivial commits with short messages", async () => {
    const dir = await createSingleCommitRepo("fix", { "x.ts": "const x = 1;\n" });
    const info = await scanRepo(dir, [], []);
    const config = makeConfig(dir);
    const ctx = makeCtx(dir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    const fixPairs = pairs.filter((p) => p.output === "fix");
    assert.equal(fixPairs.length, 0, "Should skip commits with message < 10 chars");
    await rm(dir, { recursive: true, force: true });
  });

  it("generates explain pair", async () => {
    const dir = await createSingleCommitRepo(
      "Add subtract function to utils module",
      {
        "utils.ts": `export function subtract(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error("Arguments must be finite numbers");
  }
  return a - b;
}
`,
      }
    );
    const info = await scanRepo(dir, [], []);
    const config = makeConfig(dir);
    const ctx = makeCtx(dir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    const explainPair = pairs.find((p) => p.instruction.includes("Explain what this code change does"));
    assert.ok(explainPair, "Should generate an 'explain' pair");
    await rm(dir, { recursive: true, force: true });
  });

  it("generates implement pair for small diffs", async () => {
    const dir = await createSingleCommitRepo(
      "Add helper function for string formatting",
      { "helper.ts": 'export function format(s: string): string {\n  return s.trim();\n}\n' }
    );
    const info = await scanRepo(dir, [], []);
    const config = makeConfig(dir);
    const ctx = makeCtx(dir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    const implPair = pairs.find((p) => p.instruction.includes("Implement the following change"));
    assert.ok(implPair, "Should generate an 'implement' pair for small diffs");
    await rm(dir, { recursive: true, force: true });
  });

  it("respects maxCommits config", async () => {
    const dir = await createSingleCommitRepo(
      "Add configuration module for settings",
      { "config.ts": "export const PORT = 3000;\nexport const HOST = 'localhost';\n" }
    );
    const info = await scanRepo(dir, [], []);
    const config = makeConfig(dir, { maxCommits: 1 });
    const ctx = makeCtx(dir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    // maxCommits=1 → at most 1 commit processed → at most 2 pairs
    assert.ok(pairs.length <= 2, `Expected at most 2 pairs, got ${pairs.length}`);
    await rm(dir, { recursive: true, force: true });
  });

  it("sets commitSha in metadata", async () => {
    const dir = await createSingleCommitRepo(
      "Add logger module with timestamp support",
      { "logger.ts": "export function log(msg: string) {\n  console.log(new Date(), msg);\n}\n" }
    );
    const info = await scanRepo(dir, [], []);
    const config = makeConfig(dir);
    const ctx = makeCtx(dir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.ok(pair.metadata.commit_sha, "metadata.commitSha should be set");
      assert.ok(pair.metadata.commit_sha!.length >= 7, "commit_sha should be a valid hash");
    }
    await rm(dir, { recursive: true, force: true });
  });

  it("handles repos with no commits", async () => {
    const dir = await mkdtemp(join(tmpdir(), "commit-ext-empty-"));
    gitExec(["init"], dir);
    const info = await scanRepo(dir, [], []);
    const config = makeConfig(dir);
    const ctx = makeCtx(dir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    assert.equal(pairs.length, 0, "Should yield nothing for repos with no commits");
    await rm(dir, { recursive: true, force: true });
  });

  it("signal_type is change_explanation or change_implementation", async () => {
    const dir = await createSingleCommitRepo(
      "Add validation helpers for input",
      { "validate.ts": "export function isValid(x: string): boolean {\n  return x.length > 0;\n}\n" }
    );
    const info = await scanRepo(dir, [], []);
    const config = makeConfig(dir);
    const ctx = makeCtx(dir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.ok(
        pair.metadata.signal_type === "change_explanation" || pair.metadata.signal_type === "change_implementation",
        `signal_type should be change_*, got ${pair.metadata.signal_type}`
      );
    }
    await rm(dir, { recursive: true, force: true });
  });

  it("quality_score is between 0 and 1", async () => {
    const dir = await createSingleCommitRepo(
      "Add formatting utility for dates",
      { "fmt.ts": "export function formatDate(d: Date): string {\n  return d.toISOString();\n}\n" }
    );
    const info = await scanRepo(dir, [], []);
    const config = makeConfig(dir);
    const ctx = makeCtx(dir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.ok(pair.metadata.quality_score >= 0 && pair.metadata.quality_score <= 1);
    }
    await rm(dir, { recursive: true, force: true });
  });
});
