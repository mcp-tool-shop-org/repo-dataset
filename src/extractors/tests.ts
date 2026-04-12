/** Tests extractor — tiered matching: imports → conventions → filename → edit distance */

import { readFile } from "node:fs/promises";
import { basename, dirname, join, extname } from "node:path";
import { createHash } from "node:crypto";
import { estimateTokens } from "../pipeline/tokens.js";
import { parseFileImports, matchImportsToSources } from "./imports.js";
import type { Extractor, ExtractedPair, ExtractionContext, FileEntry, PairMetadata } from "../types.js";

const EXTRACTOR_VERSION = "0.3.0";

/** Files that look like tests but are actually helpers/config */
const TEST_HELPER_NAMES = new Set([
  "conftest.py", "test_helper.rb", "spec_helper.rb", "rails_helper.rb",
  "jest.config.ts", "jest.config.js", "vitest.config.ts", "vitest.config.js",
  "karma.conf.js", "setup.ts", "setup.js", "setupTests.ts", "setupTests.js",
  "test-utils.ts", "test-utils.js", "test_utils.py", "__init__.py",
]);

export class TestExtractor implements Extractor {
  name = "tests" as const;
  description = "Pairs test files with source files using import analysis and tiered matching";

  async *extract(ctx: ExtractionContext): AsyncIterable<ExtractedPair> {
    for (const testFile of ctx.repoInfo.testFiles) {
      // Skip test helpers
      if (TEST_HELPER_NAMES.has(basename(testFile.relativePath))) continue;
      if (testFile.relativePath.includes("common/mod.rs")) continue;

      // Tiered matching
      const match = await findSourceFile(testFile, ctx.repoInfo.sourceFiles, ctx.repoPath);
      if (!match) continue;

      let testContent: string;
      let sourceContent: string;
      try {
        testContent = await readFile(testFile.path, "utf-8");
        sourceContent = await readFile(match.file.path, "utf-8");
      } catch {
        continue;
      }

      if (!testContent.trim() || !sourceContent.trim()) continue;

      const sourceTokens = estimateTokens(sourceContent);
      const testTokens = estimateTokens(testContent);
      const totalTokens = sourceTokens + testTokens;

      if (totalTokens < ctx.config.minTokens || totalTokens > ctx.config.maxTokens) continue;

      const id = createHash("sha256")
        .update(`${testFile.relativePath}:${match.file.relativePath}`)
        .digest("hex").slice(0, 16);

      const qualityScore = scoreTestPair(sourceContent, testContent, match.confidence);

      const baseMeta: PairMetadata = {
        id,
        source: "tests",
        repo_name: ctx.repoName,
        file: testFile.relativePath,
        language: testFile.language,
        commit_sha: ctx.headSha,
        line_start: 1,
        line_end: testContent.split("\n").length,
        extractor_type: "tests:write",
        extractor_version: EXTRACTOR_VERSION,
        extracted_at: new Date().toISOString(),
        tokens: totalTokens,
        char_count: testContent.length + sourceContent.length,
        has_docstring: false,
        has_tests: true,
        complexity: "medium",
        quality_score: qualityScore,
        signal_type: "test_generation",
      };

      // "Write tests for this code" pair
      yield {
        instruction: `Write tests for the following ${match.file.language} code`,
        input: `// File: ${match.file.relativePath}\n${sourceContent}`,
        output: testContent,
        metadata: baseMeta,
      };

      // Reverse: "What code does this test?" pair
      if (sourceTokens <= ctx.config.maxTokens / 2) {
        yield {
          instruction: "What source code is being tested by these tests?",
          input: `// Test file: ${testFile.relativePath}\n${testContent}`,
          output: sourceContent,
          metadata: {
            ...baseMeta,
            id: `${id}-rev`,
            extractor_type: "tests:reverse",
            signal_type: "implementation",
          },
        };
      }
    }
  }
}

// ── Tiered Matching ──

interface MatchResult {
  file: FileEntry;
  confidence: "high" | "medium" | "low";
  method: string;
}

async function findSourceFile(
  testFile: FileEntry,
  sourceFiles: FileEntry[],
  projectRoot: string
): Promise<MatchResult | null> {
  // Tier 1: Import graph
  const imports = await parseFileImports(testFile.path, testFile.language, projectRoot);
  const importMatches = matchImportsToSources(imports.filter((i) => i.isProjectInternal), sourceFiles);
  if (importMatches.length === 1) {
    return { file: importMatches[0], confidence: "high", method: "import" };
  }
  if (importMatches.length >= 2 && importMatches.length <= 3) {
    return { file: importMatches[0], confidence: "medium", method: "import-primary" };
  }
  // 4+ imports = integration test, skip
  if (importMatches.length >= 4) return null;

  // Tier 2: Language-specific conventions
  const convention = matchByConvention(testFile, sourceFiles);
  if (convention) return convention;

  // Tier 3: Filename stripping
  const stripped = matchByFilenameStrip(testFile, sourceFiles);
  if (stripped) return stripped;

  // Tier 4: Directory traversal
  const dirMatch = matchByDirectorySearch(testFile, sourceFiles);
  if (dirMatch) return dirMatch;

  return null;
}

function matchByConvention(testFile: FileEntry, sourceFiles: FileEntry[]): MatchResult | null {
  const rel = testFile.relativePath;

  // Go: same directory, strip _test.go
  if (testFile.language === "go" && rel.endsWith("_test.go")) {
    const sourcePath = rel.replace(/_test\.go$/, ".go");
    const found = sourceFiles.find((sf) => sf.relativePath === sourcePath);
    if (found) return { file: found, confidence: "high", method: "go-convention" };
  }

  // Java: src/test/ → src/main/ mirror
  if ((testFile.language === "java" || testFile.language === "kotlin") && rel.includes("src/test/")) {
    const sourcePath = rel.replace("src/test/", "src/main/").replace(/Test\.\w+$/, (m) => m.replace("Test", ""));
    const found = sourceFiles.find((sf) => sf.relativePath === sourcePath);
    if (found) return { file: found, confidence: "high", method: "java-mirror" };
  }

  // Ruby: spec/ → app/ or lib/
  if (testFile.language === "ruby" && rel.includes("spec/")) {
    const stripped = rel.replace(/^spec\//, "").replace(/_spec\.rb$/, ".rb");
    for (const prefix of ["app/", "lib/"]) {
      const found = sourceFiles.find((sf) => sf.relativePath === prefix + stripped);
      if (found) return { file: found, confidence: "high", method: "ruby-rspec" };
    }
  }

  // C#: .Tests/ → /
  if (testFile.language === "csharp" && rel.includes(".Tests/")) {
    const sourcePath = rel.replace(/\.Tests[/\\]/, "/").replace(/Tests\.cs$/, ".cs");
    const found = sourceFiles.find((sf) => sf.relativePath === sourcePath);
    if (found) return { file: found, confidence: "high", method: "csharp-mirror" };
  }

  // Elixir: test/foo_test.exs → lib/foo.ex
  if (testFile.language === "elixir" && rel.startsWith("test/")) {
    const sourcePath = rel.replace(/^test\//, "lib/").replace(/_test\.exs$/, ".ex");
    const found = sourceFiles.find((sf) => sf.relativePath === sourcePath);
    if (found) return { file: found, confidence: "high", method: "elixir-convention" };
  }

  return null;
}

function matchByFilenameStrip(testFile: FileEntry, sourceFiles: FileEntry[]): MatchResult | null {
  const testName = basename(testFile.relativePath);
  const sourceName = stripTestSuffix(testName);
  if (sourceName === testName) return null; // no suffix found to strip

  const match = sourceFiles.find((sf) => basename(sf.relativePath) === sourceName);
  if (match) return { file: match, confidence: "medium", method: "filename-strip" };
  return null;
}

function matchByDirectorySearch(testFile: FileEntry, sourceFiles: FileEntry[]): MatchResult | null {
  const testName = basename(testFile.relativePath);
  const sourceName = stripTestSuffix(testName);
  if (sourceName === testName) return null;

  const testDir = dirname(testFile.relativePath);
  const alternates = getAlternateSourceDirs(testDir);

  for (const dir of alternates) {
    const candidate = sourceFiles.find(
      (sf) => sf.relativePath === join(dir, sourceName).replace(/\\/g, "/")
    );
    if (candidate) return { file: candidate, confidence: "medium", method: "directory-search" };
  }

  return null;
}

function stripTestSuffix(filename: string): string {
  return filename
    .replace(/\.test\./, ".")
    .replace(/\.spec\./, ".")
    .replace(/_test\./, ".")
    .replace(/^test_/, "")
    .replace(/Test\./, ".")
    .replace(/Tests\./, ".")
    .replace(/_spec\./, ".")
    .replace(/Spec\./, ".")
    .replace(/\.cy\./, ".")
    .replace(/\.e2e\./, ".")
    .replace(/\.integration\./, ".");
}

function getAlternateSourceDirs(testDir: string): string[] {
  return [
    testDir.replace(/\/?__tests__\/?/, "/"),
    testDir.replace(/\/?tests?\/?/, "/src/"),
    testDir.replace(/\/?tests?\/?/, "/lib/"),
    testDir.replace(/\/?tests?\/?/, "/"),
    testDir.replace(/\/?spec\/?/, "/app/"),
    testDir.replace(/\/?spec\/?/, "/lib/"),
    testDir.replace(/src\/test\//, "src/main/"),
    testDir.replace(/\.Tests\/?/, "/"),
    testDir.replace(/\.UnitTests\/?/, "/"),
    "src",
    "lib",
    "app",
  ].filter((d) => d !== testDir);
}

// ── Quality scoring ──

function scoreTestPair(source: string, test: string, confidence: "high" | "medium" | "low"): number {
  let score = confidence === "high" ? 0.5 : confidence === "medium" ? 0.35 : 0.2;

  // Assertion density
  const assertions = (test.match(/\b(assert|expect|should|assert_eq|assert_ne)\b/g) || []).length;
  if (assertions >= 3) score += 0.15;
  if (assertions >= 6) score += 0.1;

  // Source has exports (testing public API)
  if (/\b(export|pub fn|pub struct|public)\b/.test(source)) score += 0.1;

  // Test:source ratio in healthy range (0.5x-3.0x)
  const ratio = test.split("\n").length / Math.max(source.split("\n").length, 1);
  if (ratio >= 0.5 && ratio <= 3.0) score += 0.1;

  // Has setup/teardown
  if (/\b(before|after|setUp|tearDown|fixture)\b/i.test(test)) score += 0.05;

  return Math.min(score, 1.0);
}
