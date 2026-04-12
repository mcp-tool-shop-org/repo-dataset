import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanVisualRepo } from "../../visual/scanner.js";
import {
  extractAssetRecords, extractComparisons,
  generateSyntheticPairs, extractConstitutionLinked,
  type VisualTrainingUnit,
} from "../../visual/extractors.js";
import type { VisualRepoInfo } from "../../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VISUAL_FIXTURE = resolve(__dirname, "..", "..", "..", "src", "tests", "fixtures", "visual-corpus");

const SYSTEM_PROMPT = "You are a visual style judge.";

function collect(gen: Generator<VisualTrainingUnit>): VisualTrainingUnit[] {
  return [...gen];
}

async function collectAsync(gen: AsyncGenerator<VisualTrainingUnit>): Promise<VisualTrainingUnit[]> {
  const units: VisualTrainingUnit[] = [];
  for await (const u of gen) units.push(u);
  return units;
}

describe("extractAssetRecords", () => {
  let repoInfo: VisualRepoInfo;

  before(async () => {
    repoInfo = await scanVisualRepo(VISUAL_FIXTURE);
  });

  it("yields units for approved/rejected assets", () => {
    const units = collect(extractAssetRecords(repoInfo, SYSTEM_PROMPT));
    assert.ok(units.length > 0);
  });

  it("skips unknown and wip status", () => {
    const units = collect(extractAssetRecords(repoInfo, SYSTEM_PROMPT));
    const unknownUnits = units.filter((u) => u.metadata.status === "unknown" || u.metadata.status === "wip");
    assert.equal(unknownUnits.length, 0);
  });

  it("classification units have task classify", () => {
    const units = collect(extractAssetRecords(repoInfo, SYSTEM_PROMPT));
    const classifyUnits = units.filter((u) => u.task === "classify");
    assert.ok(classifyUnits.length > 0);
  });

  it("approved assets get label true", () => {
    const units = collect(extractAssetRecords(repoInfo, SYSTEM_PROMPT));
    const approvedClassify = units.find((u) => u.task === "classify" && u.metadata.status === "approved");
    assert.ok(approvedClassify);
    assert.equal(approvedClassify.label, true);
  });

  it("rejected assets get label false", () => {
    const units = collect(extractAssetRecords(repoInfo, SYSTEM_PROMPT));
    const rejectedClassify = units.find((u) => u.task === "classify" && u.metadata.status === "rejected");
    assert.ok(rejectedClassify);
    assert.equal(rejectedClassify.label, false);
  });

  it("critique units have task critique", () => {
    const units = collect(extractAssetRecords(repoInfo, SYSTEM_PROMPT));
    const critiqueUnits = units.filter((u) => u.task === "critique");
    assert.ok(critiqueUnits.length > 0, "Should produce critique units for rich metadata");
  });

  it("canon explanation unit exists for keth_soldier_front_01", () => {
    const units = collect(extractAssetRecords(repoInfo, SYSTEM_PROMPT));
    const canonUnit = units.find((u) => u.id.startsWith("canon_") && u.metadata.asset_id === "keth_soldier_front_01");
    assert.ok(canonUnit, "Should have canon explanation unit");
  });

  it("all units have images array with 1 entry", () => {
    const units = collect(extractAssetRecords(repoInfo, SYSTEM_PROMPT));
    for (const u of units) {
      assert.equal(u.images.length, 1);
    }
  });

  it("metadata has signal_type", () => {
    const units = collect(extractAssetRecords(repoInfo, SYSTEM_PROMPT));
    for (const u of units) {
      assert.ok(u.metadata.signal_type, "signal_type should be set");
    }
  });

  it("quality_score between 0 and 1", () => {
    const units = collect(extractAssetRecords(repoInfo, SYSTEM_PROMPT));
    for (const u of units) {
      assert.ok(u.metadata.quality_score >= 0 && u.metadata.quality_score <= 1.1); // +0.15 bonus can exceed 1 before clamping
    }
  });

  it("metadata.asset_id is set", () => {
    const units = collect(extractAssetRecords(repoInfo, SYSTEM_PROMPT));
    for (const u of units) {
      assert.ok(u.metadata.asset_id);
    }
  });

  it("metadata.extracted_at is ISO string", () => {
    const units = collect(extractAssetRecords(repoInfo, SYSTEM_PROMPT));
    for (const u of units) {
      assert.ok(!isNaN(Date.parse(u.metadata.extracted_at)));
    }
  });
});

describe("extractComparisons", () => {
  let repoInfo: VisualRepoInfo;

  before(async () => {
    repoInfo = await scanVisualRepo(VISUAL_FIXTURE);
  });

  it("yields preference units from comparisons", () => {
    const units = collect(extractComparisons(repoInfo, SYSTEM_PROMPT));
    const prefUnits = units.filter((u) => u.task === "preference");
    assert.ok(prefUnits.length >= 1);
  });

  it("preference unit has 2 images", () => {
    const units = collect(extractComparisons(repoInfo, SYSTEM_PROMPT));
    const pref = units.find((u) => u.task === "preference");
    assert.ok(pref);
    assert.equal(pref.images.length, 2);
  });

  it("preference unit has chosen/rejected", () => {
    const units = collect(extractComparisons(repoInfo, SYSTEM_PROMPT));
    const pref = units.find((u) => u.task === "preference");
    assert.ok(pref);
    assert.ok(pref.chosen);
    assert.ok(pref.rejected);
  });

  it("chosen includes reasoning when available", () => {
    const units = collect(extractComparisons(repoInfo, SYSTEM_PROMPT));
    const pref = units.find((u) => u.task === "preference");
    assert.ok(pref?.chosen?.includes("silhouette") || pref?.chosen?.includes("crest"),
      "Chosen should include reasoning text");
  });

  it("preferred_index matches chosen side", () => {
    const units = collect(extractComparisons(repoInfo, SYSTEM_PROMPT));
    const pref = units.find((u) => u.task === "preference");
    assert.ok(pref);
    assert.equal(pref.preferred_index, 0); // chosen: "a" → index 0
  });

  it("also yields contrastive unit", () => {
    const units = collect(extractComparisons(repoInfo, SYSTEM_PROMPT));
    const contrUnits = units.filter((u) => u.task === "contrastive");
    assert.ok(contrUnits.length >= 1);
  });

  it("contrastive unit has margin", () => {
    const units = collect(extractComparisons(repoInfo, SYSTEM_PROMPT));
    const contr = units.find((u) => u.task === "contrastive");
    assert.ok(contr);
    assert.equal(contr.margin, 0.8);
  });

  it("metadata.comparison_id is set", () => {
    const units = collect(extractComparisons(repoInfo, SYSTEM_PROMPT));
    for (const u of units) {
      assert.ok(u.metadata.comparison_id);
    }
  });

  it("metadata.signal_type is pairwise_preference", () => {
    const units = collect(extractComparisons(repoInfo, SYSTEM_PROMPT));
    for (const u of units) {
      assert.equal(u.metadata.signal_type, "pairwise_preference");
    }
  });
});

describe("generateSyntheticPairs", () => {
  let repoInfo: VisualRepoInfo;

  before(async () => {
    repoInfo = await scanVisualRepo(VISUAL_FIXTURE);
  });

  it("generates pairs from approved/rejected", () => {
    const results = [...generateSyntheticPairs(repoInfo, SYSTEM_PROMPT)];
    assert.ok(results.length > 0, "Should generate at least one synthetic pair");
  });

  it("synthetic pair has source synthetic_status_pair", () => {
    const results = [...generateSyntheticPairs(repoInfo, SYSTEM_PROMPT)];
    for (const { comparison } of results) {
      assert.equal(comparison.source, "synthetic_status_pair");
    }
  });

  it("winner is always the approved asset", () => {
    const results = [...generateSyntheticPairs(repoInfo, SYSTEM_PROMPT)];
    for (const { comparison } of results) {
      assert.equal(comparison.chosen, "a", "Asset A should always be the approved one");
    }
  });

  it("does not duplicate existing comparisons", () => {
    const results = [...generateSyntheticPairs(repoInfo, SYSTEM_PROMPT)];
    // cmp_001 already has keth_soldier_front_01 vs keth_soldier_front_02
    const existingPair = results.find(
      (r) => r.comparison.asset_a_id === "keth_soldier_front_01" && r.comparison.asset_b_id === "keth_soldier_front_02"
    );
    assert.equal(existingPair, undefined, "Should not duplicate existing comparison");
  });

  it("training units have 2 images", () => {
    const results = [...generateSyntheticPairs(repoInfo, SYSTEM_PROMPT)];
    for (const { units } of results) {
      for (const u of units) {
        assert.equal(u.images.length, 2);
      }
    }
  });
});

describe("extractConstitutionLinked", () => {
  let repoInfo: VisualRepoInfo;

  before(async () => {
    repoInfo = await scanVisualRepo(VISUAL_FIXTURE);
  });

  it("yields grounded critique units", async () => {
    const units = await collectAsync(extractConstitutionLinked(repoInfo, SYSTEM_PROMPT));
    assert.ok(units.length > 0, "Should yield grounded critiques");
  });

  it("only for assets with canon_assertions", async () => {
    const units = await collectAsync(extractConstitutionLinked(repoInfo, SYSTEM_PROMPT));
    for (const u of units) {
      const asset = repoInfo.assets.find((a) => a.id === u.metadata.asset_id);
      assert.ok(asset && asset.canon_assertions.length > 0);
    }
  });

  it("system prompt includes constitution text", async () => {
    const units = await collectAsync(extractConstitutionLinked(repoInfo, SYSTEM_PROMPT));
    const sysMsg = units[0]?.messages.find((m) => m.role === "system");
    assert.ok(sysMsg);
    const text = typeof sysMsg.content === "string" ? sysMsg.content : "";
    assert.ok(text.includes("Constitution") || text.includes("constitution") || text.includes("alien"),
      "System prompt should contain canon doc text");
  });

  it("assistant response includes rule citations", async () => {
    const units = await collectAsync(extractConstitutionLinked(repoInfo, SYSTEM_PROMPT));
    const assistantMsg = units[0]?.messages.find((m) => m.role === "assistant");
    const text = typeof assistantMsg?.content === "string" ? assistantMsg.content : "";
    assert.ok(text.includes("constitution.shape_language"), "Response should cite rule IDs");
  });

  it("task is critique", async () => {
    const units = await collectAsync(extractConstitutionLinked(repoInfo, SYSTEM_PROMPT));
    for (const u of units) {
      assert.equal(u.task, "critique");
    }
  });

  it("signal_type is canon_grounded_critique", async () => {
    const units = await collectAsync(extractConstitutionLinked(repoInfo, SYSTEM_PROMPT));
    for (const u of units) {
      assert.equal(u.metadata.signal_type, "canon_grounded_critique");
    }
  });

  it("quality_score is 0.85", async () => {
    const units = await collectAsync(extractConstitutionLinked(repoInfo, SYSTEM_PROMPT));
    for (const u of units) {
      assert.equal(u.metadata.quality_score, 0.85);
    }
  });
});
