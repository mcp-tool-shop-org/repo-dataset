import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RepoDatasetError, ErrorCodes } from "../errors.js";

describe("RepoDatasetError", () => {
  it("has correct properties", () => {
    const err = new RepoDatasetError("TEST_CODE", "test message", "try this");
    assert.equal(err.code, "TEST_CODE");
    assert.equal(err.message, "test message");
    assert.equal(err.hint, "try this");
  });

  it("toJSON returns correct shape", () => {
    const err = new RepoDatasetError("CODE", "msg", "hint");
    const json = err.toJSON();
    assert.deepEqual(json, { code: "CODE", message: "msg", hint: "hint" });
  });

  it("extends Error", () => {
    const err = new RepoDatasetError("CODE", "msg", "hint");
    assert.ok(err instanceof Error);
  });

  it("has correct name", () => {
    const err = new RepoDatasetError("CODE", "msg", "hint");
    assert.equal(err.name, "RepoDatasetError");
  });
});

describe("ErrorCodes", () => {
  it("all values are non-empty strings", () => {
    for (const [key, value] of Object.entries(ErrorCodes)) {
      assert.equal(typeof value, "string", `ErrorCodes.${key} should be a string`);
      assert.ok(value.length > 0, `ErrorCodes.${key} should be non-empty`);
    }
  });
});
