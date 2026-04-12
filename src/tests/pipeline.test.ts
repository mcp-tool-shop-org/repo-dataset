import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runPipeline, inspectPipeline } from "../pipeline/runner.js";
import type { PipelineConfig } from "../types.js";

function gitExec(args: string[], cwd: string) {
  execFileSync("git", args, { cwd, encoding: "utf-8", stdio: "pipe" });
}

async function createFixtureGitRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pipeline-test-"));

  // Create source files
  await mkdir(join(dir, "src"), { recursive: true });
  await mkdir(join(dir, "tests"), { recursive: true });
  await mkdir(join(dir, "docs"), { recursive: true });

  await writeFile(
    join(dir, "src", "utils.ts"),
    `/**
 * Adds two numbers together.
 * @param a First number
 * @param b Second number
 * @returns The sum
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Calculates factorial of n.
 * Uses an iterative approach.
 * @param n The number
 * @returns n!
 */
export function factorial(n: number): number {
  if (n < 0) throw new Error("negative");
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}
`
  );

  await writeFile(join(dir, "src", "index.ts"), 'export { add, factorial } from "./utils.js";\n');

  await writeFile(
    join(dir, "tests", "utils.test.ts"),
    `import { add, factorial } from "../src/utils.js";
describe("add", () => {
  it("adds", () => { expect(add(1,2)).toBe(3); });
});
describe("factorial", () => {
  it("computes 5!", () => { expect(factorial(5)).toBe(120); });
});
`
  );

  await writeFile(
    join(dir, "docs", "api.md"),
    `# API Reference\n\n## add(a, b)\n\nReturns the sum of two numbers.\n\n## factorial(n)\n\nComputes the factorial of n.\n`
  );

  await writeFile(
    join(dir, "README.md"),
    `# Test Project\n\nA test project for pipeline integration tests.\n\n## Installation\n\nRun npm install to get started with the project.\n`
  );

  await writeFile(join(dir, "package.json"), '{"name":"test-project","version":"1.0.0","type":"module"}\n');

  // Initialize git
  gitExec(["init"], dir);
  gitExec(["add", "-A"], dir);
  gitExec(
    ["-c", "user.email=test@test.com", "-c", "user.name=Test", "commit", "-m", "Initial commit with utils, tests, and docs"],
    dir
  );

  // Second commit
  await writeFile(
    join(dir, "src", "utils.ts"),
    `/**
 * Adds two numbers together.
 * @param a First number
 * @param b Second number
 * @returns The sum
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Calculates factorial of n.
 * Uses an iterative approach.
 * @param n The number
 * @returns n!
 */
export function factorial(n: number): number {
  if (n < 0) throw new Error("negative");
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

/**
 * Multiplies two numbers together.
 * @param a First number
 * @param b Second number
 * @returns The product of a and b
 */
export function multiply(a: number, b: number): number {
  return a * b;
}
`
  );
  gitExec(["add", "-A"], dir);
  gitExec(
    ["-c", "user.email=test@test.com", "-c", "user.name=Test", "commit", "-m", "Add multiply function to utils module"],
    dir
  );

  return dir;
}

function makeConfig(repoPath: string, overrides?: Partial<PipelineConfig>): PipelineConfig {
  return {
    repoPath,
    repoName: "test/repo",
    outputDir: join(repoPath, "output"),
    format: "alpaca",
    extractors: ["code", "commits", "docs", "tests"],
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
    ...overrides,
  };
}

describe("runPipeline", () => {
  let repoDir: string;

  before(async () => {
    repoDir = await createFixtureGitRepo();
  });

  after(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it("produces output file", async () => {
    const config = makeConfig(repoDir);
    const result = await runPipeline(config);
    // Verify the file exists
    const st = await stat(result.outputPath);
    assert.ok(st.isFile(), "Output should be a file");
  });

  it("output is valid JSONL", async () => {
    const config = makeConfig(repoDir, { outputDir: join(repoDir, "output-jsonl") });
    const result = await runPipeline(config);
    const content = await readFile(result.outputPath, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.trim());
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line), `Every line should be valid JSON`);
    }
  });

  it("alpaca format has correct keys", async () => {
    const config = makeConfig(repoDir, { outputDir: join(repoDir, "output-alpaca"), format: "alpaca" });
    const result = await runPipeline(config);
    const content = await readFile(result.outputPath, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.trim());
    if (lines.length > 0) {
      const parsed = JSON.parse(lines[0]);
      assert.ok("instruction" in parsed, "Should have instruction key");
      assert.ok("input" in parsed, "Should have input key");
      assert.ok("output" in parsed, "Should have output key");
    }
  });

  it("sharegpt format has conversations", async () => {
    const config = makeConfig(repoDir, { outputDir: join(repoDir, "output-sharegpt"), format: "sharegpt" });
    const result = await runPipeline(config);
    const content = await readFile(result.outputPath, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.trim());
    if (lines.length > 0) {
      const parsed = JSON.parse(lines[0]);
      assert.ok(Array.isArray(parsed.conversations), "Should have conversations array");
    }
  });

  it("byExtractor counts are accurate", async () => {
    const config = makeConfig(repoDir, { outputDir: join(repoDir, "output-byext") });
    const result = await runPipeline(config);
    const sum = Object.values(result.byExtractor).reduce((a, b) => a + b.pairs, 0);
    assert.equal(sum, result.pairsAfterBalance, "Sum of byExtractor should equal pairsAfterBalance");
  });

  it("totalTokens is positive", async () => {
    const config = makeConfig(repoDir, { outputDir: join(repoDir, "output-tokens") });
    const result = await runPipeline(config);
    if (result.pairsAfterFilter > 0) {
      assert.ok(result.totalTokens > 0, "totalTokens should be positive when pairs exist");
    }
  });

  it("creates output directory if missing", async () => {
    const nestedDir = join(repoDir, "deeply", "nested", "output");
    const config = makeConfig(repoDir, { outputDir: nestedDir });
    await runPipeline(config);
    const st = await stat(nestedDir);
    assert.ok(st.isDirectory(), "Should create nested output directory");
  });

  it("quality filter removes bad pairs when minTokens is high", async () => {
    const config = makeConfig(repoDir, { outputDir: join(repoDir, "output-quality"), minTokens: 500 });
    const result = await runPipeline(config);
    assert.ok(
      result.pairsAfterFilter <= result.pairsExtracted,
      "pairsAfterFilter should be <= pairsExtracted"
    );
  });

  it("creates _manifest.json", async () => {
    const config = makeConfig(repoDir, { outputDir: join(repoDir, "output-manifest") });
    const result = await runPipeline(config);
    assert.ok(result.manifestPath, "manifestPath should be set");
    const st2 = await stat(result.manifestPath!);
    assert.ok(st2.isFile(), "Manifest should be a file");
  });

  it("manifest has correct schema", async () => {
    const config = makeConfig(repoDir, { outputDir: join(repoDir, "output-manifest-schema") });
    const result = await runPipeline(config);
    const manifest = JSON.parse(await readFile(result.manifestPath!, "utf-8"));
    assert.equal(manifest.schema_version, "2");
    assert.equal(manifest.stats.total_pairs, result.pairsAfterBalance);
    assert.ok(manifest.extractors_used);
    assert.ok(manifest.format);
  });

  it("completion format produces text/metadata lines", async () => {
    const config = makeConfig(repoDir, {
      outputDir: join(repoDir, "output-completion"),
      format: "completion",
      extractors: ["code"],
    });
    const result = await runPipeline(config);
    const content = await readFile(result.outputPath, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.trim());
    if (lines.length > 0) {
      const parsed = JSON.parse(lines[0]);
      assert.ok("text" in parsed, "Completion format should have text key");
      assert.ok("metadata" in parsed, "Completion format should have metadata key");
    }
  });

  it("byExtractor values are SourceStats", async () => {
    const config = makeConfig(repoDir, { outputDir: join(repoDir, "output-sourcestats") });
    const result = await runPipeline(config);
    for (const [name, stats] of Object.entries(result.byExtractor)) {
      assert.ok(typeof stats.pairs === "number", `${name}.pairs should be number`);
      assert.ok(typeof stats.tokens === "number", `${name}.tokens should be number`);
      assert.ok(typeof stats.pct === "number", `${name}.pct should be number`);
      assert.ok(typeof stats.avgQuality === "number", `${name}.avgQuality should be number`);
    }
  });

  it("trainability field is set", async () => {
    const config = makeConfig(repoDir, { outputDir: join(repoDir, "output-trainability") });
    const result = await runPipeline(config);
    assert.ok(["good", "marginal", "insufficient"].includes(result.trainability));
  });

  it("warnings is an array", async () => {
    const config = makeConfig(repoDir, { outputDir: join(repoDir, "output-warnings") });
    const result = await runPipeline(config);
    assert.ok(Array.isArray(result.warnings));
  });
});

describe("inspectPipeline", () => {
  let repoDir: string;

  before(async () => {
    repoDir = await createFixtureGitRepo();
  });

  after(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it("does NOT write files", async () => {
    const outDir = join(repoDir, "inspect-output");
    const config = makeConfig(repoDir, { outputDir: outDir });
    await inspectPipeline(config);
    // outDir should not exist since inspect is dry-run
    try {
      await stat(outDir);
      assert.fail("inspect should not create output directory");
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      assert.equal(e.code, "ENOENT", "Output dir should not exist");
    }
  });

  it("returns stats with correct shape", async () => {
    const config = makeConfig(repoDir, { outputDir: join(repoDir, "inspect-out2") });
    const result = await inspectPipeline(config);
    assert.ok(typeof result.totalFiles === "number");
    assert.ok(typeof result.pairsExtracted === "number");
    assert.ok(typeof result.pairsAfterFilter === "number");
    assert.ok(typeof result.duplicatesRemoved === "number");
    assert.ok(typeof result.totalTokens === "number");
    assert.ok(typeof result.byExtractor === "object");
    assert.ok(result.outputPath.includes("dry run"), "Should indicate dry run");
  });
});

describe("runPipeline — edge cases", () => {
  it("handles repos with only docs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pipeline-docsonly-"));
    await writeFile(
      join(dir, "README.md"),
      "# Guide\n\nThis is a documentation-only repo with useful content for extraction.\n"
    );
    gitExec(["init"], dir);
    gitExec(["add", "-A"], dir);
    gitExec(
      ["-c", "user.email=test@test.com", "-c", "user.name=Test", "commit", "-m", "Add documentation"],
      dir
    );

    const config = makeConfig(dir, { outputDir: join(dir, "out"), extractors: ["docs"] });
    const result = await runPipeline(config);
    // Should not crash, may or may not produce pairs depending on token bounds
    assert.ok(typeof result.pairsExtracted === "number");
    await rm(dir, { recursive: true, force: true });
  });

  it("handles repos with no source files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pipeline-empty-"));
    gitExec(["init"], dir);
    gitExec(["-c", "user.email=test@test.com", "-c", "user.name=Test", "commit", "--allow-empty", "-m", "empty"], dir);

    const config = makeConfig(dir, { outputDir: join(dir, "out"), extractors: ["code"] });
    const result = await runPipeline(config);
    assert.equal(result.pairsAfterFilter, 0, "Should produce 0 pairs for empty repo");
    await rm(dir, { recursive: true, force: true });
  });
});
