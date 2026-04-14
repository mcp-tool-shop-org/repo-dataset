import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { TestExtractor } from "../../extractors/tests.js";
import { scanRepo } from "../../discovery/scanner.js";
import type { ExtractionContext, ExtractedPair, PipelineConfig } from "../../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Point at src fixture (dist copy has compiled .js, no .md files)
const FIXTURE = resolve(__dirname, "..", "..", "..", "src", "tests", "fixtures", "sample-repo");

async function collectPairs(extractor: TestExtractor, ctx: ExtractionContext): Promise<ExtractedPair[]> {
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
    extractors: ["tests"],
    maxTokens: 4096,
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

describe("TestExtractor", () => {
  const extractor = new TestExtractor();
  let ctx: ExtractionContext;

  before(async () => {
    const config = makeConfig();
    const repoInfo = await scanRepo(FIXTURE, [], []);
    ctx = makeCtx(FIXTURE, repoInfo, config);
  });

  it("pairs test with source file", async () => {
    const pairs = await collectPairs(extractor, ctx);
    assert.ok(pairs.length > 0, "Should yield at least one pair");
    const writePair = pairs.find((p) => p.instruction.includes("Write tests"));
    assert.ok(writePair, "Should generate a 'Write tests' pair");
    assert.ok(writePair.input.includes("utils"), "Input should reference source file");
  });

  it("generates 'write tests' pair", async () => {
    const pairs = await collectPairs(extractor, ctx);
    const writePair = pairs.find((p) => p.instruction.includes("Write tests"));
    assert.ok(writePair, "Should have a 'Write tests' instruction");
    assert.ok(writePair.output.length > 0, "Output should have test code content");
  });

  it("generates reverse 'what code' pair", async () => {
    const pairs = await collectPairs(extractor, ctx);
    const reversePair = pairs.find((p) => p.instruction.includes("What source code is being tested"));
    assert.ok(reversePair, "Should generate a reverse pair");
    assert.ok(reversePair.output.includes("function") || reversePair.output.includes("export"), "Output should be source code");
  });

  it("sets correct metadata", async () => {
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.equal(pair.metadata.source, "tests");
      assert.ok(pair.metadata.file, "metadata.file should be set");
      assert.ok(pair.metadata.language, "metadata.language should be set");
      assert.ok(typeof pair.metadata.tokens === "number" && pair.metadata.tokens > 0);
    }
  });

  it("skips pairs exceeding maxTokens", async () => {
    const config = makeConfig({ maxTokens: 10 });
    const repoInfo = await scanRepo(FIXTURE, [], []);
    const restrictedCtx = makeCtx(FIXTURE, repoInfo, config);
    const pairs = await collectPairs(extractor, restrictedCtx);
    assert.equal(pairs.length, 0, "Should skip all pairs exceeding 10 tokens");
  });

  it("write pair has extractor_type tests:write", async () => {
    const pairs = await collectPairs(extractor, ctx);
    const writePair = pairs.find((p) => p.instruction.includes("Write tests"));
    assert.ok(writePair);
    assert.equal(writePair.metadata.extractor_type, "tests:write");
  });

  it("reverse pair has extractor_type tests:reverse", async () => {
    const pairs = await collectPairs(extractor, ctx);
    const revPair = pairs.find((p) => p.instruction.includes("What source code"));
    if (revPair) {
      assert.equal(revPair.metadata.extractor_type, "tests:reverse");
      assert.equal(revPair.metadata.signal_type, "implementation");
    }
  });

  it("has_tests is true on test pairs", async () => {
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.equal(pair.metadata.has_tests, true);
    }
  });

  it("quality_score is between 0 and 1", async () => {
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.ok(pair.metadata.quality_score >= 0 && pair.metadata.quality_score <= 1);
    }
  });
});

describe("TestExtractor — naming conventions", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "test-ext-naming-"));
    await mkdir(join(tempDir, "src"), { recursive: true });
    await mkdir(join(tempDir, "tests"), { recursive: true });

    const sourceContent = "export function hello() {\n  return 'hello';\n}\n";
    const testContent = "import { hello } from '../src/hello.js';\ndescribe('hello', () => {\n  it('works', () => {});\n});\n";

    await writeFile(join(tempDir, "src", "hello.ts"), sourceContent);
    await writeFile(join(tempDir, "tests", "hello.test.ts"), testContent);
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("handles .test.ts naming convention", async () => {
    const extractor = new TestExtractor();
    const info = await scanRepo(tempDir, [], []);
    const config = makeConfig({ repoPath: tempDir });
    const ctx = makeCtx(tempDir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    assert.ok(pairs.length > 0, "Should pair hello.test.ts with hello.ts");
  });
});

describe("TestExtractor — no match", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "test-ext-nomatch-"));
    await mkdir(join(tempDir, "tests"), { recursive: true });
    await writeFile(
      join(tempDir, "tests", "orphan.test.ts"),
      "describe('orphan', () => { it('has no source', () => {}); });"
    );
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns nothing when no match found", async () => {
    const extractor = new TestExtractor();
    const info = await scanRepo(tempDir, [], []);
    const config = makeConfig({ repoPath: tempDir });
    const ctx = makeCtx(tempDir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    assert.equal(pairs.length, 0, "Should yield nothing when no source file matches");
  });
});
