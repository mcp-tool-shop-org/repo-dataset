import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimateTokens } from "../pipeline/tokens.js";

describe("estimateTokens", () => {
  it("estimates tokens with default ratio (3.8)", () => {
    assert.equal(estimateTokens("hello"), 2); // 5 / 3.8 = ceil(1.32) = 2
  });

  it("returns 0 for empty string", () => {
    assert.equal(estimateTokens(""), 0);
  });

  it("handles longer text", () => {
    const text = "a".repeat(100);
    assert.equal(estimateTokens(text), 27); // 100 / 3.8 = ceil(26.32) = 27
  });

  it("rounds up", () => {
    assert.equal(estimateTokens("abc"), 1); // 3 / 3.8 = ceil(0.79) = 1
  });

  it("uses language-specific ratio for python", () => {
    const text = "a".repeat(100);
    assert.equal(estimateTokens(text, "python"), 32); // 100 / 3.2 = ceil(31.25) = 32
  });

  it("uses language-specific ratio for rust", () => {
    const text = "a".repeat(100);
    assert.equal(estimateTokens(text, "rust"), 25); // 100 / 4.1 = ceil(24.39) = 25
  });

  it("falls back to default for unknown language", () => {
    const text = "a".repeat(100);
    assert.equal(estimateTokens(text, "brainfuck"), 27); // 100 / 3.8 = ceil(26.32) = 27
  });

  it("handles case-insensitive language names", () => {
    const text = "a".repeat(100);
    assert.equal(estimateTokens(text, "Python"), 32);
    assert.equal(estimateTokens(text, "RUST"), 25);
  });
});
