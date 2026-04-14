import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { DocsExtractor } from "../../extractors/docs.js";
import { scanRepo } from "../../discovery/scanner.js";
import type { ExtractionContext, ExtractedPair, PipelineConfig } from "../../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Point at src fixture (dist copy has compiled .js, no .md files)
const FIXTURE = resolve(__dirname, "..", "..", "..", "src", "tests", "fixtures", "sample-repo");

async function collectPairs(extractor: DocsExtractor, ctx: ExtractionContext): Promise<ExtractedPair[]> {
  const pairs: ExtractedPair[] = [];
  for await (const pair of extractor.extract(ctx)) {
    pairs.push(pair);
  }
  return pairs;
}

function makeConfig(overrides?: Partial<PipelineConfig>): PipelineConfig {
  return {
    repoPath: FIXTURE,
    repoName: "sample-repo",
    outputDir: "/tmp/test-output",
    format: "alpaca",
    extractors: ["docs"],
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

function makeCtx(repoPath: string, repoInfo: Awaited<ReturnType<typeof scanRepo>>, config: PipelineConfig): ExtractionContext {
  return { repoPath, repoName: config.repoName, repoInfo, config, headSha: null };
}

describe("DocsExtractor", () => {
  const extractor = new DocsExtractor();
  let ctx: ExtractionContext;

  before(async () => {
    const config = makeConfig();
    const repoInfo = await scanRepo(FIXTURE, [], []);
    ctx = makeCtx(FIXTURE, repoInfo, config);
  });

  it("extracts sections from markdown", async () => {
    const pairs = await collectPairs(extractor, ctx);
    assert.ok(pairs.length >= 3, `Expected >= 3 doc pairs, got ${pairs.length}`);
  });

  it("uses heading as instruction", async () => {
    const pairs = await collectPairs(extractor, ctx);
    const installPair = pairs.find((p) => p.instruction.includes("Installation"));
    assert.ok(installPair, "Should find a pair with 'Installation' heading");
  });

  it("sets source as docs", async () => {
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.equal(pair.metadata.source, "docs");
    }
  });

  it("processes multiple doc files", async () => {
    const pairs = await collectPairs(extractor, ctx);
    const files = new Set(pairs.map((p) => p.metadata.file));
    assert.ok(files.size >= 2, `Should process multiple doc files, got files from: ${[...files].join(", ")}`);
  });

  it("skips sections below minTokens", async () => {
    const config = makeConfig({ minTokens: 500 });
    const repoInfo = await scanRepo(FIXTURE, [], []);
    const restrictedCtx = makeCtx(FIXTURE, repoInfo, config);
    const pairs = await collectPairs(extractor, restrictedCtx);
    assert.equal(pairs.length, 0, "Should skip all sections below 500 tokens");
  });

  it("handles read errors", async () => {
    const repoInfo = await scanRepo(FIXTURE, [], []);
    repoInfo.docFiles.push({
      path: join(FIXTURE, "nonexistent.md"),
      relativePath: "nonexistent.md",
      language: "markdown",
      size: 100,
    });
    const config = makeConfig();
    const badCtx = makeCtx(FIXTURE, repoInfo, config);
    const pairs = await collectPairs(extractor, badCtx);
    assert.ok(true, "Should not throw on read error");
  });

  it("sets extractor_type to docs:section", async () => {
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.equal(pair.metadata.extractor_type, "docs:section");
    }
  });

  it("sets line_start and line_end", async () => {
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.ok(pair.metadata.line_start !== null, "line_start should be set");
      assert.ok(pair.metadata.line_end !== null, "line_end should be set");
    }
  });

  it("signal_type is documentation", async () => {
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.equal(pair.metadata.signal_type, "documentation");
    }
  });

  it("quality_score is between 0 and 1", async () => {
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.ok(pair.metadata.quality_score >= 0 && pair.metadata.quality_score <= 1);
    }
  });
});

describe("DocsExtractor — no headings", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "docs-ext-noheading-"));
    await writeFile(
      join(tempDir, "plain.md"),
      "This is a plain text markdown file.\nIt has no headings at all.\nJust paragraphs of text with enough content to pass token threshold."
    );
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("handles files with no headings", async () => {
    const extractor = new DocsExtractor();
    const info = await scanRepo(tempDir, [], []);
    const config = makeConfig({ repoPath: tempDir, minTokens: 5 });
    const ctx = makeCtx(tempDir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    assert.ok(pairs.length >= 1, "Should produce at least one pair for no-heading content");
    assert.ok(pairs[0].instruction.includes("Explain"), "Instruction should be an explanation prompt");
  });
});

describe("DocsExtractor — empty sections", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "docs-ext-empty-"));
    await writeFile(
      join(tempDir, "sparse.md"),
      "# Title\n\nSome intro content here.\n\n## Empty Section\n\n## Another Empty\n\n## Real Section\n\nThis section has real meaningful content that should pass the token threshold."
    );
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("skips empty sections", async () => {
    const extractor = new DocsExtractor();
    const info = await scanRepo(tempDir, [], []);
    const config = makeConfig({ repoPath: tempDir, minTokens: 5 });
    const ctx = makeCtx(tempDir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    const emptyPairs = pairs.filter(
      (p) => p.instruction.includes("Empty Section") || p.instruction.includes("Another Empty")
    );
    assert.equal(emptyPairs.length, 0, "Should skip empty sections");
  });
});
