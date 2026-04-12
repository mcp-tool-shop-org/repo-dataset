/** Visual extractors — asset record, comparison, constitution linker, synthetic pairs */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { estimateTokens } from "../pipeline/tokens.js";
import type {
  AssetRecord, ComparisonRecord, VisualRepoInfo, FileEntry,
} from "../types.js";

const EXTRACTOR_VERSION = "1.0.0";

// ── Output record types ──

export interface VisualTrainingUnit {
  id: string;
  task: "classify" | "critique" | "preference" | "contrastive" | "coherence";
  images: string[];
  messages: Message[];
  metadata: VisualUnitMetadata;
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

interface Message {
  role: "system" | "user" | "assistant";
  content: ContentPart[] | string;
}

type ContentPart = { type: "image" } | { type: "text"; text: string };

interface VisualUnitMetadata {
  source_repo: string;
  extractor: string;
  asset_id?: string;
  comparison_id?: string;
  status?: string;
  faction?: string;
  signal_type: string;
  quality_score: number;
  extracted_at: string;
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

    // KTO classification: approved/rejected/borderline as label
    if (asset.status === "approved" || asset.status === "rejected") {
      const explanation = buildClassificationExplanation(asset);
      yield {
        id: `cls_${asset.id}`,
        task: "classify",
        images: [asset.asset_path],
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [{ type: "image" }, { type: "text", text: "Is this asset on-style? Classify as approved or rejected and explain." }] },
          { role: "assistant", content: explanation },
        ],
        label: asset.status === "approved",
        metadata: {
          source_repo: repoInfo.name,
          extractor: "asset_record",
          asset_id: asset.id,
          status: asset.status,
          faction: asset.faction || undefined,
          signal_type: "style_classification",
          quality_score: qualityScore,
          extracted_at: new Date().toISOString(),
        },
      };
    }

    // Critique pair (only for assets with rich metadata)
    if (hasRichMetadata) {
      const critique = buildCritique(asset);
      yield {
        id: `crit_${asset.id}`,
        task: "critique",
        images: [asset.asset_path],
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [{ type: "image" }, { type: "text", text: "Provide a style critique of this asset. What works, what fails, what are the key style signals?" }] },
          { role: "assistant", content: critique },
        ],
        metadata: {
          source_repo: repoInfo.name,
          extractor: "asset_record",
          asset_id: asset.id,
          status: asset.status,
          faction: asset.faction || undefined,
          signal_type: "style_critique",
          quality_score: qualityScore + 0.1, // critiques with rich data are higher value
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
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [{ type: "image" }, { type: "text", text: `Why was this asset ${asset.status}? Explain the style judgment.` }] },
          { role: "assistant", content: asset.canon_explanation },
        ],
        metadata: {
          source_repo: repoInfo.name,
          extractor: "asset_record",
          asset_id: asset.id,
          status: asset.status,
          signal_type: "canon_explanation",
          quality_score: qualityScore + 0.15,
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
  for (const cmp of repoInfo.comparisons) {
    if (cmp.chosen === "tie") continue; // exclude ties from DPO
    if (!cmp.asset_a_path || !cmp.asset_b_path) continue;

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
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: [
          { type: "image" }, { type: "image" },
          { type: "text", text: "Which image is more on-style? Explain your judgment." },
        ]},
        { role: "assistant", content: chosenResponse },
      ],
      preferred_index: cmp.chosen === "a" ? 0 : 1,
      chosen: chosenResponse,
      rejected: rejectedResponse,
      metadata: {
        source_repo: repoInfo.name,
        extractor: "comparison",
        comparison_id: cmp.id,
        signal_type: "pairwise_preference",
        quality_score: qualityScore,
        extracted_at: new Date().toISOString(),
      },
    };

    // Contrastive pair (for CLIP-style training)
    const winnerAsset = cmp.chosen === "a"
      ? repoInfo.assets.find((a) => a.id === cmp.asset_a_id)
      : repoInfo.assets.find((a) => a.id === cmp.asset_b_id);

    if (winnerAsset) {
      const anchorText = buildAnchorText(winnerAsset);
      yield {
        id: `contr_${cmp.id}`,
        task: "contrastive",
        images: [
          cmp.chosen === "a" ? cmp.asset_a_path : cmp.asset_b_path,
          cmp.chosen === "a" ? cmp.asset_b_path : cmp.asset_a_path,
        ],
        messages: [],
        margin: 0.8,
        metadata: {
          source_repo: repoInfo.name,
          extractor: "comparison",
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

    const citations = asset.canon_assertions
      .map((a) => `[${a.rule_id}] ${a.rule_text || ""}: ${a.verdict}`)
      .join("\n");

    const critique = buildGroundedCritique(asset, canonText, rubricText);

    yield {
      id: `grounded_${asset.id}`,
      task: "critique",
      images: [asset.asset_path],
      messages: [
        { role: "system", content: `${systemPrompt}\n\nStyle Constitution:\n${canonText?.slice(0, 2000) || "(not available)"}\n\nReview Rubric:\n${rubricText?.slice(0, 2000) || "(not available)"}` },
        { role: "user", content: [
          { type: "image" },
          { type: "text", text: "Evaluate this asset against the style constitution and review rubric. Cite specific rules." },
        ]},
        { role: "assistant", content: critique },
      ],
      metadata: {
        source_repo: repoInfo.name,
        extractor: "constitution",
        asset_id: asset.id,
        status: asset.status,
        signal_type: "canon_grounded_critique",
        quality_score: 0.85, // grounded critiques are high value
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

function buildAnchorText(asset: AssetRecord): string {
  const parts: string[] = [];
  if (asset.status === "approved") parts.push("on-style");
  if (asset.faction) parts.push(asset.faction);
  if (asset.lane) parts.push(asset.lane);
  for (const [cat, vals] of Object.entries(asset.tags)) {
    parts.push(`${cat}: ${(vals as string[]).join(", ")}`);
  }
  return parts.join(", ") || asset.id;
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
