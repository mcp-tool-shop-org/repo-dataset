import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateStructural } from "../../validate/structural.js";

describe("validateStructural", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "validate-struct-"));
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("valid JSONL passes", async () => {
    const file = join(tempDir, "valid.jsonl");
    const lines = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({ instruction: `explain ${i}`, input: `code ${i}`, output: `answer ${i}` })
    ).join("\n");
    await writeFile(file, lines);
    const result = await validateStructural(file);
    assert.equal(result.validLines, result.totalLines);
    assert.equal(result.pass, true);
  });

  it("invalid JSON fails", async () => {
    const file = join(tempDir, "invalid.jsonl");
    await writeFile(file, "not json\n" + JSON.stringify({ instruction: "x", input: "y", output: "z" }) + "\n");
    const result = await validateStructural(file);
    assert.ok(result.validLines < result.totalLines);
  });

  it("empty fields detected", async () => {
    const file = join(tempDir, "empty-fields.jsonl");
    await writeFile(file, JSON.stringify({ instruction: "", input: "", output: "" }) + "\n");
    const result = await validateStructural(file);
    assert.ok(result.emptyFields > 0);
  });

  it("encoding errors detected", async () => {
    const file = join(tempDir, "encoding.jsonl");
    await writeFile(file, "line with \x00 null byte\n");
    const result = await validateStructural(file);
    assert.ok(result.encodingErrors > 0);
  });

  it("oversized lines detected", async () => {
    const file = join(tempDir, "oversized.jsonl");
    const huge = JSON.stringify({ text: "x".repeat(600_000) });
    await writeFile(file, huge + "\n");
    const result = await validateStructural(file);
    assert.ok(result.oversizedLines > 0);
  });

  it("blank lines are skipped", async () => {
    const file = join(tempDir, "blanks.jsonl");
    const valid = JSON.stringify({ instruction: "x", input: "y", output: "z" });
    await writeFile(file, valid + "\n\n" + valid + "\n\n");
    const result = await validateStructural(file);
    assert.equal(result.totalLines, 2, "Should count only non-blank lines");
  });

  it("completion format: empty text detected", async () => {
    const file = join(tempDir, "completion-empty.jsonl");
    await writeFile(file, JSON.stringify({ text: "" }) + "\n");
    const result = await validateStructural(file);
    assert.ok(result.emptyFields > 0);
  });

  it("completion format: valid text passes", async () => {
    const file = join(tempDir, "completion-valid.jsonl");
    await writeFile(file, JSON.stringify({ text: "hello world" }) + "\n");
    const result = await validateStructural(file);
    assert.equal(result.emptyFields, 0);
  });

  it("sharegpt format: empty conversations detected", async () => {
    const file = join(tempDir, "sharegpt-empty.jsonl");
    await writeFile(file, JSON.stringify({ conversations: [] }) + "\n");
    const result = await validateStructural(file);
    assert.ok(result.emptyFields > 0);
  });

  it("openai format: empty messages detected", async () => {
    const file = join(tempDir, "openai-empty.jsonl");
    await writeFile(file, JSON.stringify({ messages: [] }) + "\n");
    const result = await validateStructural(file);
    assert.ok(result.emptyFields > 0);
  });

  it("pass threshold: <5% empty passes", async () => {
    const file = join(tempDir, "threshold-pass.jsonl");
    const valid = Array.from({ length: 99 }, (_, i) =>
      JSON.stringify({ instruction: `q${i}`, input: `c${i}`, output: `a${i}` })
    );
    valid.push(JSON.stringify({ instruction: "", input: "", output: "" }));
    await writeFile(file, valid.join("\n"));
    const result = await validateStructural(file);
    assert.equal(result.pass, true, "1% empty should pass");
  });

  it("fail threshold: >5% empty fails", async () => {
    const file = join(tempDir, "threshold-fail.jsonl");
    const valid = Array.from({ length: 90 }, (_, i) =>
      JSON.stringify({ instruction: `q${i}`, input: `c${i}`, output: `a${i}` })
    );
    const empty = Array.from({ length: 10 }, () =>
      JSON.stringify({ instruction: "", input: "", output: "" })
    );
    await writeFile(file, [...valid, ...empty].join("\n"));
    const result = await validateStructural(file);
    assert.equal(result.pass, false, "10% empty should fail");
  });
});
