/** Visual pipeline runner — scan → extract → format → output */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { scanVisualRepo } from "./scanner.js";
import { extractAssetRecords, extractComparisons, generateSyntheticPairs, extractConstitutionLinked } from "./extractors.js";
import { getVisualFormatter } from "./formatters.js";
import type { VisualPipelineConfig, VisualPipelineResult, VisualRepoInfo } from "../types.js";
import type { VisualTrainingUnit } from "./extractors.js";

const TOOL_VERSION = "1.0.0";

export async function runVisualPipeline(config: VisualPipelineConfig): Promise<VisualPipelineResult> {
  // 1. Scan
  const repoInfo = await scanVisualRepo(config.repoPath);

  // 2. Build system prompt from repo name
  const systemPrompt = `You are a visual style judge for the ${config.repoName} project.`;

  // 3. Collect all training units
  const allUnits: VisualTrainingUnit[] = [];

  if (config.extractors.includes("asset_record")) {
    for (const unit of extractAssetRecords(repoInfo, systemPrompt)) {
      allUnits.push(unit);
    }
  }

  if (config.extractors.includes("comparison")) {
    for (const unit of extractComparisons(repoInfo, systemPrompt)) {
      allUnits.push(unit);
    }
  }

  // Synthetic pairs (from approved/rejected when no explicit comparisons)
  if (config.generateSyntheticPairs) {
    for (const { comparison, units } of generateSyntheticPairs(repoInfo, systemPrompt)) {
      repoInfo.comparisons.push(comparison);
      allUnits.push(...units);
    }
    // Recompute yield after synthetic pairs
    repoInfo.yield.syntheticComparisons = repoInfo.comparisons.filter((c) => c.source === "synthetic_status_pair").length;
  }

  if (config.extractors.includes("constitution")) {
    for await (const unit of extractConstitutionLinked(repoInfo, systemPrompt)) {
      allUnits.push(unit);
    }
  }

  // 4. Format and write
  const formatter = getVisualFormatter(config.format);
  await mkdir(config.outputDir, { recursive: true });
  const outputPath = join(config.outputDir, "dataset.jsonl");
  const stream = createWriteStream(outputPath, { encoding: "utf-8" });

  let classificationPairs = 0;
  let preferencePairs = 0;
  let critiquePairs = 0;
  let written = 0;

  for (const unit of allUnits) {
    const line = formatter.formatUnit(unit);
    if (!line) continue; // Formatter filtered it out (wrong task type for format)

    stream.write(line + "\n");
    written++;

    if (unit.task === "classify") classificationPairs++;
    else if (unit.task === "preference" || unit.task === "contrastive") preferencePairs++;
    else if (unit.task === "critique") critiquePairs++;
  }

  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });

  // 5. Write manifest
  const manifestPath = join(config.outputDir, "_manifest.json");
  await writeFile(manifestPath, JSON.stringify({
    schema_version: "2",
    tool_version: TOOL_VERSION,
    created_at: new Date().toISOString(),
    mode: "visual",
    source_repo: { name: config.repoName, path: config.repoPath },
    structure_tier: repoInfo.structureTier,
    format: config.format,
    extractors_used: config.extractors,
    synthetic_pairs: config.generateSyntheticPairs,
    yield: repoInfo.yield,
    stats: {
      total_units: written,
      classification: classificationPairs,
      preference: preferencePairs,
      critique: critiquePairs,
    },
  }, null, 2));

  // 6. Warnings + trainability
  const warnings: string[] = [];
  if (repoInfo.yield.orphanAssets > 0) {
    warnings.push(`${repoInfo.yield.orphanAssets} orphan assets (no metadata)`);
  }
  if (preferencePairs < 50) {
    warnings.push(`Only ${preferencePairs} preference pairs (recommend 200+ for DPO)`);
  }
  if (repoInfo.yield.recordCoverage < 0.5) {
    warnings.push(`Low record coverage: ${Math.round(repoInfo.yield.recordCoverage * 100)}%`);
  }

  let trainability: "good" | "marginal" | "insufficient";
  if (written < 50) trainability = "insufficient";
  else if (written < 200 || preferencePairs < 50) trainability = "marginal";
  else trainability = "good";

  return {
    structureTier: repoInfo.structureTier,
    totalAssets: repoInfo.yield.totalAssets,
    yield: repoInfo.yield,
    classificationPairs,
    preferencePairs,
    critiquePairs,
    totalTrainingUnits: written,
    outputPath,
    manifestPath,
    warnings,
    trainability,
  };
}

/** Dry-run: returns stats without writing */
export async function inspectVisualPipeline(config: VisualPipelineConfig): Promise<VisualPipelineResult> {
  const repoInfo = await scanVisualRepo(config.repoPath);
  const systemPrompt = `You are a visual style judge for the ${config.repoName} project.`;

  let classificationPairs = 0;
  let preferencePairs = 0;
  let critiquePairs = 0;
  let total = 0;

  if (config.extractors.includes("asset_record")) {
    for (const unit of extractAssetRecords(repoInfo, systemPrompt)) {
      total++;
      if (unit.task === "classify") classificationPairs++;
      else if (unit.task === "critique") critiquePairs++;
    }
  }

  if (config.extractors.includes("comparison")) {
    for (const unit of extractComparisons(repoInfo, systemPrompt)) {
      total++;
      preferencePairs++;
    }
  }

  if (config.generateSyntheticPairs) {
    for (const { comparison, units } of generateSyntheticPairs(repoInfo, systemPrompt)) {
      repoInfo.comparisons.push(comparison);
      total += units.length;
      preferencePairs += units.filter((u) => u.task === "preference" || u.task === "contrastive").length;
    }
    repoInfo.yield.syntheticComparisons = repoInfo.comparisons.filter((c) => c.source === "synthetic_status_pair").length;
  }

  if (config.extractors.includes("constitution")) {
    for await (const unit of extractConstitutionLinked(repoInfo, systemPrompt)) {
      total++;
      critiquePairs++;
    }
  }

  const warnings: string[] = [];
  if (repoInfo.yield.orphanAssets > 0) warnings.push(`${repoInfo.yield.orphanAssets} orphan assets`);
  if (preferencePairs < 50) warnings.push(`Only ${preferencePairs} preference pairs`);

  let trainability: "good" | "marginal" | "insufficient";
  if (total < 50) trainability = "insufficient";
  else if (total < 200 || preferencePairs < 50) trainability = "marginal";
  else trainability = "good";

  return {
    structureTier: repoInfo.structureTier,
    totalAssets: repoInfo.yield.totalAssets,
    yield: repoInfo.yield,
    classificationPairs,
    preferencePairs,
    critiquePairs,
    totalTrainingUnits: total,
    outputPath: "(dry run)",
    manifestPath: null,
    warnings,
    trainability,
  };
}
