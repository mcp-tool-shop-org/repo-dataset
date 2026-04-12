import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CompletionFormatter } from "../formatters/completion.js";
import type { ExtractedPair, PairMetadata } from "../types.js";

function makeMeta(overrides?: Partial<PairMetadata>): PairMetadata {
  return {
    id: "test", source: "code", repo_name: "test", file: "main.ts", language: "typescript",
    commit_sha: null, line_start: 1, line_end: 10,
    extractor_type: "code:function", extractor_version: "0.2.0",
    extracted_at: new Date().toISOString(),
    tokens: 50, char_count: 200, has_docstring: false, has_tests: false,
    complexity: "low", quality_score: 0.5, signal_type: "explanation",
    ...overrides,
  };
}

describe("CompletionFormatter", () => {
  const formatter = new CompletionFormatter();

  it("implementation signal uses input as text", () => {
    const pair: ExtractedPair = {
      instruction: "",
      input: "export function add(a, b) { return a + b; }",
      output: "",
      metadata: makeMeta({ signal_type: "implementation" }),
    };
    const parsed = JSON.parse(formatter.formatPair(pair));
    assert.equal(parsed.text, pair.input);
  });

  it("non-code signal concatenates all fields", () => {
    const pair: ExtractedPair = {
      instruction: "Explain this section",
      input: "From: README.md",
      output: "This section describes installation.",
      metadata: makeMeta({ signal_type: "documentation", source: "docs" }),
    };
    const parsed = JSON.parse(formatter.formatPair(pair));
    assert.ok(parsed.text.includes("Explain this section"));
    assert.ok(parsed.text.includes("This section describes installation."));
  });

  it("includes metadata", () => {
    const pair: ExtractedPair = {
      instruction: "", input: "const x = 1;", output: "",
      metadata: makeMeta({ signal_type: "implementation" }),
    };
    const parsed = JSON.parse(formatter.formatPair(pair));
    assert.ok(parsed.metadata, "Should include metadata");
    assert.equal(parsed.metadata.source, "code");
  });

  it("handles empty instruction", () => {
    const pair: ExtractedPair = {
      instruction: "", input: "code here", output: "",
      metadata: makeMeta({ signal_type: "implementation" }),
    };
    assert.doesNotThrow(() => formatter.formatPair(pair));
    const parsed = JSON.parse(formatter.formatPair(pair));
    assert.equal(parsed.text, "code here");
  });
});
