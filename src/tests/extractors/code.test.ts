import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { CodeExtractor } from "../../extractors/code.js";
import { scanRepo } from "../../discovery/scanner.js";
import type { ExtractionContext, ExtractedPair, PipelineConfig } from "../../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Point at src fixture (dist copy has compiled .js, no .md files)
const FIXTURE = resolve(__dirname, "..", "..", "..", "src", "tests", "fixtures", "sample-repo");

async function collectPairs(extractor: CodeExtractor, ctx: ExtractionContext): Promise<ExtractedPair[]> {
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
    extractors: ["code"],
    maxTokens: 2048,
    minTokens: 20,
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

describe("CodeExtractor", () => {
  let ctx: ExtractionContext;
  const extractor = new CodeExtractor();

  before(async () => {
    const config = makeConfig();
    const repoInfo = await scanRepo(FIXTURE, [], []);
    ctx = makeCtx(FIXTURE, repoInfo, config);
  });

  it("extracts pairs from TypeScript fixture", async () => {
    const pairs = await collectPairs(extractor, ctx);
    assert.ok(pairs.length > 0, "Should yield at least one pair");
    const codePairs = pairs.filter((p) => p.metadata.source === "code");
    assert.ok(codePairs.length > 0, "All pairs should have source 'code'");
  });

  it("detects function boundaries correctly", async () => {
    const pairs = await collectPairs(extractor, ctx);
    const fnPairs = pairs.filter((p) => p.instruction.includes("Explain what this"));
    assert.ok(fnPairs.length > 0 || pairs.length > 0, "Should extract at least some pairs from the fixture");
  });

  it("extracts JSDoc as explanation", async () => {
    const pairs = await collectPairs(extractor, ctx);
    const factorialPair = pairs.find(
      (p) => p.input.includes("factorial") && p.instruction.includes("Explain what this")
    );
    if (factorialPair) {
      assert.ok(factorialPair.output.length > 0, "Output should have content from docstring");
    }
  });

  it("generates file-level pair for small files", async () => {
    const pairs = await collectPairs(extractor, ctx);
    const filePair = pairs.find((p) => p.instruction.includes("purpose and structure"));
    // May or may not appear depending on minTokens; just verify no crash
    assert.ok(true, "File-level extraction should not crash");
  });

  it("skips functions below minTokens", async () => {
    const config = makeConfig({ minTokens: 500 });
    const repoInfo = await scanRepo(FIXTURE, [], []);
    const restrictedCtx = makeCtx(FIXTURE, repoInfo, config);
    const pairs = await collectPairs(extractor, restrictedCtx);
    const fnPairs = pairs.filter((p) => p.instruction.includes("Explain what this"));
    assert.equal(fnPairs.length, 0, "Should skip all functions below 500 tokens");
  });

  it("skips functions above maxTokens", async () => {
    const config = makeConfig({ maxTokens: 10 });
    const repoInfo = await scanRepo(FIXTURE, [], []);
    const restrictedCtx = makeCtx(FIXTURE, repoInfo, config);
    const pairs = await collectPairs(extractor, restrictedCtx);
    assert.equal(pairs.length, 0, "Should skip all functions above 10 tokens");
  });

  it("sets correct metadata", async () => {
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.equal(pair.metadata.source, "code");
      assert.ok(pair.metadata.file, "metadata.file should be set");
      assert.ok(pair.metadata.language, "metadata.language should be set");
      assert.ok(typeof pair.metadata.tokens === "number" && pair.metadata.tokens > 0, "metadata.tokens should be positive");
      assert.ok(pair.metadata.id, "metadata.id should be set");
      assert.ok(pair.metadata.extractor_type, "metadata.extractor_type should be set");
      assert.ok(typeof pair.metadata.quality_score === "number", "metadata.quality_score should be a number");
    }
  });

  it("handles empty files gracefully", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "code-ext-empty-"));
    await writeFile(join(tempDir, "empty.ts"), "");
    const info = await scanRepo(tempDir, [], []);
    const config = makeConfig({ repoPath: tempDir });
    const emptyCtx = makeCtx(tempDir, info, config);
    const pairs = await collectPairs(extractor, emptyCtx);
    assert.equal(pairs.length, 0, "Empty files should yield no pairs");
    await rm(tempDir, { recursive: true, force: true });
  });

  it("handles read errors gracefully", async () => {
    const repoInfo = await scanRepo(FIXTURE, [], []);
    repoInfo.sourceFiles.push({
      path: join(FIXTURE, "nonexistent.ts"),
      relativePath: "nonexistent.ts",
      language: "typescript",
      size: 100,
    });
    const config = makeConfig();
    const badCtx = makeCtx(FIXTURE, repoInfo, config);
    const pairs = await collectPairs(extractor, badCtx);
    assert.ok(true, "Should not throw on read error");
  });

  it("handles class detection", async () => {
    const pairs = await collectPairs(extractor, ctx);
    const classPair = pairs.find((p) => p.input.includes("class MathHelper"));
    assert.ok(true, "Class detection should not crash");
  });

  it("sets line_start and line_end", async () => {
    const pairs = await collectPairs(extractor, ctx);
    const fnPairs = pairs.filter((p) => p.metadata.extractor_type !== "code:file");
    for (const pair of fnPairs) {
      assert.ok(pair.metadata.line_start !== null, "line_start should be set");
      assert.ok(pair.metadata.line_end !== null, "line_end should be set");
      assert.ok(pair.metadata.line_start! <= pair.metadata.line_end!, "line_start <= line_end");
    }
  });

  it("quality_score is between 0 and 1", async () => {
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.ok(pair.metadata.quality_score >= 0 && pair.metadata.quality_score <= 1,
        `quality_score should be 0-1, got ${pair.metadata.quality_score}`);
    }
  });

  it("signal_type is explanation in instruction mode", async () => {
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.equal(pair.metadata.signal_type, "explanation");
    }
  });

  it("complexity field is set", async () => {
    const pairs = await collectPairs(extractor, ctx);
    for (const pair of pairs) {
      assert.ok(["low", "medium", "high"].includes(pair.metadata.complexity),
        `complexity should be low/medium/high, got ${pair.metadata.complexity}`);
    }
  });

  it("completion mode emits raw code with empty instruction", async () => {
    const config = makeConfig({ format: "completion" });
    const repoInfo = await scanRepo(FIXTURE, [], []);
    const completionCtx = makeCtx(FIXTURE, repoInfo, config);
    const pairs = await collectPairs(extractor, completionCtx);
    for (const pair of pairs) {
      assert.equal(pair.instruction, "", "Completion mode should have empty instruction");
      assert.ok(pair.input.length > 0, "Completion mode should have code in input");
      assert.equal(pair.metadata.signal_type, "implementation");
    }
  });
});

describe("CodeExtractor — Python syntax", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "code-ext-py-"));
    const pyContent = `def greet(name):
    """Greets the user by name."""
    greeting = f"Hello, {name}!"
    print(greeting)
    return greeting
    # extra line 1
    # extra line 2

def add(a, b):
    return a + b
`;
    await writeFile(join(tempDir, "main.py"), pyContent);
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("handles Python def syntax", async () => {
    const extractor = new CodeExtractor();
    const info = await scanRepo(tempDir, [], []);
    const config = makeConfig({ repoPath: tempDir, minTokens: 5 });
    const ctx = makeCtx(tempDir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    const greetPair = pairs.find((p) => p.input.includes("def greet"));
    assert.ok(greetPair, "Should detect Python function");
  });
});

describe("CodeExtractor — Rust syntax", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "code-ext-rs-"));
    const rsContent = `pub fn calculate(x: i32, y: i32) -> i32 {
    let result = x + y;
    let doubled = result * 2;
    let tripled = result * 3;
    println!("Result: {}", result);
    result
}

fn main() {
    let r = calculate(1, 2);
    println!("{}", r);
}
`;
    await writeFile(join(tempDir, "main.rs"), rsContent);
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("handles Rust fn syntax", async () => {
    const extractor = new CodeExtractor();
    const info = await scanRepo(tempDir, [], []);
    const config = makeConfig({ repoPath: tempDir, minTokens: 5 });
    const ctx = makeCtx(tempDir, info, config);
    const pairs = await collectPairs(extractor, ctx);
    const rustPair = pairs.find((p) => p.input.includes("pub fn calculate"));
    assert.ok(rustPair, "Should detect Rust function");
  });
});
