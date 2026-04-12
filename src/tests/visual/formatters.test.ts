import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getVisualFormatter, isValidVisualFormat, getAllVisualFormats } from "../../visual/formatters.js";
import type { VisualTrainingUnit } from "../../visual/extractors.js";

function makeClassifyUnit(approved = true): VisualTrainingUnit {
  return {
    id: "cls_test_001",
    task: "classify",
    images: ["assets/approved/test.png"],
    messages: [
      { role: "system", content: "You are a style judge." },
      { role: "user", content: [{ type: "image" }, { type: "text", text: "Is this on-style?" }] },
      { role: "assistant", content: approved ? "APPROVED. On-style." : "REJECTED. Off-style." },
    ],
    label: approved,
    metadata: {
      source_repo: "test", extractor: "asset_record", asset_id: "test_001",
      status: approved ? "approved" : "rejected",
      signal_type: "style_classification", quality_score: 0.7, extracted_at: new Date().toISOString(),
    },
  };
}

function makePreferenceUnit(): VisualTrainingUnit {
  return {
    id: "pref_test_001",
    task: "preference",
    images: ["assets/approved/a.png", "assets/rejected/b.png"],
    messages: [
      { role: "system", content: "You are a style judge." },
      { role: "user", content: [{ type: "image" }, { type: "image" }, { type: "text", text: "Which is more on-style?" }] },
      { role: "assistant", content: "Image 1 is better. Cleaner silhouette." },
    ],
    preferred_index: 0,
    chosen: "Image 1 is better. Cleaner silhouette.",
    rejected: "Image 2 is more on-style.",
    metadata: {
      source_repo: "test", extractor: "comparison", comparison_id: "cmp_test",
      signal_type: "pairwise_preference", quality_score: 0.8, extracted_at: new Date().toISOString(),
    },
  };
}

function makeContrastiveUnit(): VisualTrainingUnit {
  return {
    id: "contr_test_001",
    task: "contrastive",
    images: ["assets/approved/a.png", "assets/rejected/b.png"],
    messages: [],
    margin: 0.8,
    metadata: {
      source_repo: "test", extractor: "comparison", comparison_id: "cmp_test",
      signal_type: "pairwise_preference", quality_score: 0.6, extracted_at: new Date().toISOString(),
    },
  };
}

describe("UniversalFormatter", () => {
  const fmt = getVisualFormatter("visual_universal");

  it("formats classify unit", () => {
    const line = fmt.formatUnit(makeClassifyUnit());
    assert.ok(line);
    const parsed = JSON.parse(line);
    assert.ok(parsed.id);
    assert.equal(parsed.task, "classify");
    assert.ok(parsed.images);
    assert.ok(parsed.messages);
    assert.ok(parsed.metadata);
  });

  it("formats preference unit", () => {
    const line = fmt.formatUnit(makePreferenceUnit());
    assert.ok(line);
    const parsed = JSON.parse(line);
    assert.equal(parsed.preferred_index, 0);
  });

  it("includes label for classify", () => {
    const line = fmt.formatUnit(makeClassifyUnit(true))!;
    const parsed = JSON.parse(line);
    assert.equal(parsed.label, true);
  });

  it("does NOT include undefined fields", () => {
    const line = fmt.formatUnit(makeClassifyUnit())!;
    assert.ok(!line.includes('"chosen"'), "Classify unit should not have chosen field");
  });
});

describe("DPOFormatter", () => {
  const fmt = getVisualFormatter("visual_dpo");

  it("returns null for non-preference units", () => {
    assert.equal(fmt.formatUnit(makeClassifyUnit()), null);
  });

  it("formats preference unit correctly", () => {
    const line = fmt.formatUnit(makePreferenceUnit());
    assert.ok(line);
    const parsed = JSON.parse(line);
    assert.ok(parsed.images);
    assert.ok(parsed.prompt);
    assert.ok(parsed.chosen);
    assert.ok(parsed.rejected);
  });

  it("chosen is array with assistant message", () => {
    const parsed = JSON.parse(fmt.formatUnit(makePreferenceUnit())!);
    assert.equal(parsed.chosen[0].role, "assistant");
  });

  it("rejected is array with assistant message", () => {
    const parsed = JSON.parse(fmt.formatUnit(makePreferenceUnit())!);
    assert.equal(parsed.rejected[0].role, "assistant");
  });

  it("prompt includes system + user messages", () => {
    const parsed = JSON.parse(fmt.formatUnit(makePreferenceUnit())!);
    assert.ok(parsed.prompt.length >= 1);
  });

  it("images array preserved", () => {
    const parsed = JSON.parse(fmt.formatUnit(makePreferenceUnit())!);
    assert.equal(parsed.images.length, 2);
  });
});

describe("KTOFormatter", () => {
  const fmt = getVisualFormatter("visual_kto");

  it("returns null for non-classify units", () => {
    assert.equal(fmt.formatUnit(makePreferenceUnit()), null);
  });

  it("formats classify unit", () => {
    const line = fmt.formatUnit(makeClassifyUnit());
    assert.ok(line);
    const parsed = JSON.parse(line);
    assert.ok(parsed.image);
    assert.ok(parsed.prompt !== undefined);
    assert.ok(parsed.completion);
    assert.ok(parsed.label !== undefined);
  });

  it("image is single path", () => {
    const parsed = JSON.parse(fmt.formatUnit(makeClassifyUnit())!);
    assert.equal(typeof parsed.image, "string");
  });

  it("label is boolean", () => {
    const parsed = JSON.parse(fmt.formatUnit(makeClassifyUnit())!);
    assert.equal(typeof parsed.label, "boolean");
  });

  it("approved → label true", () => {
    const parsed = JSON.parse(fmt.formatUnit(makeClassifyUnit(true))!);
    assert.equal(parsed.label, true);
  });

  it("rejected → label false", () => {
    const parsed = JSON.parse(fmt.formatUnit(makeClassifyUnit(false))!);
    assert.equal(parsed.label, false);
  });
});

describe("ContrastiveFormatter", () => {
  const fmt = getVisualFormatter("visual_contrastive");

  it("returns null for non-contrastive units", () => {
    assert.equal(fmt.formatUnit(makeClassifyUnit()), null);
  });

  it("formats contrastive unit", () => {
    const line = fmt.formatUnit(makeContrastiveUnit());
    assert.ok(line);
    const parsed = JSON.parse(line);
    assert.ok(parsed.positive_image);
    assert.ok(parsed.negative_image);
    assert.ok(typeof parsed.margin === "number");
  });

  it("positive_image is first image", () => {
    const unit = makeContrastiveUnit();
    const parsed = JSON.parse(fmt.formatUnit(unit)!);
    assert.equal(parsed.positive_image, unit.images[0]);
  });

  it("negative_image is second image", () => {
    const unit = makeContrastiveUnit();
    const parsed = JSON.parse(fmt.formatUnit(unit)!);
    assert.equal(parsed.negative_image, unit.images[1]);
  });

  it("returns null if < 2 images", () => {
    const unit = makeContrastiveUnit();
    unit.images = ["only-one.png"];
    assert.equal(fmt.formatUnit(unit), null);
  });
});

describe("PointwiseFormatter", () => {
  const fmt = getVisualFormatter("visual_pointwise");

  it("returns null if no scores", () => {
    assert.equal(fmt.formatUnit(makeClassifyUnit()), null);
  });

  it("formats pointwise unit", () => {
    const unit = makeClassifyUnit();
    unit.scores = { silhouette: 8, palette: 7 };
    const line = fmt.formatUnit(unit);
    assert.ok(line);
    const parsed = JSON.parse(line);
    assert.ok(parsed.scores);
    assert.equal(typeof parsed.scores.silhouette, "number");
  });
});

describe("Visual Format Registry", () => {
  it("isValidVisualFormat visual_universal", () => {
    assert.equal(isValidVisualFormat("visual_universal"), true);
  });

  it("isValidVisualFormat visual_dpo", () => {
    assert.equal(isValidVisualFormat("visual_dpo"), true);
  });

  it("isValidVisualFormat invalid", () => {
    assert.equal(isValidVisualFormat("invalid"), false);
  });

  it("getAllVisualFormats returns 5", () => {
    const formats = getAllVisualFormats();
    assert.equal(formats.length, 5);
  });

  it("getVisualFormatter returns correct name", () => {
    const fmt = getVisualFormatter("visual_dpo");
    assert.equal(fmt.name, "visual_dpo");
  });
});
