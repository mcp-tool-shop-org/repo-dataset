import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepo } from "../discovery/scanner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Point at src fixture (dist copy has compiled .js, no .md files)
const FIXTURE = resolve(__dirname, "..", "..", "src", "tests", "fixtures", "sample-repo");

describe("scanRepo", () => {
  it("scans fixture and finds all files", async () => {
    const info = await scanRepo(FIXTURE, [], []);
    assert.ok(info.fileCount >= 5, `Expected >= 5 files, got ${info.fileCount}`);
  });

  it("classifies source files correctly", async () => {
    const info = await scanRepo(FIXTURE, [], []);
    const sourceRelPaths = info.sourceFiles.map((f) => f.relativePath);
    assert.ok(sourceRelPaths.some((p) => p.includes("utils.ts")), "Should find utils.ts in source files");
    const utilsFile = info.sourceFiles.find((f) => f.relativePath.includes("utils.ts"));
    assert.ok(utilsFile);
    assert.equal(utilsFile.language, "typescript");
  });

  it("classifies doc files correctly", async () => {
    const info = await scanRepo(FIXTURE, [], []);
    const docRelPaths = info.docFiles.map((f) => f.relativePath);
    assert.ok(docRelPaths.some((p) => p.includes("README.md")), "Should find README.md");
    assert.ok(docRelPaths.some((p) => p.includes("docs/api.md")), "Should find docs/api.md");
  });

  it("classifies test files correctly", async () => {
    const info = await scanRepo(FIXTURE, [], []);
    const testRelPaths = info.testFiles.map((f) => f.relativePath);
    assert.ok(testRelPaths.some((p) => p.includes("utils.test.ts")), "Should find utils.test.ts");
  });

  it("computes language stats", async () => {
    const info = await scanRepo(FIXTURE, [], []);
    assert.ok(info.languages.length > 0, "Should have language stats");
    const ts = info.languages.find((l) => l.language === "typescript");
    assert.ok(ts, "Should have a typescript entry");
    assert.ok(ts.fileCount > 0);
  });

  it("respects include filter", async () => {
    const info = await scanRepo(FIXTURE, ["src/**"], []);
    const allPaths = [
      ...info.sourceFiles,
      ...info.docFiles,
      ...info.testFiles,
    ].map((f) => f.relativePath);
    for (const p of allPaths) {
      assert.ok(p.startsWith("src/"), `File ${p} should be under src/`);
    }
  });

  it("respects exclude filter", async () => {
    const info = await scanRepo(FIXTURE, [], ["docs/**"]);
    const docRelPaths = info.docFiles.map((f) => f.relativePath);
    const fromDocs = docRelPaths.filter((p) => p.startsWith("docs/"));
    assert.equal(fromDocs.length, 0, "Should exclude files from docs/");
  });

  it("returns repo name from basename", async () => {
    const info = await scanRepo(FIXTURE, [], []);
    assert.equal(info.name, "sample-repo");
  });

  describe("temp dir tests", () => {
    let tempDir: string;

    before(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "scanner-test-"));
    });

    after(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it("skips files > 1MB", async () => {
      await mkdir(join(tempDir, "src"), { recursive: true });
      await writeFile(join(tempDir, "src", "small.ts"), "const x = 1;");
      // Create a 2MB file
      await writeFile(join(tempDir, "src", "huge.ts"), "x".repeat(2 * 1024 * 1024));
      const info = await scanRepo(tempDir, [], []);
      const relPaths = info.sourceFiles.map((f) => f.relativePath);
      assert.ok(!relPaths.some((p) => p.includes("huge.ts")), "Should skip file > 1MB");
      assert.ok(relPaths.some((p) => p.includes("small.ts")), "Should include small file");
    });

    it("skips hidden directories", async () => {
      const hiddenDir = join(tempDir, ".hidden");
      await mkdir(hiddenDir, { recursive: true });
      await writeFile(join(hiddenDir, "secret.ts"), "const s = 1;");
      const info = await scanRepo(tempDir, [], []);
      const allPaths = [
        ...info.sourceFiles,
        ...info.docFiles,
        ...info.testFiles,
      ].map((f) => f.relativePath);
      assert.ok(!allPaths.some((p) => p.includes(".hidden")), "Should skip hidden directories");
    });
  });
});
