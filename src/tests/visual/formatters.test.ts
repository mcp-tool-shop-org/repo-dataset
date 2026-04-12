import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getVisualFormatter, isValidVisualFormat, getAllVisualFormats } from "../../visual/formatters.js";
import type { VisualTrainingUnit } from "../../visual/extractors.js";

const MOCK_IMG_REF = { path: "assets/approved/test.png", format: "png" as const, width: 64, height: 64, bytes: 512, valid: true };
const MOCK_IMG_REF_B = { path: "assets/rejected/b.png", format: "png" as const, width: 64, height: 64, bytes: 512, valid: true };
const BINDING_FULL = { has_image: true, has_canon: true, has_judgment: true, triangle_complete: true };
const BINDING_NO_CANON = { has_image: true, has_canon: false, has_judgment: true, triangle_complete: false };

function makeClassifyUnit(approved = true): VisualTrainingUnit {
  return {
    id: "cls_test_001",
    task: "classify",
    images: ["assets/approved/test.png"],
    imageRefs: [MOCK_IMG_REF],
    messages: [
      { role: "system", content: "You are a style judge." },
      { role: "user", content: [{ type: "image" }, { type: "text", text: "Is this on-style?" }] },
      { role: "assistant", content: approved ? "APPROVED. On-style." : "REJECTED. Off-style." },
    ],
    binding: BINDING_FULL,
    label: approved,
    metadata: {
      source_repo: "test", extractor: "asset_record", extractor_version: "1.1.0", asset_id: "test_001",
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
    imageRefs: [{ ...MOCK_IMG_REF, path: "assets/approved/a.png" }, MOCK_IMG_REF_B],
    messages: [
      { role: "system", content: "You are a style judge." },
      { role: "user", content: [{ type: "image" }, { type: "image" }, { type: "text", text: "Which is more on-style?" }] },
      { role: "assistant", content: "Image 1 is better. Cleaner silhouette." },
    ],
    binding: BINDING_FULL,
    preferred_index: 0,
    chosen: "Image 1 is better. Cleaner silhouette.",
    rejected: "Image 2 is more on-style.",
    metadata: {
      source_repo: "test", extractor: "comparison", extractor_version: "1.1.0", comparison_id: "cmp_test",
      signal_type: "pairwise_preference", quality_score: 0.8, extracted_at: new Date().toISOString(),
    },
  };
}

function makeContrastiveUnit(): VisualTrainingUnit {
  return {
    id: "contr_test_001",
    task: "contrastive",
    images: ["assets/approved/a.png", "assets/rejected/b.png"],
    imageRefs: [{ ...MOCK_IMG_REF, path: "assets/approved/a.png" }, MOCK_IMG_REF_B],
    messages: [],
    binding: BINDING_NO_CANON,
    margin: 0.8,
    metadata: {
      source_repo: "test", extractor: "comparison", extractor_version: "1.1.0", comparison_id: "cmp_test",
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
    unit.imageRefs = [MOCK_IMG_REF];
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

  it("getAllVisualFormats returns 10", () => {
    const formats = getAllVisualFormats();
    assert.equal(formats.length, 10);
  });

  it("getVisualFormatter returns correct name", () => {
    const fmt = getVisualFormatter("visual_dpo");
    assert.equal(fmt.name, "visual_dpo");
  });

  it("all framework-native formats exist", () => {
    for (const name of ["trl", "axolotl", "llava", "llama_factory", "qwen2vl"] as const) {
      assert.ok(isValidVisualFormat(name), `${name} should be valid`);
      const fmt = getVisualFormatter(name);
      assert.equal(fmt.name, name);
    }
  });
});

// ══════════════════════════════════════════════
// Framework-Native Format Tests (Phase 3)
// ══════════════════════════════════════════════

describe("TrlFormatter", () => {
  const fmt = getVisualFormatter("trl");

  it("formats classify as SFT with messages + images", () => {
    const line = fmt.formatUnit(makeClassifyUnit());
    assert.ok(line);
    const parsed = JSON.parse(line);
    assert.ok(Array.isArray(parsed.messages));
    assert.ok(Array.isArray(parsed.images));
    assert.equal(parsed.images.length, 1);
  });

  it("formats preference as DPO with prompt/chosen/rejected", () => {
    const line = fmt.formatUnit(makePreferenceUnit());
    assert.ok(line);
    const parsed = JSON.parse(line);
    assert.ok(Array.isArray(parsed.prompt));
    assert.ok(Array.isArray(parsed.chosen));
    assert.ok(Array.isArray(parsed.rejected));
    assert.ok(Array.isArray(parsed.images));
    assert.equal(parsed.images.length, 2);
  });

  it("SFT messages use content-array with image placeholder", () => {
    const parsed = JSON.parse(fmt.formatUnit(makeClassifyUnit())!);
    const userMsg = parsed.messages.find((m: { role: string }) => m.role === "user");
    assert.ok(Array.isArray(userMsg.content));
    assert.ok(userMsg.content.some((p: { type: string }) => p.type === "image"));
  });
});

describe("AxolotlFormatter", () => {
  const fmt = getVisualFormatter("axolotl");

  it("formats classify with messages array", () => {
    const line = fmt.formatUnit(makeClassifyUnit());
    assert.ok(line);
    const parsed = JSON.parse(line);
    assert.ok(Array.isArray(parsed.messages));
  });

  it("image refs include path field", () => {
    const parsed = JSON.parse(fmt.formatUnit(makeClassifyUnit())!);
    const userMsg = parsed.messages.find((m: { role: string }) => m.role === "user");
    const imgPart = userMsg.content.find((p: { type: string }) => p.type === "image");
    assert.ok(imgPart);
    assert.ok(imgPart.path);
  });

  it("returns null for contrastive", () => {
    assert.equal(fmt.formatUnit(makeContrastiveUnit()), null);
  });
});

describe("LlavaFormatter", () => {
  const fmt = getVisualFormatter("llava");

  it("formats classify with id/image/conversations", () => {
    const line = fmt.formatUnit(makeClassifyUnit());
    assert.ok(line);
    const parsed = JSON.parse(line);
    assert.ok(parsed.id);
    assert.ok(parsed.image);
    assert.ok(Array.isArray(parsed.conversations));
  });

  it("conversations use from/value format", () => {
    const parsed = JSON.parse(fmt.formatUnit(makeClassifyUnit())!);
    for (const turn of parsed.conversations) {
      assert.ok(turn.from === "human" || turn.from === "gpt");
      assert.ok(typeof turn.value === "string");
    }
  });

  it("human turn contains <image> token", () => {
    const parsed = JSON.parse(fmt.formatUnit(makeClassifyUnit())!);
    const human = parsed.conversations.find((c: { from: string }) => c.from === "human");
    assert.ok(human.value.includes("<image>"));
  });

  it("returns null for preference (no DPO support)", () => {
    assert.equal(fmt.formatUnit(makePreferenceUnit()), null);
  });
});

describe("LlamaFactoryFormatter", () => {
  const fmt = getVisualFormatter("llama_factory");

  it("formats SFT with images + conversations", () => {
    const line = fmt.formatUnit(makeClassifyUnit());
    assert.ok(line);
    const parsed = JSON.parse(line);
    assert.ok(Array.isArray(parsed.images));
    assert.ok(Array.isArray(parsed.conversations));
  });

  it("formats DPO with chosen/rejected objects", () => {
    const line = fmt.formatUnit(makePreferenceUnit());
    assert.ok(line);
    const parsed = JSON.parse(line);
    assert.ok(parsed.chosen);
    assert.ok(parsed.rejected);
    assert.equal(parsed.chosen.from, "gpt");
    assert.equal(parsed.rejected.from, "gpt");
  });

  it("conversations use human/gpt from fields", () => {
    const parsed = JSON.parse(fmt.formatUnit(makeClassifyUnit())!);
    for (const turn of parsed.conversations) {
      assert.ok(turn.from === "human" || turn.from === "gpt" || turn.from === "system");
    }
  });
});

describe("Qwen2VlFormatter", () => {
  const fmt = getVisualFormatter("qwen2vl");

  it("formats with query/response/images", () => {
    const line = fmt.formatUnit(makeClassifyUnit());
    assert.ok(line);
    const parsed = JSON.parse(line);
    assert.ok(typeof parsed.query === "string");
    assert.ok(typeof parsed.response === "string");
    assert.ok(Array.isArray(parsed.images));
  });

  it("query contains <image> token", () => {
    const parsed = JSON.parse(fmt.formatUnit(makeClassifyUnit())!);
    assert.ok(parsed.query.includes("<image>"));
  });

  it("DPO adds rejected_response field", () => {
    const line = fmt.formatUnit(makePreferenceUnit());
    assert.ok(line);
    const parsed = JSON.parse(line);
    assert.ok(parsed.rejected_response);
    assert.ok(typeof parsed.response === "string");
  });
});
