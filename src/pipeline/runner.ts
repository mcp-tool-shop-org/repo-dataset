/** Pipeline runner — orchestrates discover → extract → filter → format → output */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { scanRepo } from "../discovery/scanner.js";
import { getExtractors } from "../extractors/registry.js";
import { getFormatter } from "../formatters/registry.js";
import { passesQuality } from "./quality.js";
import { Deduplicator } from "./dedup.js";
import type { PipelineConfig, PipelineResult, ExtractionContext } from "../types.js";

export async function runPipeline(config: PipelineConfig): Promise<PipelineResult> {
  // 1. Discover
  const repoInfo = await scanRepo(config.repoPath, config.include, config.exclude);

  // 2. Setup
  const extractors = getExtractors(config.extractors);
  const formatter = getFormatter(config.format);
  const dedup = new Deduplicator();
  const ctx: ExtractionContext = { repoPath: config.repoPath, repoInfo, config };

  // 3. Ensure output directory
  await mkdir(config.outputDir, { recursive: true });
  const outputPath = join(config.outputDir, `dataset.jsonl`);
  const stream = createWriteStream(outputPath, { encoding: "utf-8" });

  let pairsExtracted = 0;
  let pairsAfterFilter = 0;
  let duplicatesRemoved = 0;
  let totalTokens = 0;
  const byExtractor: Record<string, number> = {};

  // 4. Extract + Filter + Format + Write
  for (const extractor of extractors) {
    byExtractor[extractor.name] = 0;

    for await (const pair of extractor.extract(ctx)) {
      pairsExtracted++;

      // Quality filter
      if (!passesQuality(pair, config)) continue;

      // Dedup
      if (dedup.isDuplicate(pair)) {
        duplicatesRemoved++;
        continue;
      }

      // Format and write
      const line = formatter.formatPair(pair);
      stream.write(line + "\n");
      pairsAfterFilter++;
      totalTokens += pair.metadata.tokens;
      byExtractor[extractor.name]++;
    }
  }

  // 5. Close stream
  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });

  // If no pairs were written, remove the empty file
  if (pairsAfterFilter === 0) {
    await writeFile(outputPath, "");
  }

  return {
    totalFiles: repoInfo.fileCount,
    filesProcessed: repoInfo.sourceFiles.length + repoInfo.docFiles.length + repoInfo.testFiles.length,
    pairsExtracted,
    pairsAfterFilter,
    duplicatesRemoved,
    outputPath,
    totalTokens,
    byExtractor,
  };
}

/** Dry-run: returns stats without writing */
export async function inspectPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const repoInfo = await scanRepo(config.repoPath, config.include, config.exclude);
  const extractors = getExtractors(config.extractors);
  const dedup = new Deduplicator();
  const ctx: ExtractionContext = { repoPath: config.repoPath, repoInfo, config };

  let pairsExtracted = 0;
  let pairsAfterFilter = 0;
  let duplicatesRemoved = 0;
  let totalTokens = 0;
  const byExtractor: Record<string, number> = {};

  for (const extractor of extractors) {
    byExtractor[extractor.name] = 0;

    for await (const pair of extractor.extract(ctx)) {
      pairsExtracted++;
      if (!passesQuality(pair, config)) continue;
      if (dedup.isDuplicate(pair)) {
        duplicatesRemoved++;
        continue;
      }
      pairsAfterFilter++;
      totalTokens += pair.metadata.tokens;
      byExtractor[extractor.name]++;
    }
  }

  return {
    totalFiles: repoInfo.fileCount,
    filesProcessed: repoInfo.sourceFiles.length + repoInfo.docFiles.length + repoInfo.testFiles.length,
    pairsExtracted,
    pairsAfterFilter,
    duplicatesRemoved,
    outputPath: "(dry run — no output written)",
    totalTokens,
    byExtractor,
  };
}
