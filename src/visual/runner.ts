/** Visual pipeline runner — scan → extract → validate → format → output */

import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createWriteStream } from "node:fs";
import { scanVisualRepo } from "./scanner.js";
import { extractAssetRecords, extractComparisons, generateSyntheticPairs, extractConstitutionLinked } from "./extractors.js";
import { getVisualFormatter } from "./formatters.js";
import type { VisualPipelineConfig, VisualPipelineResult, VisualRepoInfo } from "../types.js";
import type { VisualTrainingUnit } from "./extractors.js";

const TOOL_VERSION = "1.1.0";

export async function runVisualPipeline(config: VisualPipelineConfig): Promise<VisualPipelineResult> {
  // 1. Scan (with image validation + optional embedding)
  const repoInfo = await scanVisualRepo(config.repoPath, {
    embed: config.embed,
    validateImages: true,
  });

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
    repoInfo.yield.syntheticComparisons = repoInfo.comparisons.filter((c) => c.source === "synthetic_status_pair").length;
  }

  if (config.extractors.includes("constitution")) {
    for await (const unit of extractConstitutionLinked(repoInfo, systemPrompt)) {
      allUnits.push(unit);
    }
  }

  // 4. Triangle enforcement — drop incomplete units unless --allow-incomplete
  let droppedIncomplete = 0;
  let invalidImages = 0;
  const filteredUnits: VisualTrainingUnit[] = [];

  for (const unit of allUnits) {
    if (!unit.imageRefs.every((r) => r.valid)) invalidImages++;

    if (!config.allowIncomplete && !unit.binding.triangle_complete) {
      droppedIncomplete++;
      continue;
    }
    filteredUnits.push(unit);
  }

  // 5. Format and write
  const formatter = getVisualFormatter(config.format);
  await mkdir(config.outputDir, { recursive: true });
  const outputPath = join(config.outputDir, "dataset.jsonl");
  const stream = createWriteStream(outputPath, { encoding: "utf-8" });

  let classificationPairs = 0;
  let preferencePairs = 0;
  let critiquePairs = 0;
  let written = 0;

  // Track unique image paths for copying
  const imagePaths = new Set<string>();

  for (const unit of filteredUnits) {
    const line = formatter.formatUnit(unit);
    if (!line) continue;

    stream.write(line + "\n");
    written++;

    if (unit.task === "classify") classificationPairs++;
    else if (unit.task === "preference" || unit.task === "contrastive") preferencePairs++;
    else if (unit.task === "critique") critiquePairs++;

    for (const ref of unit.imageRefs) {
      if (ref.path && ref.valid) imagePaths.add(ref.path);
    }
  }

  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });

  // 6. Copy images to output folder (unless --embed or --no-copy-images)
  let imageDir: string | null = null;
  if (config.copyImages && !config.embed && imagePaths.size > 0) {
    imageDir = join(config.outputDir, "images");
    for (const relPath of imagePaths) {
      const src = join(config.repoPath, relPath);
      const dest = join(imageDir, relPath);
      await mkdir(dirname(dest), { recursive: true });
      try {
        await copyFile(src, dest);
      } catch {
        // Skip files that can't be copied
      }
    }
  }

  // 7. Compute triangle stats
  const totalWithBinding = allUnits.length;
  const triangleComplete = allUnits.filter((u) => u.binding.triangle_complete).length;
  const triangleCompletionRate = totalWithBinding > 0
    ? Math.round((triangleComplete / totalWithBinding) * 100) / 100
    : 0;

  // 8. Write manifest
  const manifestPath = join(config.outputDir, "_manifest.json");
  await writeFile(manifestPath, JSON.stringify({
    schema_version: "3",
    tool_version: TOOL_VERSION,
    created_at: new Date().toISOString(),
    mode: "visual",
    source_repo: { name: config.repoName, path: config.repoPath },
    structure_tier: repoInfo.structureTier,
    format: config.format,
    extractors_used: config.extractors,
    synthetic_pairs: config.generateSyntheticPairs,
    embedded: config.embed,
    yield: repoInfo.yield,
    binding: {
      triangle_completion_rate: triangleCompletionRate,
      dropped_incomplete: droppedIncomplete,
      invalid_images: invalidImages,
    },
    stats: {
      total_units: written,
      classification: classificationPairs,
      preference: preferencePairs,
      critique: critiquePairs,
    },
  }, null, 2));

  // 9. Warnings + trainability
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
  if (droppedIncomplete > 0) {
    warnings.push(`${droppedIncomplete} units dropped (incomplete triangle — use --allow-incomplete to keep)`);
  }
  if (invalidImages > 0) {
    warnings.push(`${invalidImages} units reference invalid/missing images`);
  }
  if (triangleCompletionRate < 0.7) {
    warnings.push(`Low triangle completion: ${Math.round(triangleCompletionRate * 100)}% (target >90%)`);
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
    droppedIncomplete,
    triangleCompletionRate,
    imagesEmbedded: config.embed,
    invalidImages,
    outputPath,
    manifestPath,
    imageDir,
    warnings,
    trainability,
  };
}

/** Dry-run: returns stats without writing */
export async function inspectVisualPipeline(config: VisualPipelineConfig): Promise<VisualPipelineResult> {
  const repoInfo = await scanVisualRepo(config.repoPath, {
    embed: false,
    validateImages: true,
  });
  const systemPrompt = `You are a visual style judge for the ${config.repoName} project.`;

  let classificationPairs = 0;
  let preferencePairs = 0;
  let critiquePairs = 0;
  let total = 0;
  let droppedIncomplete = 0;
  let invalidImages = 0;
  let triangleComplete = 0;

  const units: VisualTrainingUnit[] = [];

  if (config.extractors.includes("asset_record")) {
    for (const unit of extractAssetRecords(repoInfo, systemPrompt)) {
      units.push(unit);
      total++;
      if (unit.task === "classify") classificationPairs++;
      else if (unit.task === "critique") critiquePairs++;
    }
  }

  if (config.extractors.includes("comparison")) {
    for (const unit of extractComparisons(repoInfo, systemPrompt)) {
      units.push(unit);
      total++;
      preferencePairs++;
    }
  }

  if (config.generateSyntheticPairs) {
    for (const { comparison, units: synUnits } of generateSyntheticPairs(repoInfo, systemPrompt)) {
      repoInfo.comparisons.push(comparison);
      for (const u of synUnits) {
        units.push(u);
        total++;
        if (u.task === "preference" || u.task === "contrastive") preferencePairs++;
      }
    }
    repoInfo.yield.syntheticComparisons = repoInfo.comparisons.filter((c) => c.source === "synthetic_status_pair").length;
  }

  if (config.extractors.includes("constitution")) {
    for await (const unit of extractConstitutionLinked(repoInfo, systemPrompt)) {
      units.push(unit);
      total++;
      critiquePairs++;
    }
  }

  for (const unit of units) {
    if (!unit.imageRefs.every((r) => r.valid)) invalidImages++;
    if (unit.binding.triangle_complete) triangleComplete++;
    else if (!config.allowIncomplete) droppedIncomplete++;
  }

  const triangleCompletionRate = total > 0
    ? Math.round((triangleComplete / total) * 100) / 100
    : 0;

  const warnings: string[] = [];
  if (repoInfo.yield.orphanAssets > 0) warnings.push(`${repoInfo.yield.orphanAssets} orphan assets`);
  if (preferencePairs < 50) warnings.push(`Only ${preferencePairs} preference pairs`);
  if (droppedIncomplete > 0) warnings.push(`${droppedIncomplete} would be dropped (incomplete triangle)`);
  if (invalidImages > 0) warnings.push(`${invalidImages} units reference invalid/missing images`);
  if (triangleCompletionRate < 0.7) warnings.push(`Low triangle completion: ${Math.round(triangleCompletionRate * 100)}%`);

  const written = config.allowIncomplete ? total : total - droppedIncomplete;

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
    droppedIncomplete,
    triangleCompletionRate,
    imagesEmbedded: false,
    invalidImages,
    outputPath: "(dry run)",
    manifestPath: null,
    imageDir: null,
    warnings,
    trainability,
  };
}
