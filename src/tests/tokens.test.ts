import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimateTokens } from "../pipeline/tokens.js";

describe("estimateTokens", () => {
  it("estimates tokens as chars / 4", () => {
    assert.equal(estimateTokens("hello"), 2); // 5 / 4 = ceil(1.25) = 2
  });

  it("returns 0 for empty string", () => {
    assert.equal(estimateTokens(""), 0);
  });

  it("handles longer text", () => {
    const text = "a".repeat(100);
    assert.equal(estimateTokens(text), 25); // 100 / 4 = 25
  });

  it("rounds up", () => {
    assert.equal(estimateTokens("abc"), 1); // 3 / 4 = ceil(0.75) = 1
  });
});
