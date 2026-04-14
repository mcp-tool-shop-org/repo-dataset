/** Visual pipeline runner — scan → extract → validate → format → output */

import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { scanVisualRepo } from "./scanner.js";
import { extractAssetRecords, extractComparisons, generateSyntheticPairs, extractConstitutionLinked, extractSetCoherence } from "./extractors.js";
import { getVisualFormatter } from "./formatters.js";
import type { VisualPipelineConfig, VisualPipelineResult, VisualRepoInfo } from "../types.js";
import type { VisualTrainingUnit } from "./extractors.js";

/** Extended config with optional fields not yet in types.ts */
interface VisualPipelineConfigExt extends VisualPipelineConfig {
  minQuality?: number;
  maxPerTask?: number;
  minResolution?: number;
  maxResolution?: number;
}

const TOOL_VERSION = "1.1.0";

/** Write progress to stderr when output is not piped and --json is not active. */
function progress(config: VisualPipelineConfig, msg: string): void {
  if (config.json) return;
  if (!process.stderr.isTTY) return;
  process.stderr.write(msg + "\n");
}

export async function runVisualPipeline(config: VisualPipelineConfigExt): Promise<VisualPipelineResult> {
  // 1. Scan (with image validation + optional embedding)
  progress(config, "Scanning visual repository...");
  const repoInfo = await scanVisualRepo(config.repoPath, {
    embed: config.embed,
    validateImages: true,
  });

  progress(config, `Found ${repoInfo.assets.length} assets, ${repoInfo.assets.filter(a => a.record_path).length} records, ${repoInfo.comparisons.length} comparisons`);

  // 2. Build system prompt from repo name
  const systemPrompt = `You are a visual style judge for the ${config.repoName} project.`;

  // 3. Collect all training units
  progress(config, "Extracting visual training data...");
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

  if (config.extractors.includes("set_coherence")) {
    for (const unit of extractSetCoherence(repoInfo, systemPrompt)) {
      allUnits.push(unit);
    }
  }

  // 4. Triangle enforcement — drop incomplete units unless --allow-incomplete
  let droppedIncomplete = 0;
  let invalidImages = 0;
  const triangleFiltered: VisualTrainingUnit[] = [];

  for (const unit of allUnits) {
    if (!unit.imageRefs.every((r) => r.valid)) invalidImages++;

    if (!config.allowIncomplete && !unit.binding.triangle_complete) {
      droppedIncomplete++;
      continue;
    }
    triangleFiltered.push(unit);
  }

  // 4b. Dedup — exact dedup using SHA-256 of primary image ref + text content
  let dedupCount = 0;
  const dedupFiltered: VisualTrainingUnit[] = [];
  const seenHashes = new Set<string>();

  for (const unit of triangleFiltered) {
    const hash = computeUnitHash(unit);
    if (seenHashes.has(hash)) {
      dedupCount++;
      continue;
    }
    seenHashes.add(hash);
    dedupFiltered.push(unit);
  }

  if (dedupCount > 0) {
    progress(config, `Deduped ${dedupCount} duplicate units`);
  }

  // 4c. Quality threshold — drop units below minQuality
  const minQuality = config.minQuality ?? 0.0;
  let qualityFilteredCount = 0;
  const filteredUnits: VisualTrainingUnit[] = [];

  for (const unit of dedupFiltered) {
    if (minQuality > 0 && unit.metadata.quality_score < minQuality) {
      qualityFilteredCount++;
      continue;
    }
    filteredUnits.push(unit);
  }

  if (qualityFilteredCount > 0) {
    progress(config, `Filtered ${qualityFilteredCount} units below quality threshold ${minQuality}`);
  }

  // 4d. Resolution filtering — drop units with images outside resolution range
  const minRes = config.minResolution ?? 32;
  const maxRes = config.maxResolution ?? 4096;
  let resolutionFilteredCount = 0;
  const resFiltered: VisualTrainingUnit[] = [];

  for (const unit of filteredUnits) {
    const outsideRange = unit.imageRefs.some(
      (r) => r.valid && (r.width < minRes || r.height < minRes || r.width > maxRes || r.height > maxRes),
    );
    if (outsideRange) {
      resolutionFilteredCount++;
      continue;
    }
    resFiltered.push(unit);
  }

  if (resolutionFilteredCount > 0) {
    process.stderr.write(`Filtered ${resolutionFilteredCount} images outside resolution range [${minRes}-${maxRes}px]\n`);
  }

  // 4e. Task balancing — cap each task type to prevent dataset skew
  const maxPerTask = config.maxPerTask ?? 0; // 0 = disabled
  let balancedUnits: VisualTrainingUnit[];

  if (maxPerTask > 0) {
    const taskGroups = new Map<string, VisualTrainingUnit[]>();
    for (const unit of resFiltered) {
      let arr = taskGroups.get(unit.task);
      if (!arr) {
        arr = [];
        taskGroups.set(unit.task, arr);
      }
      arr.push(unit);
    }

    balancedUnits = [];
    const taskCounts: Record<string, string> = {};

    for (const [task, units] of taskGroups) {
      if (units.length > maxPerTask) {
        // Reservoir-sample down to cap: shuffle then slice
        const shuffled = [...units];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        balancedUnits.push(...shuffled.slice(0, maxPerTask));
        taskCounts[task] = `${maxPerTask}/${units.length}`;
      } else {
        balancedUnits.push(...units);
        taskCounts[task] = `${units.length}/${units.length}`;
      }
    }

    progress(config, `Balanced: ${Object.entries(taskCounts).map(([t, c]) => `${t}=${c}`).join(", ")}`);
  } else {
    balancedUnits = resFiltered;
  }

  // 5. Format and write
  progress(config, `Writing ${config.format} output (${balancedUnits.length} units)...`);
  const formatter = getVisualFormatter(config.format);
  await mkdir(config.outputDir, { recursive: true });
  const outputPath = join(config.outputDir, "dataset.jsonl");
  const stream = createWriteStream(outputPath, { encoding: "utf-8" });

  let classificationPairs = 0;
  let preferencePairs = 0;
  let critiquePairs = 0;
  let written = 0;
  let skippedUnits = 0;

  // Track unique image paths for copying
  const imagePaths = new Set<string>();

  await new Promise<void>((resolve, reject) => {
    stream.on("error", reject);

    for (const unit of balancedUnits) {
      try {
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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Warning: Skipped unit ${unit.id || "unknown"}: ${message}\n`);
        skippedUnits++;
      }
    }

    stream.end(() => resolve());
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

  if (imageDir && imagePaths.size > 0) {
    progress(config, `Copied ${imagePaths.size} images to output directory`);
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
      skipped_units: skippedUnits,
      deduped_units: dedupCount,
      quality_filtered_units: qualityFilteredCount,
      resolution_filtered_units: resolutionFilteredCount,
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
  if (skippedUnits > 0) {
    warnings.push(`${skippedUnits} units skipped due to format/write errors`);
  }
  if (droppedIncomplete > 0) {
    warnings.push(`${droppedIncomplete} units dropped (incomplete triangle — use --allow-incomplete to keep)`);
  }
  if (dedupCount > 0) {
    warnings.push(`Deduped ${dedupCount} duplicate units`);
  }
  if (qualityFilteredCount > 0) {
    warnings.push(`Filtered ${qualityFilteredCount} units below quality threshold ${minQuality}`);
  }
  if (resolutionFilteredCount > 0) {
    warnings.push(`Filtered ${resolutionFilteredCount} units outside resolution range [${minRes}-${maxRes}px]`);
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
    skippedUnits,
    outputPath,
    manifestPath,
    imageDir,
    warnings,
    trainability,
  };
}

/** Dry-run: returns stats without writing */
export async function inspectVisualPipeline(config: VisualPipelineConfigExt): Promise<VisualPipelineResult> {
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

  if (config.extractors.includes("set_coherence")) {
    for (const unit of extractSetCoherence(repoInfo, systemPrompt)) {
      units.push(unit);
      total++;
    }
  }

  // Dedup count for dry-run reporting
  let dedupCount = 0;
  const seenHashes = new Set<string>();
  for (const unit of units) {
    const hash = computeUnitHash(unit);
    if (seenHashes.has(hash)) dedupCount++;
    seenHashes.add(hash);
  }

  // Quality filter count for dry-run reporting
  const minQuality = config.minQuality ?? 0.0;
  let qualityFilteredCount = 0;

  // Resolution filter count for dry-run reporting
  const minRes = config.minResolution ?? 32;
  const maxRes = config.maxResolution ?? 4096;
  let resolutionFilteredCount = 0;

  for (const unit of units) {
    if (!unit.imageRefs.every((r) => r.valid)) invalidImages++;
    if (unit.binding.triangle_complete) triangleComplete++;
    else if (!config.allowIncomplete) droppedIncomplete++;
    if (minQuality > 0 && unit.metadata.quality_score < minQuality) qualityFilteredCount++;
    const outsideRange = unit.imageRefs.some(
      (r) => r.valid && (r.width < minRes || r.height < minRes || r.width > maxRes || r.height > maxRes),
    );
    if (outsideRange) resolutionFilteredCount++;
  }

  const triangleCompletionRate = total > 0
    ? Math.round((triangleComplete / total) * 100) / 100
    : 0;

  const warnings: string[] = [];
  if (repoInfo.yield.orphanAssets > 0) warnings.push(`${repoInfo.yield.orphanAssets} orphan assets`);
  if (preferencePairs < 50) warnings.push(`Only ${preferencePairs} preference pairs`);
  if (droppedIncomplete > 0) warnings.push(`${droppedIncomplete} would be dropped (incomplete triangle)`);
  if (dedupCount > 0) warnings.push(`${dedupCount} duplicate units would be deduped`);
  if (qualityFilteredCount > 0) warnings.push(`${qualityFilteredCount} units would be filtered below quality threshold ${minQuality}`);
  if (resolutionFilteredCount > 0) warnings.push(`${resolutionFilteredCount} units would be filtered outside resolution range [${minRes}-${maxRes}px]`);
  if (invalidImages > 0) warnings.push(`${invalidImages} units reference invalid/missing images`);
  if (triangleCompletionRate < 0.7) warnings.push(`Low triangle completion: ${Math.round(triangleCompletionRate * 100)}%`);

  const written = config.allowIncomplete
    ? total - dedupCount - qualityFilteredCount - resolutionFilteredCount
    : total - droppedIncomplete - dedupCount - qualityFilteredCount - resolutionFilteredCount;

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
    skippedUnits: 0,
    outputPath: "(dry run)",
    manifestPath: null,
    imageDir: null,
    warnings,
    trainability,
  };
}

// ── Dedup helper ──

/** Compute a SHA-256 hash for a training unit based on its primary image ref + text content */
function computeUnitHash(unit: VisualTrainingUnit): string {
  const hash = createHash("sha256");

  // Primary image identity: use base64 if embedded, otherwise file path
  const primaryRef = unit.imageRefs[0];
  if (primaryRef) {
    if (primaryRef.base64) {
      hash.update(primaryRef.base64);
    } else {
      hash.update(primaryRef.path);
    }
  }

  // Text content from messages (assistant responses are the distinguishing signal)
  for (const msg of unit.messages) {
    if (msg.role === "assistant" && typeof msg.content === "string") {
      hash.update(msg.content);
    }
  }

  // Task type prevents cross-task collisions (same image, different task)
  hash.update(unit.task);

  return hash.digest("hex");
}
