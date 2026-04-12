/** Tests extractor — pairs test files with source files for test generation */

import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { estimateTokens } from "../pipeline/tokens.js";
import type { Extractor, ExtractedPair, ExtractionContext, FileEntry } from "../types.js";

export class TestExtractor implements Extractor {
  name = "tests" as const;
  description = "Pairs test files with source files to generate code-to-test training pairs";

  async *extract(ctx: ExtractionContext): AsyncIterable<ExtractedPair> {
    for (const testFile of ctx.repoInfo.testFiles) {
      // Find corresponding source file
      const sourceFile = findSourceFile(testFile, ctx.repoInfo.sourceFiles);
      if (!sourceFile) continue;

      let testContent: string;
      let sourceContent: string;
      try {
        testContent = await readFile(testFile.path, "utf-8");
        sourceContent = await readFile(sourceFile.path, "utf-8");
      } catch {
        continue;
      }

      if (!testContent.trim() || !sourceContent.trim()) continue;

      const sourceTokens = estimateTokens(sourceContent);
      const testTokens = estimateTokens(testContent);
      const totalTokens = sourceTokens + testTokens;

      if (totalTokens < ctx.config.minTokens || totalTokens > ctx.config.maxTokens) continue;

      // "Write tests for this code" pair
      yield {
        instruction: `Write tests for the following ${sourceFile.language} code`,
        input: `// File: ${sourceFile.relativePath}\n${sourceContent}`,
        output: testContent,
        metadata: {
          source: "tests",
          file: testFile.relativePath,
          language: testFile.language,
          tokens: totalTokens,
        },
      };

      // Reverse: "What code does this test?" pair
      if (sourceTokens <= ctx.config.maxTokens / 2) {
        yield {
          instruction: `What source code is being tested by these tests?`,
          input: `// Test file: ${testFile.relativePath}\n${testContent}`,
          output: sourceContent,
          metadata: {
            source: "tests",
            file: sourceFile.relativePath,
            language: sourceFile.language,
            tokens: totalTokens,
          },
        };
      }
    }
  }
}

function findSourceFile(testFile: FileEntry, sourceFiles: FileEntry[]): FileEntry | undefined {
  const testName = basename(testFile.relativePath);

  // Strip test markers from filename
  const sourceName = testName
    .replace(/\.test\./, ".")
    .replace(/\.spec\./, ".")
    .replace(/_test\./, ".")
    .replace(/^test_/, "");

  // Look for exact name match
  const match = sourceFiles.find((sf) => basename(sf.relativePath) === sourceName);
  if (match) return match;

  // Look in sibling directories (tests/ → src/, __tests__/ → ./)
  const testDir = dirname(testFile.relativePath);
  const possibleSourceDirs = [
    testDir.replace(/\/?tests?\/?/, "/src/"),
    testDir.replace(/\/?tests?\/?/, "/"),
    testDir.replace(/__tests__\/?/, ""),
    "src",
  ];

  for (const dir of possibleSourceDirs) {
    const candidate = sourceFiles.find(
      (sf) => sf.relativePath === join(dir, sourceName).replace(/\\/g, "/")
    );
    if (candidate) return candidate;
  }

  return undefined;
}
