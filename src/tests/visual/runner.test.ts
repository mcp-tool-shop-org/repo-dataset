import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, stat, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runVisualPipeline, inspectVisualPipeline } from "../../visual/runner.js";
import type { VisualPipelineConfig } from "../../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VISUAL_FIXTURE = resolve(__dirname, "..", "..", "..", "src", "tests", "fixtures", "visual-corpus");

function makeVisualConfig(repoPath: string, overrides?: Partial<VisualPipelineConfig>): VisualPipelineConfig {
  return {
    repoPath,
    repoName: "test-visual-corpus",
    outputDir: join(repoPath, "output"),
    format: "visual_universal",
    extractors: ["asset_record", "comparison", "constitution"],
    generateSyntheticPairs: true,
    json: false,
    embed: false,
    allowIncomplete: true, // fixture stubs are tiny, won't validate as real images
    copyImages: false,
    minResolution: 0, // disable resolution filter for tiny test fixtures
    maxResolution: 99999,
    ...overrides,
  };
}

describe("runVisualPipeline", () => {
  let outDir: string;

  before(async () => {
    outDir = await mkdtemp(join(tmpdir(), "visual-runner-"));
  });

  after(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("creates output JSONL file", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: join(outDir, "run1") });
    const result = await runVisualPipeline(config);
    const st = await stat(result.outputPath);
    assert.ok(st.isFile());
  });

  it("creates manifest", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: join(outDir, "run2") });
    const result = await runVisualPipeline(config);
    assert.ok(result.manifestPath);
    const st = await stat(result.manifestPath!);
    assert.ok(st.isFile());
  });

  it("output JSONL: every line is valid JSON", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: join(outDir, "run3") });
    const result = await runVisualPipeline(config);
    const content = await readFile(result.outputPath, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.trim());
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line));
    }
  });

  it("manifest has correct fields", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: join(outDir, "run4") });
    const result = await runVisualPipeline(config);
    const manifest = JSON.parse(await readFile(result.manifestPath!, "utf-8"));
    assert.equal(manifest.schema_version, "3");
    assert.equal(manifest.mode, "visual");
    assert.equal(manifest.stats.total_units, result.totalTrainingUnits);
  });

  it("result.structureTier is perfect for fixture", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: join(outDir, "run5") });
    const result = await runVisualPipeline(config);
    assert.equal(result.structureTier, "perfect");
  });

  it("result.totalAssets is 6", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: join(outDir, "run6") });
    const result = await runVisualPipeline(config);
    assert.equal(result.totalAssets, 6);
  });

  it("result.classificationPairs > 0", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: join(outDir, "run7") });
    const result = await runVisualPipeline(config);
    assert.ok(result.classificationPairs > 0);
  });

  it("result.preferencePairs > 0", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: join(outDir, "run8") });
    const result = await runVisualPipeline(config);
    assert.ok(result.preferencePairs > 0);
  });

  it("result.critiquePairs > 0", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: join(outDir, "run9") });
    const result = await runVisualPipeline(config);
    assert.ok(result.critiquePairs > 0);
  });

  it("result.totalTrainingUnits > 0", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: join(outDir, "run10") });
    const result = await runVisualPipeline(config);
    assert.ok(result.totalTrainingUnits > 0);
  });

  it("with generateSyntheticPairs=false", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: join(outDir, "run11"), generateSyntheticPairs: false });
    const result = await runVisualPipeline(config);
    assert.equal(result.yield.syntheticComparisons, 0);
  });

  it("with generateSyntheticPairs=true", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: join(outDir, "run12"), generateSyntheticPairs: true });
    const result = await runVisualPipeline(config);
    assert.ok(result.yield.syntheticComparisons > 0);
  });

  it("DPO format: only preference units written", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: join(outDir, "run-dpo"), format: "visual_dpo" });
    const result = await runVisualPipeline(config);
    const content = await readFile(result.outputPath, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const parsed = JSON.parse(line);
      assert.ok(parsed.chosen, "DPO lines should have chosen");
      assert.ok(parsed.rejected, "DPO lines should have rejected");
    }
  });

  it("KTO format: only classify units written", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: join(outDir, "run-kto"), format: "visual_kto" });
    const result = await runVisualPipeline(config);
    const content = await readFile(result.outputPath, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const parsed = JSON.parse(line);
      assert.ok(parsed.label !== undefined, "KTO lines should have label");
    }
  });

  it("creates output directory if missing", async () => {
    const nested = join(outDir, "deep", "nested", "dir");
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: nested });
    await runVisualPipeline(config);
    const st = await stat(nested);
    assert.ok(st.isDirectory());
  });
});

describe("inspectVisualPipeline", () => {
  it("does NOT write files", async () => {
    const outDir = join(tmpdir(), "visual-inspect-" + Date.now());
    const config = makeVisualConfig(VISUAL_FIXTURE, { outputDir: outDir });
    await inspectVisualPipeline(config);
    try {
      await stat(outDir);
      assert.fail("inspect should not create output dir");
    } catch (err: unknown) {
      assert.equal((err as NodeJS.ErrnoException).code, "ENOENT");
    }
  });

  it("returns same stats shape as run", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE);
    const result = await inspectVisualPipeline(config);
    assert.ok(typeof result.totalTrainingUnits === "number");
    assert.ok(typeof result.classificationPairs === "number");
    assert.ok(typeof result.preferencePairs === "number");
    assert.ok(typeof result.critiquePairs === "number");
    assert.ok(result.totalTrainingUnits > 0);
  });

  it("trainability is set", async () => {
    const config = makeVisualConfig(VISUAL_FIXTURE);
    const result = await inspectVisualPipeline(config);
    assert.ok(["good", "marginal", "insufficient"].includes(result.trainability));
  });
});
