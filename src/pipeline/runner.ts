/** Pipeline runner — orchestrates discover → extract → filter → balance → format → output */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { scanRepo } from "../discovery/scanner.js";
import { getHeadSha } from "../discovery/git.js";
import { RepoDatasetError } from "../errors.js";
import { getExtractors } from "../extractors/registry.js";
import { getFormatter } from "../formatters/registry.js";
import { passesQuality } from "./quality.js";
import { Deduplicator } from "./dedup.js";
import { applyBalance, assessTrainability } from "./balance.js";
import type {
  PipelineConfig, PipelineResult, ExtractionContext,
  ExtractedPair, SourceStats, DatasetManifest,
} from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOL_VERSION = await (async () => {
  try {
    const raw = await readFile(resolve(__dirname, "../../package.json"), "utf-8");
    return (JSON.parse(raw) as { version: string }).version;
  } catch { return "1.1.0"; }
})();

/** Write a progress line to stderr (suppressed when --json is active) */
function progress(msg: string, json: boolean): void {
  if (!json) process.stderr.write(msg + "\n");
}

export async function runPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const quiet = config.json;

  // 1. Discover
  progress("Scanning repository...", quiet);
  const repoInfo = await scanRepo(config.repoPath, config.include, config.exclude);
  const headSha = await getHeadSha(config.repoPath);
  if (repoInfo.skippedOversized > 0) {
    progress(`Skipped ${repoInfo.skippedOversized} files exceeding 1 MB size limit`, quiet);
  }

  // 2. Setup
  const extractors = getExtractors(config.extractors);
  const formatter = getFormatter(config.format, config.fimRate, config.fimSpmRate, {
    includeMetadata: config.includeMetadata,
  });
  const dedup = new Deduplicator();
  const ctx: ExtractionContext = {
    repoPath: config.repoPath,
    repoName: config.repoName,
    repoInfo,
    config,
    headSha,
  };

  // 3. Extract + Filter (collect all pairs with reservoir sampling)
  let pairsExtracted = 0;
  let duplicatesRemoved = 0;
  const maxPairs = config.globalMaxPairs || 100_000;
  const allPairs: ExtractedPair[] = [];
  let totalSeen = 0; // unique pairs seen (for reservoir sampling reporting)

  const extractorWarnings: string[] = [];

  for (const extractor of extractors) {
    progress(`Extracting ${extractor.name}...`, quiet);
    try {
      for await (const pair of extractor.extract(ctx)) {
        pairsExtracted++;
        if (!passesQuality(pair, config)) continue;
        if (dedup.isDuplicate(pair)) {
          duplicatesRemoved++;
          continue;
        }

        totalSeen++;
        // Reservoir sampling: keep up to maxPairs with uniform probability
        if (allPairs.length < maxPairs) {
          allPairs.push(pair);
        } else {
          // Replace element at random index with probability maxPairs/totalSeen
          const j = Math.floor(Math.random() * totalSeen);
          if (j < maxPairs) {
            allPairs[j] = pair;
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const warning = `Warning: ${extractor.name} extractor failed: ${msg} — skipping`;
      process.stderr.write(warning + "\n");
      extractorWarnings.push(warning);
    }
  }

  if (totalSeen > maxPairs) {
    const capWarning = `Dataset capped at ${maxPairs} pairs (${totalSeen} total extracted)`;
    progress(capWarning, quiet);
    extractorWarnings.push(capWarning);
  }

  const dedupStats = dedup.getStats();
  duplicatesRemoved = dedupStats.exact + dedupStats.near;

  progress(`Extracted ${allPairs.length} pairs across ${extractors.length} extractors`, quiet);

  // 4. Balance (optional)
  let finalPairs: ExtractedPair[];
  let warnings: string[] = [];
  let trainability: "good" | "marginal" | "insufficient";
  let byExtractor: Record<string, SourceStats> = {};

  if (config.balance) {
    const balanceResult = applyBalance(allPairs, config.balance);
    finalPairs = balanceResult.pairs;
    warnings = balanceResult.warnings;
    trainability = balanceResult.trainability;
    byExtractor = balanceResult.after;
  } else {
    finalPairs = allPairs;
    trainability = assessTrainability(allPairs, {}, {});

    // Compute stats without balance
    const buckets: Record<string, ExtractedPair[]> = {};
    for (const p of allPairs) {
      const src = p.metadata.source;
      if (!buckets[src]) buckets[src] = [];
      buckets[src].push(p);
    }
    for (const [src, bucket] of Object.entries(buckets)) {
      const tokens = bucket.reduce((sum, p) => sum + p.metadata.tokens, 0);
      const avgQuality = bucket.length > 0
        ? bucket.reduce((sum, p) => sum + p.metadata.quality_score, 0) / bucket.length
        : 0;
      byExtractor[src] = {
        pairs: bucket.length,
        tokens,
        pct: allPairs.length > 0 ? Math.round((bucket.length / allPairs.length) * 100) : 0,
        avgQuality: Math.round(avgQuality * 100) / 100,
      };
    }

    // Generate warnings for unbalanced output
    for (const [src, stats] of Object.entries(byExtractor)) {
      if (stats.pct > 80) {
        warnings.push(`${src} dominance: ${stats.pct}% (recommend --auto-balance)`);
      }
    }
  }

  // Merge extractor warnings into balance warnings
  warnings.push(...extractorWarnings);

  // 5. Write output
  await mkdir(config.outputDir, { recursive: true });
  const outputPath = join(config.outputDir, "dataset.jsonl");
  progress(`Writing ${config.format} output to ${outputPath}...`, quiet);
  const stream = createWriteStream(outputPath, { encoding: "utf-8" });

  // Attach error handler BEFORE writing so disk-full / permission errors
  // are caught and surfaced as structured RepoDatasetError
  let streamError: Error | null = null;
  stream.on("error", (err: NodeJS.ErrnoException) => {
    streamError = err;
  });

  let totalTokens = 0;
  const signalTypeCounts: Record<string, number> = {};

  for (const pair of finalPairs) {
    const line = formatter.formatPair(pair);
    stream.write(line + "\n");
    totalTokens += pair.metadata.tokens;
    const st = pair.metadata.signal_type;
    signalTypeCounts[st] = (signalTypeCounts[st] || 0) + 1;
  }

  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });

  if (streamError) {
    const err = streamError as NodeJS.ErrnoException;
    let hint: string;
    switch (err.code) {
      case "ENOSPC":
        hint = "Disk may be full — free space in the output directory";
        break;
      case "EACCES":
        hint = "Permission denied — check write access to the output path";
        break;
      default:
        hint = "Check the output path and try again";
    }
    throw new RepoDatasetError("OUTPUT_WRITE_FAILED", err.message, hint);
  }

  // 6. Write manifest
  const manifestPath = join(config.outputDir, "_manifest.json");
  const manifest: DatasetManifest = {
    schema_version: "2",
    tool_version: TOOL_VERSION,
    created_at: new Date().toISOString(),
    source_repo: { name: config.repoName, commit_sha: headSha, path: config.repoPath },
    extractors_used: config.extractors,
    format: config.format,
    balance_config: config.balance,
    filters_applied: { min_tokens: config.minTokens, max_tokens: config.maxTokens, dedup: `exact-sha256+minhash-lsh(t=${0.8})` },
    stats: {
      total_pairs: finalPairs.length,
      total_tokens: totalTokens,
      by_source: Object.fromEntries(Object.entries(byExtractor).map(([k, v]) => [k, v.pairs])),
      by_signal_type: signalTypeCounts,
    },
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    totalFiles: repoInfo.fileCount,
    filesProcessed: repoInfo.sourceFiles.length + repoInfo.docFiles.length + repoInfo.testFiles.length,
    pairsExtracted,
    pairsAfterFilter: allPairs.length,
    pairsAfterBalance: finalPairs.length,
    duplicatesRemoved,
    outputPath,
    manifestPath,
    totalTokens,
    byExtractor,
    warnings,
    trainability,
  };
}

/** Dry-run: returns stats without writing */
export async function inspectPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const repoInfo = await scanRepo(config.repoPath, config.include, config.exclude);
  const headSha = await getHeadSha(config.repoPath);
  const extractors = getExtractors(config.extractors);
  const dedup = new Deduplicator();
  const ctx: ExtractionContext = {
    repoPath: config.repoPath,
    repoName: config.repoName,
    repoInfo,
    config,
    headSha,
  };

  let pairsExtracted = 0;
  let duplicatesRemoved = 0;
  const maxPairs = config.globalMaxPairs || 100_000;
  const allPairs: ExtractedPair[] = [];
  let totalSeen = 0;
  const extractorWarnings: string[] = [];

  for (const extractor of extractors) {
    try {
      for await (const pair of extractor.extract(ctx)) {
        pairsExtracted++;
        if (!passesQuality(pair, config)) continue;
        if (dedup.isDuplicate(pair)) {
          duplicatesRemoved++;
          continue;
        }

        totalSeen++;
        if (allPairs.length < maxPairs) {
          allPairs.push(pair);
        } else {
          const j = Math.floor(Math.random() * totalSeen);
          if (j < maxPairs) {
            allPairs[j] = pair;
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const warning = `Warning: ${extractor.name} extractor failed: ${msg} — skipping`;
      process.stderr.write(warning + "\n");
      extractorWarnings.push(warning);
    }
  }

  if (totalSeen > maxPairs) {
    extractorWarnings.push(`Dataset capped at ${maxPairs} pairs (${totalSeen} total extracted)`);
  }

  const dedupStats = dedup.getStats();
  duplicatesRemoved = dedupStats.exact + dedupStats.near;

  // Apply balance simulation if configured
  let finalPairs: ExtractedPair[];
  let warnings: string[] = [];
  let trainability: "good" | "marginal" | "insufficient";
  let byExtractor: Record<string, SourceStats> = {};

  if (config.balance) {
    const balanceResult = applyBalance(allPairs, config.balance);
    finalPairs = balanceResult.pairs;
    warnings = balanceResult.warnings;
    trainability = balanceResult.trainability;
    byExtractor = balanceResult.after;
  } else {
    finalPairs = allPairs;
    trainability = assessTrainability(allPairs, {}, {});

    const buckets: Record<string, ExtractedPair[]> = {};
    for (const p of allPairs) {
      const src = p.metadata.source;
      if (!buckets[src]) buckets[src] = [];
      buckets[src].push(p);
    }
    for (const [src, bucket] of Object.entries(buckets)) {
      const tokens = bucket.reduce((sum, p) => sum + p.metadata.tokens, 0);
      const avgQuality = bucket.length > 0
        ? bucket.reduce((sum, p) => sum + p.metadata.quality_score, 0) / bucket.length
        : 0;
      byExtractor[src] = {
        pairs: bucket.length,
        tokens,
        pct: allPairs.length > 0 ? Math.round((bucket.length / allPairs.length) * 100) : 0,
        avgQuality: Math.round(avgQuality * 100) / 100,
      };
    }

    for (const [src, stats] of Object.entries(byExtractor)) {
      if (stats.pct > 80) warnings.push(`${src} dominance: ${stats.pct}%`);
    }
  }

  // Merge extractor warnings into balance warnings
  warnings.push(...extractorWarnings);

  const totalTokens = finalPairs.reduce((sum, p) => sum + p.metadata.tokens, 0);

  return {
    totalFiles: repoInfo.fileCount,
    filesProcessed: repoInfo.sourceFiles.length + repoInfo.docFiles.length + repoInfo.testFiles.length,
    pairsExtracted,
    pairsAfterFilter: allPairs.length,
    pairsAfterBalance: finalPairs.length,
    duplicatesRemoved,
    outputPath: "(dry run)",
    manifestPath: null,
    totalTokens,
    byExtractor,
    warnings,
    trainability,
  };
}
