import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Deduplicator } from "../pipeline/dedup.js";
import type { ExtractedPair } from "../types.js";

function makePair(instruction: string, input: string, output: string): ExtractedPair {
  return {
    instruction,
    input,
    output,
    metadata: { source: "code", tokens: 10 },
  };
}

describe("Deduplicator", () => {
  it("allows first occurrence", () => {
    const dedup = new Deduplicator();
    const pair = makePair("explain", "code here", "explanation");
    assert.equal(dedup.isDuplicate(pair), false);
  });

  it("detects exact duplicates", () => {
    const dedup = new Deduplicator();
    const pair = makePair("explain", "code here", "explanation");
    dedup.isDuplicate(pair); // first time
    assert.equal(dedup.isDuplicate(pair), true); // second time
  });

  it("allows different content", () => {
    const dedup = new Deduplicator();
    const pair1 = makePair("explain", "code A", "answer A");
    const pair2 = makePair("explain", "code B", "answer B");
    assert.equal(dedup.isDuplicate(pair1), false);
    assert.equal(dedup.isDuplicate(pair2), false);
  });

  it("tracks count", () => {
    const dedup = new Deduplicator();
    dedup.isDuplicate(makePair("a", "b", "c"));
    dedup.isDuplicate(makePair("d", "e", "f"));
    assert.equal(dedup.count, 2);
  });
});
