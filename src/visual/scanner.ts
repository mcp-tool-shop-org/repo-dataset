/** Visual repo scanner — detects structure tier, scans assets/records/comparisons/canon */

import { readdir, stat, readFile } from "node:fs/promises";
import { join, extname, basename, relative, dirname } from "node:path";
import type { AssetRecord, ComparisonRecord, VisualRepoInfo, ExtractionYield, FileEntry, CanonAssertion } from "../types.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tga", ".tiff"]);

const STATUS_FOLDERS: Record<string, AssetRecord["status"]> = {
  approved: "approved",
  rejected: "rejected",
  borderline: "borderline",
  wip: "wip",
  "work-in-progress": "wip",
  review: "wip",
  final: "approved",
  concepts: "wip",
  iterations: "wip",
};

export async function scanVisualRepo(repoPath: string): Promise<VisualRepoInfo> {
  const assets: AssetRecord[] = [];
  const comparisons: ComparisonRecord[] = [];
  const canonDocs: FileEntry[] = [];
  const rubricDocs: FileEntry[] = [];

  // Scan for image assets
  await scanAssets(repoPath, repoPath, assets);

  // Scan for record JSONs
  await loadRecords(repoPath, assets);

  // Scan for comparison JSONs
  await loadComparisons(repoPath, comparisons, assets);

  // Scan for canon/rubric docs
  await scanCanonDocs(repoPath, canonDocs, rubricDocs);

  // Determine structure tier
  const structureTier = detectStructureTier(assets, comparisons, canonDocs);

  // Compute yield
  const yieldStats = computeYield(assets, comparisons);

  return {
    path: repoPath,
    name: basename(repoPath),
    structureTier,
    assets,
    comparisons,
    canonDocs,
    rubricDocs,
    yield: yieldStats,
  };
}

// ── Asset scanning ──

async function scanAssets(rootPath: string, dirPath: string, assets: AssetRecord[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = join(dirPath, entry.name);
    const relPath = relative(rootPath, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      // Skip non-asset directories
      if (["node_modules", "records", "comparisons", ".git"].includes(entry.name)) continue;
      await scanAssets(rootPath, fullPath, assets);
    } else if (entry.isFile() && isImageFile(entry.name)) {
      const status = inferStatusFromPath(relPath);
      const id = basename(entry.name, extname(entry.name));

      assets.push({
        id,
        asset_path: relPath,
        status: status || "unknown",
        status_source: status ? "folder" : "inferred",
        lane: null,
        faction: null,
        view: inferViewFromFilename(entry.name),
        tags: {},
        must_have: [],
        must_not_have: [],
        canon_explanation: null,
        failure_modes: [],
        neighbors: [],
        canon_assertions: [],
        record_path: null,
        metadata_confidence: status ? 0.6 : 0.2,
      });
    }
  }
}

// ── Record loading ──

async function loadRecords(repoPath: string, assets: AssetRecord[]): Promise<void> {
  const recordsDir = join(repoPath, "records");
  let entries;
  try {
    entries = await readdir(recordsDir);
  } catch {
    return; // No records directory
  }

  // Build lookup by asset id
  const assetMap = new Map<string, AssetRecord>();
  for (const asset of assets) {
    assetMap.set(asset.id, asset);
  }

  for (const file of entries) {
    if (!file.endsWith(".json")) continue;
    const fullPath = join(recordsDir, file);
    try {
      const raw = await readFile(fullPath, "utf-8");
      const record = JSON.parse(raw);

      const id = record.id || basename(file, ".json");
      const existing = assetMap.get(id);

      if (existing) {
        // Merge record data into existing asset
        mergeRecord(existing, record, relative(repoPath, fullPath).replace(/\\/g, "/"));
      } else {
        // Record exists but no matching image found — create asset entry anyway
        assets.push(recordToAsset(record, id, relative(repoPath, fullPath).replace(/\\/g, "/")));
      }
    } catch {
      // Skip malformed JSON
    }
  }
}

function mergeRecord(asset: AssetRecord, record: Record<string, unknown>, recordPath: string): void {
  asset.record_path = recordPath;
  asset.metadata_confidence = 0.9;

  if (record.status && typeof record.status === "string") {
    asset.status = record.status as AssetRecord["status"];
    asset.status_source = "record";
  }
  if (record.lane && typeof record.lane === "string") asset.lane = record.lane;
  if (record.faction && typeof record.faction === "string") asset.faction = record.faction;
  if (record.view && typeof record.view === "string") asset.view = record.view;
  if (record.tags && typeof record.tags === "object") asset.tags = record.tags as Record<string, string[]>;
  if (Array.isArray(record.must_have)) asset.must_have = record.must_have as string[];
  if (Array.isArray(record.must_not_have)) asset.must_not_have = record.must_not_have as string[];
  if (record.canon_explanation && typeof record.canon_explanation === "string") asset.canon_explanation = record.canon_explanation;
  if (Array.isArray(record.failure_modes)) asset.failure_modes = record.failure_modes as string[];
  if (Array.isArray(record.neighbors)) asset.neighbors = record.neighbors as string[];
  if (Array.isArray(record.canon_assertions)) asset.canon_assertions = record.canon_assertions as CanonAssertion[];
}

function recordToAsset(record: Record<string, unknown>, id: string, recordPath: string): AssetRecord {
  return {
    id,
    asset_path: (record.asset_path as string) || "",
    status: (record.status as AssetRecord["status"]) || "unknown",
    status_source: "record",
    lane: (record.lane as string) || null,
    faction: (record.faction as string) || null,
    view: (record.view as string) || null,
    tags: (record.tags as Record<string, string[]>) || {},
    must_have: (record.must_have as string[]) || [],
    must_not_have: (record.must_not_have as string[]) || [],
    canon_explanation: (record.canon_explanation as string) || null,
    failure_modes: (record.failure_modes as string[]) || [],
    neighbors: (record.neighbors as string[]) || [],
    canon_assertions: (record.canon_assertions as CanonAssertion[]) || [],
    record_path: recordPath,
    metadata_confidence: 0.8,
  };
}

// ── Comparison loading ──

async function loadComparisons(repoPath: string, comparisons: ComparisonRecord[], assets: AssetRecord[]): Promise<void> {
  const compDir = join(repoPath, "comparisons");
  let entries;
  try {
    entries = await readdir(compDir);
  } catch {
    return;
  }

  const assetMap = new Map<string, AssetRecord>();
  for (const a of assets) assetMap.set(a.id, a);

  for (const file of entries) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(compDir, file), "utf-8");
      const cmp = JSON.parse(raw);
      const id = cmp.id || basename(file, ".json");

      const assetA = assetMap.get(cmp.asset_a || cmp.asset_a_id);
      const assetB = assetMap.get(cmp.asset_b || cmp.asset_b_id);

      comparisons.push({
        id,
        asset_a_id: cmp.asset_a || cmp.asset_a_id || "",
        asset_b_id: cmp.asset_b || cmp.asset_b_id || "",
        asset_a_path: assetA?.asset_path || cmp.asset_a_path || "",
        asset_b_path: assetB?.asset_path || cmp.asset_b_path || "",
        chosen: cmp.chosen || cmp.winner || "tie",
        source: cmp.source || "human",
        reasoning: cmp.reasoning || cmp.reason || null,
        criteria_scores: cmp.criteria_scores || {},
        rubric_citations: cmp.rubric_citations || [],
        reviewer: cmp.reviewer || null,
        reviewed_at: cmp.reviewed_at || null,
      });
    } catch {
      // Skip malformed
    }
  }
}

// ── Canon doc scanning ──

async function scanCanonDocs(repoPath: string, canonDocs: FileEntry[], rubricDocs: FileEntry[]): Promise<void> {
  const docsDir = join(repoPath, "docs");
  let entries;
  try {
    entries = await readdir(docsDir);
  } catch {
    return;
  }

  for (const file of entries) {
    if (!file.endsWith(".md")) continue;
    const fullPath = join(docsDir, file);
    const relPath = relative(repoPath, fullPath).replace(/\\/g, "/");
    const lower = file.toLowerCase();

    let size = 0;
    try {
      const s = await stat(fullPath);
      size = s.size;
    } catch { continue; }

    const entry: FileEntry = { path: fullPath, relativePath: relPath, language: "markdown", size };

    if (lower.includes("rubric") || lower.includes("review") || lower.includes("checklist")) {
      rubricDocs.push(entry);
    } else {
      canonDocs.push(entry);
    }
  }
}

// ── Structure detection ──

function detectStructureTier(
  assets: AssetRecord[],
  comparisons: ComparisonRecord[],
  canonDocs: FileEntry[]
): "perfect" | "structured" | "partial" | "messy" {
  const hasRecords = assets.some((a) => a.record_path !== null);
  const hasComparisons = comparisons.length > 0;
  const hasCanon = canonDocs.length > 0;
  const hasStatusFolders = assets.some((a) => a.status_source === "folder" && a.status !== "unknown");

  if (hasRecords && hasComparisons && hasCanon) return "perfect";
  if (hasStatusFolders && (hasRecords || hasCanon)) return "structured";
  if (hasStatusFolders) return "partial";
  return "messy";
}

// ── Yield computation ──

function computeYield(assets: AssetRecord[], comparisons: ComparisonRecord[]): ExtractionYield {
  const total = assets.length;
  const withRecords = assets.filter((a) => a.record_path !== null).length;
  const withStatus = assets.filter((a) => a.status !== "unknown").length;
  const withCanonLinks = assets.filter((a) => a.canon_assertions.length > 0).length;

  const compAssetIds = new Set<string>();
  for (const c of comparisons) {
    compAssetIds.add(c.asset_a_id);
    compAssetIds.add(c.asset_b_id);
  }
  const inComparisons = assets.filter((a) => compAssetIds.has(a.id)).length;

  const explicitComps = comparisons.filter((c) => c.source === "human").length;
  const syntheticComps = comparisons.filter((c) => c.source === "synthetic_status_pair").length;

  const orphan = assets.filter((a) => a.status === "unknown" && !a.record_path).length;

  return {
    totalAssets: total,
    assetsWithRecords: withRecords,
    assetsWithStatus: withStatus,
    assetsInComparisons: inComparisons,
    assetsWithCanonLinks: withCanonLinks,
    orphanAssets: orphan,
    explicitComparisons: explicitComps,
    syntheticComparisons: syntheticComps,
    recordCoverage: total > 0 ? Math.round((withRecords / total) * 100) / 100 : 0,
    comparisonCoverage: total > 0 ? Math.round((inComparisons / total) * 100) / 100 : 0,
    wasteRate: total > 0 ? Math.round((orphan / total) * 100) / 100 : 0,
  };
}

// ── Helpers ──

function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(filename).toLowerCase());
}

function inferStatusFromPath(relPath: string): AssetRecord["status"] | null {
  const parts = relPath.toLowerCase().split("/");
  for (const part of parts) {
    if (STATUS_FOLDERS[part]) return STATUS_FOLDERS[part];
  }
  return null;
}

function inferViewFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.includes("front")) return "front";
  if (lower.includes("back")) return "back";
  if (lower.includes("side")) return "side";
  if (lower.includes("34") || lower.includes("three_quarter")) return "front_34";
  return null;
}
