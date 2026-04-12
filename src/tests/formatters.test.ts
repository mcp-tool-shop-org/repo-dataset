import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AlpacaFormatter } from "../formatters/alpaca.js";
import { ShareGPTFormatter } from "../formatters/sharegpt.js";
import { OpenAIFormatter } from "../formatters/openai.js";
import { RawFormatter } from "../formatters/raw.js";
import type { ExtractedPair } from "../types.js";

const samplePair: ExtractedPair = {
  instruction: "Explain this function",
  input: "function add(a, b) { return a + b; }",
  output: "This function adds two numbers and returns the result.",
  metadata: {
    id: "test", source: "code", repo_name: "test", file: "math.js", language: "javascript",
    commit_sha: null, line_start: 1, line_end: 1,
    extractor_type: "code:function", extractor_version: "0.2.0",
    extracted_at: new Date().toISOString(),
    tokens: 30, char_count: 100, has_docstring: false, has_tests: false,
    complexity: "low", quality_score: 0.5, signal_type: "explanation",
  },
};

describe("AlpacaFormatter", () => {
  it("produces valid Alpaca JSONL", () => {
    const formatter = new AlpacaFormatter();
    const line = formatter.formatPair(samplePair);
    const parsed = JSON.parse(line);
    assert.equal(parsed.instruction, "Explain this function");
    assert.equal(parsed.input, "function add(a, b) { return a + b; }");
    assert.ok(parsed.output.includes("adds two numbers"));
  });
});

describe("ShareGPTFormatter", () => {
  it("produces valid ShareGPT JSONL", () => {
    const formatter = new ShareGPTFormatter();
    const line = formatter.formatPair(samplePair);
    const parsed = JSON.parse(line);
    assert.ok(Array.isArray(parsed.conversations));
    assert.equal(parsed.conversations.length, 2);
    assert.equal(parsed.conversations[0].from, "human");
    assert.equal(parsed.conversations[1].from, "gpt");
  });
});

describe("OpenAIFormatter", () => {
  it("produces valid OpenAI messages JSONL", () => {
    const formatter = new OpenAIFormatter();
    const line = formatter.formatPair(samplePair);
    const parsed = JSON.parse(line);
    assert.ok(Array.isArray(parsed.messages));
    assert.equal(parsed.messages[0].role, "user");
    assert.equal(parsed.messages[1].role, "assistant");
  });
});

describe("RawFormatter", () => {
  it("produces text + metadata", () => {
    const formatter = new RawFormatter();
    const line = formatter.formatPair(samplePair);
    const parsed = JSON.parse(line);
    assert.ok(typeof parsed.text === "string");
    assert.ok(parsed.text.includes("Explain this function"));
    assert.equal(parsed.metadata.source, "code");
    assert.equal(parsed.metadata.language, "javascript");
  });
});
