import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getExtractors, getAllExtractorNames, isValidExtractor } from "../extractors/registry.js";
import { getFormatter, getAllFormats, isValidFormat } from "../formatters/registry.js";

describe("Extractor Registry", () => {
  it("getExtractors(['code']) returns array with CodeExtractor", () => {
    const extractors = getExtractors(["code"]);
    assert.equal(extractors.length, 1);
    assert.equal(extractors[0].name, "code");
  });

  it("getExtractors(['code','docs']) returns both", () => {
    const extractors = getExtractors(["code", "docs"]);
    assert.equal(extractors.length, 2);
    const names = extractors.map((e) => e.name);
    assert.ok(names.includes("code"));
    assert.ok(names.includes("docs"));
  });

  it("getAllExtractorNames returns all 5", () => {
    const names = getAllExtractorNames();
    assert.equal(names.length, 5);
    assert.ok(names.includes("code"));
    assert.ok(names.includes("commits"));
    assert.ok(names.includes("config"));
    assert.ok(names.includes("docs"));
    assert.ok(names.includes("tests"));
  });

  it("isValidExtractor('code') returns true", () => {
    assert.equal(isValidExtractor("code"), true);
  });

  it("isValidExtractor('invalid') returns false", () => {
    assert.equal(isValidExtractor("invalid"), false);
  });
});

describe("Formatter Registry", () => {
  it("getFormatter('alpaca') returns AlpacaFormatter", () => {
    const formatter = getFormatter("alpaca");
    assert.equal(formatter.name, "alpaca");
  });

  it("getFormatter('sharegpt') returns ShareGPTFormatter", () => {
    const formatter = getFormatter("sharegpt");
    assert.equal(formatter.name, "sharegpt");
  });

  it("getAllFormats returns all 7", () => {
    const formats = getAllFormats();
    assert.equal(formats.length, 7);
    assert.ok(formats.includes("alpaca"));
    assert.ok(formats.includes("sharegpt"));
    assert.ok(formats.includes("openai"));
    assert.ok(formats.includes("chatml"));
    assert.ok(formats.includes("raw"));
    assert.ok(formats.includes("completion"));
    assert.ok(formats.includes("fim"));
  });

  it("isValidFormat('openai') returns true", () => {
    assert.equal(isValidFormat("openai"), true);
  });

  it("isValidFormat('xyz') returns false", () => {
    assert.equal(isValidFormat("xyz"), false);
  });

  it("getFormatter('completion') returns CompletionFormatter", () => {
    const formatter = getFormatter("completion");
    assert.equal(formatter.name, "completion");
  });

  it("getFormatter('fim') returns FimFormatter", () => {
    const formatter = getFormatter("fim");
    assert.equal(formatter.name, "fim");
  });

  it("isValidFormat('completion') returns true", () => {
    assert.equal(isValidFormat("completion"), true);
  });

  it("isValidFormat('fim') returns true", () => {
    assert.equal(isValidFormat("fim"), true);
  });
});
