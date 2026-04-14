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

  it("T-FT004: includes DISK_FULL error code", () => {
    assert.ok("DISK_FULL" in ErrorCodes, "ErrorCodes should include DISK_FULL");
    assert.equal(ErrorCodes.DISK_FULL, "DISK_FULL");
  });

  it("T-FT004: includes PERMISSION_DENIED error code", () => {
    assert.ok("PERMISSION_DENIED" in ErrorCodes, "ErrorCodes should include PERMISSION_DENIED");
    assert.equal(ErrorCodes.PERMISSION_DENIED, "PERMISSION_DENIED");
  });

  it("T-FT004: includes OUTPUT_WRITE_FAILED error code", () => {
    assert.ok("OUTPUT_WRITE_FAILED" in ErrorCodes, "ErrorCodes should include OUTPUT_WRITE_FAILED");
    assert.equal(ErrorCodes.OUTPUT_WRITE_FAILED, "OUTPUT_WRITE_FAILED");
  });

  it("T-FT004: RepoDatasetError with ENOSPC code maps correctly", () => {
    const err = new RepoDatasetError(
      ErrorCodes.DISK_FULL,
      "No space left on device",
      "Free disk space and retry"
    );
    assert.equal(err.code, "DISK_FULL");
    assert.equal(err.message, "No space left on device");
    assert.ok(err.hint.includes("disk"), "Hint should reference disk");
    const json = err.toJSON();
    assert.equal(json.code, "DISK_FULL");
  });

  it("T-FT004: RepoDatasetError with EACCES code maps correctly", () => {
    const err = new RepoDatasetError(
      ErrorCodes.PERMISSION_DENIED,
      "Permission denied",
      "Check write permissions"
    );
    assert.equal(err.code, "PERMISSION_DENIED");
    assert.equal(err.message, "Permission denied");
    const json = err.toJSON();
    assert.equal(json.code, "PERMISSION_DENIED");
  });

  it("T-FT004: RepoDatasetError with ENOENT code maps correctly", () => {
    const err = new RepoDatasetError(
      ErrorCodes.FILE_NOT_FOUND,
      "File not found",
      "Check the path exists"
    );
    assert.equal(err.code, "FILE_NOT_FOUND");
    const json = err.toJSON();
    assert.equal(json.code, "FILE_NOT_FOUND");
    assert.equal(json.hint, "Check the path exists");
  });
});
