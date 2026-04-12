import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "../pipeline/chunker.js";

describe("chunkText", () => {
  it("returns single chunk for short text when overlap is 0", () => {
    const text = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
    const chunks = chunkText(text, 1000, 0);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].text, text);
  });

  it("splits long text into multiple chunks", () => {
    // Each line is ~8 chars, so ~2 tokens. 100 lines ≈ 200 tokens.
    const text = Array.from({ length: 100 }, (_, i) => `line ${i.toString().padStart(3, "0")}`).join("\n");
    const chunks = chunkText(text, 50);
    assert.ok(chunks.length > 1, `Expected multiple chunks, got ${chunks.length}`);
  });

  it("chunks respect maxTokens", () => {
    const text = Array.from({ length: 100 }, (_, i) => `line ${i.toString().padStart(3, "0")}`).join("\n");
    const maxTokens = 50;
    const chunks = chunkText(text, maxTokens);
    for (const chunk of chunks) {
      assert.ok(chunk.tokens <= maxTokens, `Chunk has ${chunk.tokens} tokens, expected <= ${maxTokens}`);
    }
  });

  it("chunks have correct line numbers", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const text = lines.join("\n");
    const chunks = chunkText(text, 1000);
    assert.equal(chunks[0].startLine, 0);
    assert.equal(chunks[0].endLine, 19);
  });

  it("overlap creates shared content between consecutive chunks", () => {
    // Create lines long enough that we get multiple chunks
    const text = Array.from({ length: 80 }, (_, i) => `this is line number ${i} with some padding text`).join("\n");
    const overlapLines = 3;
    const chunks = chunkText(text, 40, overlapLines);
    if (chunks.length >= 2) {
      // With overlap, the end of chunk N should overlap with the start of chunk N+1
      const firstEnd = chunks[0].endLine;
      const secondStart = chunks[1].startLine;
      assert.ok(secondStart <= firstEnd, `Expected overlap: chunk[0] ends at ${firstEnd}, chunk[1] starts at ${secondStart}`);
    }
  });

  it("returns empty array for empty text", () => {
    const chunks = chunkText("", 1000);
    assert.equal(chunks.length, 0);
  });

  it("handles single line text", () => {
    const chunks = chunkText("hello world", 1000);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].text, "hello world");
    assert.equal(chunks[0].startLine, 0);
    assert.equal(chunks[0].endLine, 0);
  });
});
