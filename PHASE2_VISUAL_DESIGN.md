# Phase 2 — Visual Learning Spine

Research synthesis from investigations into multimodal training formats, preference/ranking datasets, and style corpus structures.

**Core thesis:** repo-dataset compiles visual style repos into multimodal, canon-bound training examples for style judgment — not image generation.

---

## What This Phase Teaches Models

| Learning Unit | Input | Output | Value |
|---------------|-------|--------|-------|
| **Asset → canon explanation** | Image + record | Why approved/rejected, must-have/must-not-have | Style recognition |
| **Pairwise ranking** | Image A + Image B | Which is more on-style + why | Highest-value visual signal |
| **Asset → labels** | Image | Status, faction, tags, palette, silhouette | Classification |
| **Canon-grounded critique** | Image + constitution/rubric | What's off-style + correction direction | Style critique |

---

## Repo Folder Contract

The compiler accepts repos with this shape (all parts optional — it extracts what exists):

```
assets/
  approved/         # Status from folder name
  rejected/
  borderline/
  wip/
records/            # Per-asset structured JSON
  keth_soldier_front_01.json
comparisons/        # A vs B judgments
  cmp_001.json
docs/
  constitution.md   # Non-negotiable style rules
  review-rubric.md  # Grading criteria
  palette.md        # Color rules
```

### Structure detection tiers

| Tier | Signal | Confidence |
|------|--------|------------|
| **Perfect** | Every asset has a record JSON + explicit comparisons + canon links | Full extraction |
| **Structured** | Status folders + some records, sparse comparisons | Good extraction, synthetic pairs from status |
| **Partial** | Status folders only, no records | Labels from folders, filename parsing |
| **Messy** | Flat folder, filenames only | Filename inference, low confidence |

The compiler reports `structure_detected` and `extraction_yield` so users know what they got.

---

## Asset Record Schema

The atomic unit of the visual corpus:

```json
{
  "id": "keth_soldier_front_01",
  "asset_path": "assets/approved/keth_soldier_front_01.png",
  "status": "approved",
  "status_source": "folder",
  "lane": "character",
  "faction": "keth_communion",
  "view": "front",
  "tags": {
    "shape_language": ["grown armor", "segmented", "organic crest"],
    "palette": ["amber", "bone", "cyan accent"],
    "materials": ["chitin", "resin", "soft glow"],
    "silhouette": ["top-heavy", "hooked forearms"]
  },
  "must_have": [
    "grown-not-forged armor feel",
    "alien silhouette first"
  ],
  "must_not_have": [
    "generic human sci-fi armor",
    "surface noise over mass clarity"
  ],
  "canon_explanation": "Approved because the silhouette and material language read as Communion before details are inspected.",
  "failure_modes": [
    "too terran in torso structure",
    "too symmetrical and manufactured"
  ],
  "neighbors": ["keth_soldier_side_01", "keth_priest_front_02"],
  "canon_assertions": [
    {"rule_id": "constitution.shape_language.1", "verdict": "pass", "reviewer": "human:mike"},
    {"rule_id": "rubric.silhouette_readable", "verdict": "pass", "reviewer": "auto:siglip2"}
  ]
}
```

### Comparison Record Schema

```json
{
  "id": "cmp_001",
  "asset_a": "keth_soldier_front_01",
  "asset_b": "keth_soldier_front_02",
  "chosen": "a",
  "source": "human",
  "reasoning": "A has cleaner faction silhouette — the organic crest reads at 64px while B's merges with the shoulder.",
  "criteria_scores": {
    "silhouette_clarity": {"a": 9, "b": 5},
    "palette_adherence": {"a": 8, "b": 7},
    "style_consistency": {"a": 9, "b": 6}
  },
  "rubric_citations": [
    {"rule_id": "rubric.silhouette_readable", "verdict": "a_passes_b_fails"}
  ],
  "reviewer": "human:mike",
  "reviewed_at": "2026-04-12T10:00:00Z"
}
```

---

## Output Formats

### Universal format (superset — converts to all downstream)

```jsonl
{"id": "style_001", "task": "critique", "images": ["assets/approved/keth_soldier_front_01.png"], "messages": [{"role": "system", "content": "You are a visual style judge for 2D game sprites."}, {"role": "user", "content": [{"type": "image"}, {"type": "text", "text": "Evaluate this sprite against the render doctrine."}]}, {"role": "assistant", "content": [{"type": "text", "text": "APPROVED. Silhouette reads as Communion before details. Organic crest and hooked forearms create alien-first impression. Palette stays within amber/bone/cyan range. Must-have traits satisfied: grown-not-forged armor, alien silhouette first."}]}], "metadata": {"source_repo": "keth-style-corpus", "asset_id": "keth_soldier_front_01", "status": "approved", "extractor": "asset_record"}}
```

### Task-specific outputs

**1. Classification (KTO format — no pairs needed)**
```jsonl
{"image": "assets/approved/keth_soldier_front_01.png", "prompt": "Is this sprite on-style for the Keth Communion faction?", "completion": "Yes. The grown-armor silhouette, organic crest, and amber/bone palette all match the Communion visual constitution.", "label": true, "metadata": {"status": "approved", "faction": "keth_communion"}}
{"image": "assets/rejected/keth_soldier_front_03.png", "prompt": "Is this sprite on-style for the Keth Communion faction?", "completion": "No. The armor reads as forged metal, not grown chitin. Silhouette is too symmetrical and humanoid — fails the alien-first rule.", "label": false, "metadata": {"status": "rejected", "faction": "keth_communion"}}
```

**2. Pairwise preference (DPO format)**
```jsonl
{"images": ["assets/approved/keth_soldier_front_01.png", "assets/rejected/keth_soldier_front_03.png"], "prompt": [{"role": "user", "content": [{"type": "image"}, {"type": "image"}, {"type": "text", "text": "Which sprite better matches the Keth Communion style? Explain."}]}], "chosen": [{"role": "assistant", "content": [{"type": "text", "text": "Image 1. The organic crest and hooked forearms read as alien-first. Palette stays in the amber/bone range. Image 2 uses forged-metal shapes that read as generic sci-fi armor."}]}], "rejected": [{"role": "assistant", "content": [{"type": "text", "text": "Image 2 has more detail."}]}], "metadata": {"comparison_id": "cmp_001", "winner": "a", "source": "human"}}
```

**3. Canon-grounded critique**
```jsonl
{"id": "crit_001", "images": ["assets/borderline/keth_scout_side_02.png"], "messages": [{"role": "system", "content": "You judge sprites against the Keth Communion visual constitution."}, {"role": "user", "content": [{"type": "image"}, {"type": "text", "text": "What is off-style about this sprite? Cite specific constitution rules."}]}, {"role": "assistant", "content": [{"type": "text", "text": "BORDERLINE. Two issues:\n1. [constitution.shape_language.1] Silhouette is too symmetrical — Communion requires organic asymmetry.\n2. [rubric.palette_adherence] Cyan accent is oversaturated, pulling away from the subtle-glow doctrine.\nCorrection: Break shoulder symmetry with an organic growth on one side. Reduce cyan saturation by ~30%."}]}], "metadata": {"status": "borderline", "failure_modes": ["too_symmetrical", "oversaturated_accent"]}}
```

**4. Contrastive pairs (CLIP-style)**
```jsonl
{"positive_image": "assets/approved/keth_soldier_front_01.png", "negative_image": "assets/rejected/keth_soldier_front_03.png", "anchor_text": "Keth Communion soldier: grown-not-forged armor, organic crest, alien silhouette, amber/bone/cyan palette", "margin": 0.8}
```

**5. Pointwise scores (reward model)**
```jsonl
{"image": "assets/approved/keth_soldier_front_01.png", "scores": {"silhouette_clarity": 0.9, "palette_adherence": 0.85, "style_consistency": 0.92, "overall": 0.89}, "status": "approved"}
```

### Conversion targets

| Target Framework | Conversion from universal |
|-----------------|--------------------------|
| LLaVA | `images[0]` → `image`, messages → `conversations` with `from`/`value` |
| Qwen2-VL | Already compatible (messages format) |
| InternVL | Split to meta.json + annotation JSONL, image paths relative to root |
| LLaMA-Factory | Rename `messages` → `conversations`, keep `images` array |
| TRL SFT | Load images as PIL, keep messages |
| TRL DPO | Split preference tasks into `prompt`/`chosen`/`rejected`/`images` |
| MLX-VLM | Already compatible (messages + file paths) |

---

## Visual Extractors

### 1. Record-Bound Asset Extractor

Reads image + structured record JSON together.

**Input:** `records/keth_soldier_front_01.json` + `assets/approved/keth_soldier_front_01.png`
**Output:** Classification pairs, critique pairs, canon-explanation pairs
**Signal types:** `style_classification`, `style_critique`, `canon_explanation`

### 2. Comparison Extractor

Reads `comparisons/*.json` files.

**Input:** Comparison record with asset_a, asset_b, chosen, reasoning
**Output:** DPO preference pairs, contrastive pairs, pointwise score pairs
**Signal type:** `pairwise_preference`

This is the highest-value extractor.

### 3. Set Extractor

Groups related assets automatically:
- Same character, multiple views → teaches view coherence
- Same faction, multiple roles → teaches faction consistency
- Same role, multiple iterations → teaches quality progression

**Input:** Asset records grouped by character/faction/role
**Output:** Set-level coherence examples ("are these consistent?")
**Signal type:** `set_coherence`

### 4. Constitution Linker

Links individual records to canon sections and rubric clauses.

**Input:** Asset record + `docs/constitution.md` + `docs/review-rubric.md`
**Output:** Grounded critique examples with rule citations
**Signal type:** `canon_grounded_critique`

### 5. Synthetic Pair Generator

When repo has approved/rejected folders but no explicit comparisons:
- For each rejected asset, find nearest approved by character+view+version
- Emit synthetic preference pair with `source: "synthetic_status_pair"`

Minimum 200 pairs for useful DPO fine-tuning. Synthetic pairs should be flagged in metadata.

---

## Inspect for Visual Repos

```
$ repo-dataset inspect ./keth-style-corpus --visual

  Repository: keth-style-corpus (visual)
  Structure: structured (status folders + records, sparse comparisons)

  Assets:
    total found ............. 247
    with records ............ 180  (73%)
    with status ............. 210  (85%)
    in comparisons .......... 94   (38%)
    with canon links ........ 45   (18%)
    orphan (no metadata) .... 37   (15%)

  Status breakdown:
    approved ................ 142
    rejected ................ 48
    borderline .............. 20
    wip ..................... 37

  Comparisons:
    explicit (human) ........ 47
    synthetic (from status) . 89   (auto-generated)
    total pairs ............. 136

  Canon coverage:
    constitution rules ...... 12 rules found
    assets linked to rules .. 45  (18% of total)
    rubric criteria ......... 8 criteria found

  Extraction yield:
    classification pairs .... 210  (from status labels)
    preference pairs ........ 136  (47 human + 89 synthetic)
    critique pairs .......... 45   (from canon-linked assets)
    total training units .... 391

  Trainability: GOOD (391 pairs, 136 preference)
```

---

## Grading Metrics for Visual Datasets

| Metric | Healthy | Warning |
|--------|---------|---------|
| Image-record binding rate | > 70% | < 50% |
| Comparison extraction rate | > 100 pairs | < 50 pairs |
| Canon linkage coverage | > 20% | < 10% |
| Label completeness (status) | > 80% | < 60% |
| Provenance completeness | > 90% metadata sourced | < 70% |
| Proportion contrastive examples | > 30% of total | < 15% |
| Approved:rejected ratio | 2:1 to 5:1 | > 10:1 or < 1:1 |
| Unique characters/subjects | > 5 | < 3 |

---

## Implementation Sequence

### Phase 2A — Visual corpus contract
1. Define record schema, comparison schema, set schema in `src/types.ts`
2. Define multimodal output schemas (universal, DPO, KTO, contrastive, pointwise)
3. Add `--visual` flag to detect visual repos
4. Add visual repo scanner (detect structure tier)

### Phase 2B — Visual extractors
1. Record-bound asset extractor
2. Comparison extractor (highest priority)
3. Synthetic pair generator (from approved/rejected folders)
4. Constitution linker
5. Set extractor

### Phase 2C — Visual inspect truth
1. Visual inspect output (assets found, records linked, yield metrics)
2. Canon coverage report
3. Comparison density check

### Phase 2D — Proof
1. Run on one real style corpus (Fractured Road sprites via Sprite Foundry registry)
2. Prove: image+record extraction, ranking pairs, critique examples, grounded outputs
3. Grade must be B+ or higher

---

## What NOT to Do

- No OCR
- No generic CLIP tagging as truth source
- No automatic caption generation as primary signal
- No unstructured image folder ingestion without status/records
- No "AI decides the style tags" — the repo provides the truth, the extractor compiles it

---

## Product Sentence After This Phase

> repo-dataset compiles code and visual repos into provenance-backed training examples, including canon-bound multimodal ranking and critique data.
