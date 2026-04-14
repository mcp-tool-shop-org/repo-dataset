/** Visual extractors — asset record, comparison, constitution linker, synthetic pairs */

import { readFile } from "node:fs/promises";
import type {
  AssetRecord, ComparisonRecord, VisualRepoInfo, FileEntry, BindingReport, AssetImageInfo,
  VisualSignalType,
} from "../types.js";

const EXTRACTOR_VERSION = "1.1.0";

// ── Output record types ─���

export interface ImageRef {
  path: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  valid: boolean;
  base64?: string;
}

export interface VisualTrainingUnit {
  id: string;
  task: "classify" | "critique" | "preference" | "contrastive" | "coherence";
  images: string[];
  imageRefs: ImageRef[];
  messages: Message[];
  metadata: VisualUnitMetadata;
  binding: BindingReport;
  // DPO-specific fields (only for preference tasks)
  preferred_index?: number;
  chosen?: string;
  rejected?: string;
  // KTO-specific
  label?: boolean;
  // Contrastive-specific
  margin?: number;
  // Pointwise scores
  scores?: Record<string, number>;
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: ContentPart[] | string;
}

export type ContentPart = { type: "image" } | { type: "text"; text: string };

interface VisualUnitMetadata {
  source_repo: string;
  extractor: string;
  extractor_version: string;
  asset_id?: string;
  comparison_id?: string;
  status?: string;
  faction?: string;
  signal_type: string;
  quality_score: number;
  extracted_at: string;
}

// ── Binding helpers ──

function imageRefFromAsset(asset: AssetRecord): ImageRef {
  if (asset.image) {
    return {
      path: asset.asset_path,
      format: asset.image.format,
      width: asset.image.width,
      height: asset.image.height,
      bytes: asset.image.bytes,
      valid: asset.image.valid,
      ...(asset.image.base64 && { base64: asset.image.base64 }),
    };
  }
  return { path: asset.asset_path, format: "png", width: 0, height: 0, bytes: 0, valid: false };
}

function computeBinding(asset: AssetRecord, hasCanonText: boolean): BindingReport {
  const has_image = !!asset.image?.valid;
  const has_canon = hasCanonText || !!asset.canon_explanation || asset.canon_assertions.length > 0;
  const has_judgment = asset.status === "approved" || asset.status === "rejected" ||
    asset.failure_modes.length > 0 || asset.must_have.length > 0;
  return {
    has_image,
    has_canon,
    has_judgment,
    triangle_complete: has_image && has_canon && has_judgment,
  };
}

function computePreferenceBinding(
  assetA: AssetRecord | undefined,
  assetB: AssetRecord | undefined,
  cmp: ComparisonRecord,
): BindingReport {
  const has_image = !!(assetA?.image?.valid && assetB?.image?.valid);
  const has_canon = !!cmp.reasoning || cmp.rubric_citations.length > 0;
  const has_judgment = cmp.chosen !== "tie" && Object.keys(cmp.criteria_scores).length > 0;
  return {
    has_image,
    has_canon,
    has_judgment,
    triangle_complete: has_image && has_canon && has_judgment,
  };
}

// ── Record-Bound Asset Extractor ──

export function* extractAssetRecords(
  repoInfo: VisualRepoInfo,
  systemPrompt: string
): Generator<VisualTrainingUnit> {
  for (const asset of repoInfo.assets) {
    if (asset.status === "unknown" || asset.status === "wip") continue;
    if (!asset.asset_path) continue;

    const hasRichMetadata = asset.canon_explanation || asset.must_have.length > 0 || Object.keys(asset.tags).length > 0;
    const qualityScore = computeAssetQuality(asset);

    const imgRef = imageRefFromAsset(asset);
    const binding = computeBinding(asset, false);

    // KTO classification: approved/rejected/borderline as label
    if (asset.status === "approved" || asset.status === "rejected") {
      const explanation = buildClassificationExplanation(asset);
      yield {
        id: `cls_${asset.id}`,
        task: "classify",
        images: [asset.asset_path],
        imageRefs: [imgRef],
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [{ type: "image" }, { type: "text", text: "Is this asset on-style? Classify as approved or rejected and explain." }] },
          { role: "assistant", content: explanation },
        ],
        binding,
        label: asset.status === "approved",
        metadata: {
          source_repo: repoInfo.name,
          extractor: "asset_record",
          extractor_version: EXTRACTOR_VERSION,
          asset_id: asset.id,
          status: asset.status,
          faction: asset.faction || undefined,
          signal_type: "style_classification",
          quality_score: qualityScore,
          extracted_at: new Date().toISOString(),
        },
      };
    }

    // Borderline assets: KTO label=false (near-miss), classification with nuanced scoring
    if (asset.status === "borderline") {
      const borderlineExplanation = buildBorderlineExplanation(asset);
      const borderlineQuality = Math.max(qualityScore * 0.7, 0.15); // between rejected and approved scoring
      yield {
        id: `cls_${asset.id}`,
        task: "classify",
        images: [asset.asset_path],
        imageRefs: [imgRef],
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [{ type: "image" }, { type: "text", text: "Is this asset on-style? Classify as approved or rejected and explain." }] },
          { role: "assistant", content: borderlineExplanation },
        ],
        binding,
        label: false,
        metadata: {
          source_repo: repoInfo.name,
          extractor: "asset_record",
          extractor_version: EXTRACTOR_VERSION,
          asset_id: asset.id,
          status: asset.status,
          faction: asset.faction || undefined,
          signal_type: "style_classification",
          quality_score: borderlineQuality,
          extracted_at: new Date().toISOString(),
        },
      };
    }

    // Critique pair: assets with rich metadata OR borderline assets (highest-value critique targets)
    if (hasRichMetadata || asset.status === "borderline") {
      const critique = buildCritique(asset);
      yield {
        id: `crit_${asset.id}`,
        task: "critique",
        images: [asset.asset_path],
        imageRefs: [imgRef],
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [{ type: "image" }, { type: "text", text: "Provide a style critique of this asset. What works, what fails, what are the key style signals?" }] },
          { role: "assistant", content: critique },
        ],
        binding: { ...binding, has_canon: true },
        metadata: {
          source_repo: repoInfo.name,
          extractor: "asset_record",
          extractor_version: EXTRACTOR_VERSION,
          asset_id: asset.id,
          status: asset.status,
          faction: asset.faction || undefined,
          signal_type: "style_critique",
          quality_score: Math.min(qualityScore + 0.1, 1.0),
          extracted_at: new Date().toISOString(),
        },
      };
    }

    // Canon explanation (only if canon_explanation exists)
    if (asset.canon_explanation) {
      yield {
        id: `canon_${asset.id}`,
        task: "critique",
        images: [asset.asset_path],
        imageRefs: [imgRef],
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [{ type: "image" }, { type: "text", text: `Why was this asset ${asset.status}? Explain the style judgment.` }] },
          { role: "assistant", content: asset.canon_explanation },
        ],
        binding: { ...binding, has_canon: true, triangle_complete: binding.has_image && binding.has_judgment },
        metadata: {
          source_repo: repoInfo.name,
          extractor: "asset_record",
          extractor_version: EXTRACTOR_VERSION,
          asset_id: asset.id,
          status: asset.status,
          signal_type: "canon_explanation",
          quality_score: Math.min(qualityScore + 0.15, 1.0),
          extracted_at: new Date().toISOString(),
        },
      };
    }
  }
}

// ── Comparison Extractor ──

export function* extractComparisons(
  repoInfo: VisualRepoInfo,
  systemPrompt: string
): Generator<VisualTrainingUnit> {
  const assetMap = new Map<string, AssetRecord>();
  for (const a of repoInfo.assets) assetMap.set(a.id, a);

  for (const cmp of repoInfo.comparisons) {
    if (cmp.chosen === "tie") continue; // exclude ties from DPO
    if (!cmp.asset_a_path || !cmp.asset_b_path) continue;

    const assetA = assetMap.get(cmp.asset_a_id);
    const assetB = assetMap.get(cmp.asset_b_id);
    const imgRefA = assetA ? imageRefFromAsset(assetA) : { path: cmp.asset_a_path, format: "png" as const, width: 0, height: 0, bytes: 0, valid: false };
    const imgRefB = assetB ? imageRefFromAsset(assetB) : { path: cmp.asset_b_path, format: "png" as const, width: 0, height: 0, bytes: 0, valid: false };
    const binding = computePreferenceBinding(assetA, assetB, cmp);
    const qualityScore = computeComparisonQuality(cmp);

    // DPO preference pair
    const winnerLabel = cmp.chosen === "a" ? "Image 1" : "Image 2";
    const loserLabel = cmp.chosen === "a" ? "Image 2" : "Image 1";

    const chosenResponse = cmp.reasoning
      ? `${winnerLabel} is more on-style. ${cmp.reasoning}`
      : `${winnerLabel} is more on-style.`;

    const rejectedResponse = `${loserLabel} is more on-style.`;

    yield {
      id: `pref_${cmp.id}`,
      task: "preference",
      images: [cmp.asset_a_path, cmp.asset_b_path],
      imageRefs: [imgRefA, imgRefB],
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: [
          { type: "image" }, { type: "image" },
          { type: "text", text: "Which image is more on-style? Explain your judgment." },
        ]},
        { role: "assistant", content: chosenResponse },
      ],
      binding,
      preferred_index: cmp.chosen === "a" ? 0 : 1,
      chosen: chosenResponse,
      rejected: rejectedResponse,
      metadata: {
        source_repo: repoInfo.name,
        extractor: "comparison",
        extractor_version: EXTRACTOR_VERSION,
        comparison_id: cmp.id,
        signal_type: "pairwise_preference",
        quality_score: qualityScore,
        extracted_at: new Date().toISOString(),
      },
    };

    // Contrastive pair (for CLIP-style training)
    const winnerAsset = cmp.chosen === "a" ? assetA : assetB;

    if (winnerAsset) {
      const winnerRef = cmp.chosen === "a" ? imgRefA : imgRefB;
      const loserRef = cmp.chosen === "a" ? imgRefB : imgRefA;
      yield {
        id: `contr_${cmp.id}`,
        task: "contrastive",
        images: [
          cmp.chosen === "a" ? cmp.asset_a_path : cmp.asset_b_path,
          cmp.chosen === "a" ? cmp.asset_b_path : cmp.asset_a_path,
        ],
        imageRefs: [winnerRef, loserRef],
        messages: [],
        binding: { ...binding, triangle_complete: false }, // contrastive has no canon text
        margin: 0.8,
        metadata: {
          source_repo: repoInfo.name,
          extractor: "comparison",
          extractor_version: EXTRACTOR_VERSION,
          comparison_id: cmp.id,
          signal_type: "pairwise_preference",
          quality_score: qualityScore * 0.8,
          extracted_at: new Date().toISOString(),
        },
      };
    }
  }
}

// ── Synthetic Pair Generator ──

export function* generateSyntheticPairs(
  repoInfo: VisualRepoInfo,
  systemPrompt: string
): Generator<{ comparison: ComparisonRecord; units: VisualTrainingUnit[] }> {
  const approved = repoInfo.assets.filter((a) => a.status === "approved");
  const rejected = repoInfo.assets.filter((a) => a.status === "rejected");

  // Existing comparison asset IDs to avoid duplicates
  const existingPairs = new Set<string>();
  for (const c of repoInfo.comparisons) {
    existingPairs.add(`${c.asset_a_id}:${c.asset_b_id}`);
    existingPairs.add(`${c.asset_b_id}:${c.asset_a_id}`);
  }

  for (const rej of rejected) {
    // Find nearest approved by: same faction > same lane > same view > any
    const match = findNearestApproved(rej, approved);
    if (!match) continue;

    const pairKey = `${match.id}:${rej.id}`;
    if (existingPairs.has(pairKey)) continue;
    existingPairs.add(pairKey);

    const cmp: ComparisonRecord = {
      id: `syn_${match.id}_vs_${rej.id}`,
      asset_a_id: match.id,
      asset_b_id: rej.id,
      asset_a_path: match.asset_path,
      asset_b_path: rej.asset_path,
      chosen: "a",
      source: "synthetic_status_pair",
      reasoning: null,
      criteria_scores: {},
      rubric_citations: [],
      reviewer: "synthetic",
      reviewed_at: new Date().toISOString(),
    };

    // Generate training units from this synthetic comparison
    const units: VisualTrainingUnit[] = [];
    for (const unit of extractComparisons({ ...repoInfo, comparisons: [cmp] }, systemPrompt)) {
      units.push(unit);
    }

    yield { comparison: cmp, units };
  }
}

function findNearestApproved(rejected: AssetRecord, approved: AssetRecord[]): AssetRecord | null {
  // Score each approved by similarity to the rejected
  let best: AssetRecord | null = null;
  let bestScore = -1;

  for (const app of approved) {
    let score = 0;
    if (app.faction && app.faction === rejected.faction) score += 3;
    if (app.lane && app.lane === rejected.lane) score += 2;
    if (app.view && app.view === rejected.view) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = app;
    }
  }

  return best;
}

// ── Constitution Linker ──

export async function* extractConstitutionLinked(
  repoInfo: VisualRepoInfo,
  systemPrompt: string
): AsyncGenerator<VisualTrainingUnit> {
  // Load canon docs
  const canonText = await loadDocTexts(repoInfo.canonDocs);
  const rubricText = await loadDocTexts(repoInfo.rubricDocs);

  if (!canonText && !rubricText) return;

  for (const asset of repoInfo.assets) {
    if (asset.canon_assertions.length === 0) continue;
    if (!asset.asset_path) continue;

    const imgRef = imageRefFromAsset(asset);
    const critique = buildGroundedCritique(asset, canonText, rubricText);
    const binding: BindingReport = {
      has_image: !!asset.image?.valid,
      has_canon: true, // constitution-linked always has canon
      has_judgment: true, // canon_assertions are judgments
      triangle_complete: !!asset.image?.valid,
    };

    yield {
      id: `grounded_${asset.id}`,
      task: "critique",
      images: [asset.asset_path],
      imageRefs: [imgRef],
      messages: [
        { role: "system", content: `${systemPrompt}\n\nStyle Constitution:\n${canonText?.slice(0, 2000) || "(not available)"}\n\nReview Rubric:\n${rubricText?.slice(0, 2000) || "(not available)"}` },
        { role: "user", content: [
          { type: "image" },
          { type: "text", text: "Evaluate this asset against the style constitution and review rubric. Cite specific rules." },
        ]},
        { role: "assistant", content: critique },
      ],
      binding,
      metadata: {
        source_repo: repoInfo.name,
        extractor: "constitution",
        extractor_version: EXTRACTOR_VERSION,
        asset_id: asset.id,
        status: asset.status,
        signal_type: "canon_grounded_critique",
        quality_score: 0.85,
        extracted_at: new Date().toISOString(),
      },
    };
  }
}

// ── Set Coherence Extractor ──

export function* extractSetCoherence(
  repoInfo: VisualRepoInfo,
  systemPrompt: string
): Generator<VisualTrainingUnit> {
  // Group assets by available grouping fields: faction, lane, character tag
  const groups = new Map<string, AssetRecord[]>();

  for (const asset of repoInfo.assets) {
    if (asset.status === "unknown" || asset.status === "wip") continue;
    if (!asset.asset_path) continue;

    const groupKeys: string[] = [];

    if (asset.faction) {
      groupKeys.push(`faction:${asset.faction}`);
    }
    if (asset.lane) {
      groupKeys.push(`lane:${asset.lane}`);
    }
    // Check tags for character/role groupings
    for (const tagKey of ["character", "role", "class"] as const) {
      const values = asset.tags[tagKey];
      if (values && values.length > 0) {
        for (const v of values) {
          groupKeys.push(`${tagKey}:${v}`);
        }
      }
    }

    // If no grouping field, skip (asset can't participate in coherence)
    if (groupKeys.length === 0) continue;

    for (const key of groupKeys) {
      let arr = groups.get(key);
      if (!arr) {
        arr = [];
        groups.set(key, arr);
      }
      arr.push(asset);
    }
  }

  // Emit coherence units for groups of 3+
  for (const [groupName, assets] of groups) {
    if (assets.length < 3) continue;

    const imageRefs = assets.map((a) => imageRefFromAsset(a));
    const imagePaths = assets.map((a) => a.asset_path);

    const approvedCount = assets.filter((a) => a.status === "approved").length;
    const rejectedCount = assets.filter((a) => a.status === "rejected").length;
    const borderlineCount = assets.filter((a) => a.status === "borderline").length;

    const allApproved = approvedCount === assets.length;

    let assistantMessage: string;
    if (allApproved) {
      assistantMessage = `These ${assets.length} assets from ${groupName} are stylistically coherent. All assets are approved and share consistent visual qualities.`;
    } else {
      const parts: string[] = [];
      parts.push(`These ${assets.length} assets from ${groupName} show inconsistency.`);
      if (approvedCount > 0) parts.push(`${approvedCount} approved`);
      if (rejectedCount > 0) parts.push(`${rejectedCount} rejected`);
      if (borderlineCount > 0) parts.push(`${borderlineCount} borderline`);
      assistantMessage = `${parts[0]} ${parts.slice(1).join(", ")}. The mix of approval states indicates visual style drift within this group.`;
    }

    // Binding: has_image if all refs are valid, has_canon from system prompt, has_judgment from status mix
    const has_image = imageRefs.every((r) => r.valid);
    const has_judgment = true; // coherence judgment from status analysis
    const binding: BindingReport = {
      has_image,
      has_canon: true, // system prompt provides canon context
      has_judgment,
      triangle_complete: has_image && has_judgment,
    };

    // Quality: higher for groups with more assets and clear signals
    const qualityScore = Math.min(0.5 + (assets.length * 0.05) + (allApproved ? 0.15 : 0), 1.0);

    const userContent: ContentPart[] = [
      ...assets.map((): ContentPart => ({ type: "image" })),
      { type: "text", text: `Evaluate the stylistic coherence of these ${assets.length} assets from ${groupName}.` },
    ];

    yield {
      id: `coh_${groupName.replace(/[^a-zA-Z0-9]/g, "_")}`,
      task: "coherence",
      images: imagePaths,
      imageRefs,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
        { role: "assistant", content: assistantMessage },
      ],
      binding,
      metadata: {
        source_repo: repoInfo.name,
        extractor: "set_coherence",
        extractor_version: EXTRACTOR_VERSION,
        faction: groupName,
        signal_type: "set_coherence" satisfies VisualSignalType,
        quality_score: qualityScore,
        extracted_at: new Date().toISOString(),
      },
    };
  }
}

// ── Helpers ──

function computeAssetQuality(asset: AssetRecord): number {
  let score = 0.3;
  if (asset.status_source === "record") score += 0.15;
  if (asset.canon_explanation) score += 0.15;
  if (asset.must_have.length > 0) score += 0.1;
  if (Object.keys(asset.tags).length > 0) score += 0.1;
  if (asset.failure_modes.length > 0) score += 0.1;
  if (asset.canon_assertions.length > 0) score += 0.1;
  return Math.min(score, 1.0);
}

function computeComparisonQuality(cmp: ComparisonRecord): number {
  let score = 0.4;
  if (cmp.reasoning) score += 0.2;
  if (Object.keys(cmp.criteria_scores).length > 0) score += 0.15;
  if (cmp.rubric_citations.length > 0) score += 0.15;
  if (cmp.source === "human") score += 0.1;
  return Math.min(score, 1.0);
}

function buildClassificationExplanation(asset: AssetRecord): string {
  const parts: string[] = [];
  parts.push(`${asset.status.toUpperCase()}.`);

  if (asset.canon_explanation) {
    parts.push(asset.canon_explanation);
  }

  if (asset.must_have.length > 0 && asset.status === "approved") {
    parts.push(`Satisfies: ${asset.must_have.join(", ")}.`);
  }

  if (asset.failure_modes.length > 0 && asset.status === "rejected") {
    parts.push(`Fails on: ${asset.failure_modes.join(", ")}.`);
  }

  if (asset.must_not_have.length > 0 && asset.status === "rejected") {
    parts.push(`Violates: ${asset.must_not_have.join(", ")}.`);
  }

  return parts.join(" ");
}

function buildBorderlineExplanation(asset: AssetRecord): string {
  const parts: string[] = [];
  parts.push("BORDERLINE. Near-miss quality, close to approval threshold.");

  if (asset.canon_explanation) {
    parts.push(asset.canon_explanation);
  }

  if (asset.must_have.length > 0) {
    const met = asset.failure_modes.length === 0 ? "Partially satisfies" : "Attempts";
    parts.push(`${met}: ${asset.must_have.join(", ")}.`);
  }

  if (asset.failure_modes.length > 0) {
    parts.push(`Issues preventing approval: ${asset.failure_modes.join(", ")}.`);
  }

  if (asset.must_not_have.length > 0) {
    parts.push(`Potential violations: ${asset.must_not_have.join(", ")}.`);
  }

  return parts.join(" ");
}

function buildCritique(asset: AssetRecord): string {
  const parts: string[] = [];
  parts.push(`STATUS: ${asset.status.toUpperCase()}`);

  if (Object.keys(asset.tags).length > 0) {
    for (const [category, values] of Object.entries(asset.tags)) {
      parts.push(`${category}: ${(values as string[]).join(", ")}`);
    }
  }

  if (asset.must_have.length > 0) {
    parts.push(`Must-have traits: ${asset.must_have.join("; ")}`);
  }

  if (asset.must_not_have.length > 0) {
    parts.push(`Must-not-have: ${asset.must_not_have.join("; ")}`);
  }

  if (asset.failure_modes.length > 0) {
    parts.push(`Failure modes: ${asset.failure_modes.join("; ")}`);
  }

  if (asset.canon_explanation) {
    parts.push(`Judgment: ${asset.canon_explanation}`);
  }

  return parts.join("\n");
}

function buildGroundedCritique(asset: AssetRecord, canon: string | null, rubric: string | null): string {
  const parts: string[] = [];

  for (const assertion of asset.canon_assertions) {
    const ruleText = assertion.rule_text || assertion.rule_id;
    parts.push(`[${assertion.rule_id}] ${ruleText}: ${assertion.verdict.toUpperCase()}`);
  }

  if (asset.failure_modes.length > 0) {
    parts.push(`\nIssues: ${asset.failure_modes.join("; ")}`);
  }

  if (asset.canon_explanation) {
    parts.push(`\nOverall: ${asset.canon_explanation}`);
  }

  return parts.join("\n") || `${asset.status.toUpperCase()}. No specific rule citations available.`;
}


async function loadDocTexts(docs: FileEntry[]): Promise<string | null> {
  if (docs.length === 0) return null;
  const texts: string[] = [];
  for (const doc of docs) {
    try {
      const content = await readFile(doc.path, "utf-8");
      texts.push(content);
    } catch {
      continue;
    }
  }
  return texts.join("\n\n---\n\n") || null;
}
