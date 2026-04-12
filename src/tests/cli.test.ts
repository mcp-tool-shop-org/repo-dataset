import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, "..", "cli.js");

function run(args: string[], cwd?: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [CLI_PATH, ...args], {
      cwd: cwd || process.cwd(),
      encoding: "utf-8",
      timeout: 30000,
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: (e.stdout || "") + (e.stderr || ""), exitCode: e.status || 1 };
  }
}

describe("CLI", () => {
  it("prints help", () => {
    const { stdout, exitCode } = run(["help"]);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes("repo-dataset"));
    assert.ok(stdout.includes("generate"));
    assert.ok(stdout.includes("inspect"));
  });

  it("prints version", () => {
    const { stdout, exitCode } = run(["--version"]);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes("repo-dataset"));
  });

  it("shows info", () => {
    const { stdout, exitCode } = run(["info"]);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes("alpaca"));
    assert.ok(stdout.includes("code"));
    assert.ok(stdout.includes("commits"));
  });

  it("errors on unknown command", () => {
    const { exitCode } = run(["nonexistent"]);
    assert.equal(exitCode, 1);
  });

  it("errors when no path given to generate", () => {
    const { exitCode } = run(["generate"]);
    assert.equal(exitCode, 1);
  });

  it("errors on invalid path", () => {
    const { exitCode } = run(["generate", "/nonexistent/path"]);
    assert.equal(exitCode, 1);
  });

  it("validate with no path exits 1", () => {
    const { exitCode } = run(["validate"]);
    assert.equal(exitCode, 1);
  });

  it("validate with nonexistent file exits 1", () => {
    const { exitCode } = run(["validate", "/nonexistent/dataset.jsonl"]);
    assert.equal(exitCode, 1);
  });

  it("validate with non-jsonl file exits 1", () => {
    const { exitCode } = run(["validate", "package.json"]);
    assert.equal(exitCode, 1);
  });

  it("info shows completion and fim", () => {
    const { stdout, exitCode } = run(["info"]);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes("completion"), "Should show completion format");
    assert.ok(stdout.includes("fim"), "Should show fim format");
  });

  it("info shows auto-balance", () => {
    const { stdout, exitCode } = run(["info"]);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes("auto-balance") || stdout.includes("balance"), "Should mention balance");
  });

  it("visual generate with no path exits 1", () => {
    const { exitCode } = run(["visual", "generate"]);
    assert.equal(exitCode, 1);
  });

  it("visual bogus subcommand exits 1", () => {
    const { exitCode } = run(["visual", "bogus"]);
    assert.equal(exitCode, 1);
  });

  it("info shows visual formats", () => {
    const { stdout, exitCode } = run(["info"]);
    assert.equal(exitCode, 0);
    assert.ok(
      stdout.includes("visual_universal") || stdout.includes("visual_dpo") || stdout.includes("visual"),
      "Should show visual formats"
    );
  });
});
