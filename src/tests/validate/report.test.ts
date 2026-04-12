import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runValidation } from "../../validate/report.js";

describe("runValidation", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "validate-report-"));
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns all sections", async () => {
    const file = join(tempDir, "report.jsonl");
    const lines = Array.from({ length: 20 }, (_, i) =>
      JSON.stringify({
        instruction: `Explain function ${i} with unique context about module ${i}`,
        input: `export function fn${i}() { return ${i}; }`,
        output: `This function returns the number ${i} as a constant value for configuration purposes in module ${i}`,
        metadata: { source: "code", tokens: 50 + i * 5, signal_type: "explanation", file: `src/fn${i}.ts` },
      })
    ).join("\n");
    await writeFile(file, lines);

    const report = await runValidation(file);
    assert.ok(report.structural, "Should have structural section");
    assert.ok(report.distribution, "Should have distribution section");
    assert.ok(report.content, "Should have content section");
    assert.ok(report.scoring, "Should have scoring section");
  });

  it("totalPairs matches line count", async () => {
    const file = join(tempDir, "count.jsonl");
    const n = 15;
    const lines = Array.from({ length: n }, (_, i) =>
      JSON.stringify({
        instruction: `q${i}`, input: `c${i}`, output: `a${i}`,
        metadata: { source: "code", tokens: 50, signal_type: "explanation" },
      })
    ).join("\n");
    await writeFile(file, lines);
    const report = await runValidation(file);
    assert.equal(report.totalPairs, n);
  });

  it("totalTokens is sum of pair tokens", async () => {
    const file = join(tempDir, "tokens.jsonl");
    const lines = Array.from({ length: 5 }, (_, i) =>
      JSON.stringify({
        instruction: `q${i}`, input: `c${i}`, output: `a${i}`,
        metadata: { source: "code", tokens: 100, signal_type: "explanation" },
      })
    ).join("\n");
    await writeFile(file, lines);
    const report = await runValidation(file);
    assert.equal(report.totalTokens, 500);
  });

  it("scoring.grade is set", async () => {
    const file = join(tempDir, "grade.jsonl");
    const lines = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({
        instruction: `q${i}`, input: `c${i}`, output: `a${i}`,
        metadata: { source: "code", tokens: 50, signal_type: "explanation" },
      })
    ).join("\n");
    await writeFile(file, lines);
    const report = await runValidation(file);
    assert.ok(["A", "B", "C", "D", "F"].includes(report.scoring.grade));
  });

  it("empty file returns 0 pairs", async () => {
    const file = join(tempDir, "empty.jsonl");
    await writeFile(file, "");
    const report = await runValidation(file);
    assert.equal(report.totalPairs, 0);
  });
});
