# Test Specification — Visual Learning Spine

## Overview

Test spec for the visual pipeline in `@mcptoolshop/repo-dataset`. The visual pipeline compiles style repos into multimodal training data for style judgment (classification, preference ranking, canon-grounded critique).

**Modules to test:**
- `src/visual/scanner.ts` — visual repo scanning, structure detection
- `src/visual/extractors.ts` — asset record, comparison, synthetic pair, constitution linker extractors
- `src/visual/formatters.ts` — universal, DPO, KTO, contrastive, pointwise output formatters
- `src/visual/runner.ts` — end-to-end visual pipeline
- CLI integration (`visual generate`, `visual inspect`)

**Fixture:** `src/tests/fixtures/visual-corpus/` with:
- 3 approved PNGs, 2 rejected PNGs, 1 borderline PNG
- 2 record JSONs (keth_soldier_front_01, keth_soldier_front_02)
- 1 comparison JSON (cmp_001)
- 2 doc files (constitution.md, review-rubric.md)

---

## Helpers

### Fixture path constant

```typescript
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const VISUAL_FIXTURE = resolve(__dirname, "fixtures/visual-corpus");
```

### Making a VisualPipelineConfig

```typescript
import type { VisualPipelineConfig } from "../types.js";

function makeVisualConfig(repoPath: string, overrides?: Partial<VisualPipelineConfig>): VisualPipelineConfig {
  return {
    repoPath,
    repoName: "test-visual-corpus",
    outputDir: join(repoPath, "output"),
    format: "visual_universal",
    extractors: ["asset_record", "comparison", "constitution"],
    generateSyntheticPairs: true,
    json: false,
    ...overrides,
  };
}
```

### Making a VisualTrainingUnit (for formatter tests)

```typescript
import type { VisualTrainingUnit } from "../visual/extractors.js";

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
      source_repo: "test",
      extractor: "asset_record",
      asset_id: "test_001",
      status: approved ? "approved" : "rejected",
      signal_type: "style_classification",
      quality_score: 0.7,
      extracted_at: new Date().toISOString(),
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
    rejected: "Image 2 is better.",
    metadata: {
      source_repo: "test",
      extractor: "comparison",
      comparison_id: "cmp_test",
      signal_type: "pairwise_preference",
      quality_score: 0.8,
      extracted_at: new Date().toISOString(),
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
      source_repo: "test",
      extractor: "comparison",
      comparison_id: "cmp_test",
      signal_type: "pairwise_preference",
      quality_score: 0.6,
      extracted_at: new Date().toISOString(),
    },
  };
}
```

---

## Module Tests

### `src/tests/visual/scanner.test.ts` — NEW

**Module:** `src/visual/scanner.ts`  
**Export:** `scanVisualRepo(repoPath) → Promise<VisualRepoInfo>`

| Test | Assert |
|------|--------|
| Finds all image assets | `repoInfo.assets.length === 6` |
| Detects PNG files in subdirs | All 6 assets have `.png` extension in path |
| Infers status from folder name | approved → "approved", rejected → "rejected", borderline → "borderline" |
| Sets status_source to "folder" | For folder-inferred assets |
| Infers view from filename | "front" → `view: "front"`, "side" → `view: "side"`, "back" → `view: "back"` |
| Loads record JSONs | `assets` with matching records have `record_path` set |
| Merges record data into asset | keth_soldier_front_01 has `faction: "keth_communion"`, `tags` populated |
| Record overrides folder status | Record says "rejected" even if in approved/ → status is "rejected" |
| Loads comparisons | `repoInfo.comparisons.length === 1` |
| Comparison has correct chosen | `comparisons[0].chosen === "a"` |
| Comparison has reasoning | `comparisons[0].reasoning` is non-null string |
| Finds canon docs | `repoInfo.canonDocs.length >= 1` (constitution.md) |
| Finds rubric docs | `repoInfo.rubricDocs.length >= 1` (review-rubric.md) |
| Detects structure tier "perfect" | Has records + comparisons + canon docs → "perfect" |
| Structure "partial" when only folders | Repo with only status folders, no records → "partial" |
| Structure "messy" when flat | Repo with images but no status folders → "messy" |
| Computes yield correctly | `yield.totalAssets === 6`, `yield.assetsWithRecords === 2` |
| Record coverage is correct | `yield.recordCoverage === 2/6 ≈ 0.33` |
| Skips non-image files | .json, .md files in assets/ are not counted as assets |
| Skips .git directory | Hidden dirs ignored |
| Skips node_modules | Excluded from scan |
| Asset id is filename without extension | `keth_soldier_front_01.png` → id: `keth_soldier_front_01` |
| metadata_confidence higher for record-backed | Record-backed assets ≥ 0.8, folder-only ≤ 0.6 |

---

### `src/tests/visual/extractors.test.ts` — NEW

**Module:** `src/visual/extractors.ts`  
**Exports:** `extractAssetRecords`, `extractComparisons`, `generateSyntheticPairs`, `extractConstitutionLinked`

**Setup:** Scan the fixture corpus first, then pass to extractors.

```typescript
import { scanVisualRepo } from "../../visual/scanner.js";
const repoInfo = await scanVisualRepo(VISUAL_FIXTURE);
const systemPrompt = "You are a visual style judge.";
```

#### extractAssetRecords

| Test | Assert |
|------|--------|
| Yields units for approved/rejected assets | Count > 0 |
| Skips "unknown" and "wip" status | No units with metadata.status === "unknown" |
| Classification units have task "classify" | `.task === "classify"` |
| Approved assets get `label: true` | |
| Rejected assets get `label: false` | |
| Critique units have task "critique" | `.task === "critique"` for assets with rich metadata |
| Only produces critique when rich metadata exists | Assets without tags/must_have don't get critique |
| Canon explanation unit exists for assets with canon_explanation | keth_soldier_front_01 yields a canon unit |
| Canon explanation matches record | `.messages[2].content` contains the canon_explanation text |
| All units have images array with 1 entry | `.images.length === 1` |
| Images array contains asset_path | `.images[0]` matches the asset's path |
| Metadata has signal_type | "style_classification" or "style_critique" or "canon_explanation" |
| quality_score between 0 and 1 | All units |
| quality_score higher for record-backed assets | Compare record-backed vs folder-only |
| metadata.asset_id set | Non-null for all units |
| metadata.extracted_at is ISO string | Valid ISO 8601 |

#### extractComparisons

| Test | Assert |
|------|--------|
| Yields preference units from comparisons | At least 1 preference unit from fixture |
| Skips ties | If a comparison has chosen:"tie", no preference unit |
| Preference unit has 2 images | `.images.length === 2` |
| Preference unit has chosen/rejected | Both non-null strings |
| Chosen includes reasoning when available | Contains the reasoning text from comparison |
| Rejected is a weak/uninformative response | Short generic "Image X is more on-style." |
| preferred_index matches chosen side | `chosen === "a"` → `preferred_index === 0` |
| Also yields contrastive unit | At least 1 contrastive unit per comparison |
| Contrastive unit has margin | `.margin === 0.8` |
| metadata.comparison_id set | Matches the comparison.id |
| metadata.signal_type is "pairwise_preference" | |
| quality_score higher for comparisons with reasoning | vs ones without |
| quality_score higher for comparisons with criteria_scores | |
| quality_score higher for human vs synthetic source | |

#### generateSyntheticPairs

| Test | Assert |
|------|--------|
| Generates pairs from approved/rejected | At least 1 synthetic pair from fixture |
| Synthetic pair has source "synthetic_status_pair" | `.source === "synthetic_status_pair"` |
| Winner is always the approved asset | `chosen === "a"` where a is approved |
| Does not duplicate existing comparisons | If A-vs-B already in comparisons, not re-generated |
| Prefers same-faction matching | If rejected has faction, matches with same-faction approved |
| Returns comparison record + training units | Both present in generator output |
| Training units have images from both assets | 2 image paths |

#### extractConstitutionLinked

| Test | Assert |
|------|--------|
| Yields grounded critique units | At least 1 from fixture (keth_soldier_front_01 has canon_assertions) |
| Only for assets with canon_assertions | Assets without assertions yield nothing |
| System prompt includes constitution text | First message content contains canon doc text |
| System prompt includes rubric text | Contains rubric doc text |
| Assistant response includes rule citations | Contains rule_id strings |
| Task is "critique" | `.task === "critique"` |
| signal_type is "canon_grounded_critique" | |
| quality_score is high (0.85) | Grounded critiques are premium |
| Returns nothing when no canon docs | Empty canonDocs → no units |

---

### `src/tests/visual/formatters.test.ts` — NEW

**Module:** `src/visual/formatters.ts`  
**Exports:** `getVisualFormatter`, `isValidVisualFormat`, `getAllVisualFormats`

#### UniversalFormatter

| Test | Assert |
|------|--------|
| Formats classify unit | Parse line → has id, task, images, messages, metadata |
| Formats preference unit | Has preferred_index field |
| Formats contrastive unit | Has margin field (if present on unit) |
| Includes label for classify | `parsed.label === true` or `false` |
| Does NOT include undefined fields | No `chosen: undefined` in output |

#### DPOFormatter

| Test | Assert |
|------|--------|
| Returns null for non-preference units | `formatUnit(classifyUnit) === null` |
| Formats preference unit correctly | Has images, prompt, chosen, rejected |
| chosen is array with assistant message | `parsed.chosen[0].role === "assistant"` |
| rejected is array with assistant message | `parsed.rejected[0].role === "assistant"` |
| prompt includes system + user messages | `parsed.prompt.length >= 1` |
| Images array preserved | `parsed.images.length === 2` |

#### KTOFormatter

| Test | Assert |
|------|--------|
| Returns null for non-classify units | `formatUnit(preferenceUnit) === null` |
| Formats classify unit | Has image, prompt, completion, label |
| image is single path (not array) | `typeof parsed.image === "string"` |
| label is boolean | `typeof parsed.label === "boolean"` |
| Approved → label true | |
| Rejected → label false | |
| completion contains the assistant response | Non-empty string |

#### ContrastiveFormatter

| Test | Assert |
|------|--------|
| Returns null for non-contrastive units | `formatUnit(classifyUnit) === null` |
| Formats contrastive unit | Has positive_image, negative_image, margin |
| positive_image is first image | `parsed.positive_image === unit.images[0]` |
| negative_image is second image | `parsed.negative_image === unit.images[1]` |
| margin is number | `typeof parsed.margin === "number"` |
| Returns null if < 2 images | Unit with 1 image → null |

#### PointwiseFormatter

| Test | Assert |
|------|--------|
| Returns null if no scores | Unit without scores → null |
| Formats pointwise unit | Has image, scores, status |
| scores is object with number values | All values are numbers |

#### Registry functions

| Test | Assert |
|------|--------|
| `isValidVisualFormat("visual_universal")` → true | |
| `isValidVisualFormat("visual_dpo")` → true | |
| `isValidVisualFormat("invalid")` → false | |
| `getAllVisualFormats()` returns 5 items | |
| `getVisualFormatter("visual_dpo")` returns DPO | `.name === "visual_dpo"` |

---

### `src/tests/visual/runner.test.ts` — NEW

**Module:** `src/visual/runner.ts`  
**Exports:** `runVisualPipeline`, `inspectVisualPipeline`

| Test | Assert |
|------|--------|
| runVisualPipeline creates output JSONL | File exists at result.outputPath |
| runVisualPipeline creates manifest | File exists at result.manifestPath |
| Output JSONL: every line is valid JSON | Parse each line |
| Manifest has schema_version "2" | |
| Manifest has mode "visual" | |
| Manifest stats.total_units matches result | |
| result.structureTier is "perfect" for fixture | |
| result.totalAssets is 6 | |
| result.classificationPairs > 0 | |
| result.preferencePairs > 0 | (from comparisons + synthetic) |
| result.critiquePairs > 0 | (from records with rich data) |
| result.totalTrainingUnits > 0 | Sum of all |
| result.yield.recordCoverage ≈ 0.33 | 2 records / 6 assets |
| inspectVisualPipeline does NOT write files | No file at outputDir |
| inspectVisualPipeline returns same stats as run | totalTrainingUnits matches |
| With generateSyntheticPairs=false | yield.syntheticComparisons === 0 |
| With generateSyntheticPairs=true | yield.syntheticComparisons > 0 |
| DPO format: only preference units written | All lines have chosen/rejected |
| KTO format: only classify units written | All lines have label field |
| Warnings include "preference pairs" when few | warnings array contains relevant message |
| trainability "insufficient" when < 50 units | Small corpus |
| Creates output directory if missing | Non-existent dir → created |

---

### `src/tests/cli.test.ts` — expand (visual commands)

| Test | Assert |
|------|--------|
| `visual generate` with no path exits 1 | exitCode 1 |
| `visual generate` on fixture produces output | exitCode 0 |
| `visual generate --json` outputs valid JSON | JSON.parse succeeds, has totalTrainingUnits |
| `visual generate --format visual_dpo` works | exitCode 0 |
| `visual inspect` on fixture works | exitCode 0, shows asset count |
| `visual inspect --json` outputs valid JSON | Has structureTier, yield, trainability |
| `visual bogus` exits 1 | Unknown visual subcommand |
| `info` shows visual formats | stdout includes "visual_universal", "visual_dpo" |
| `info` shows visual extractors | stdout includes "asset_record", "comparison" |

---

## Edge Case Tests

### Scanner edge cases

| Test | Assert |
|------|--------|
| Empty repo (no assets/) | `assets.length === 0`, structureTier "messy" |
| Assets but no records/ dir | Records empty, structure "partial" if status folders exist |
| Record JSON references nonexistent image | Asset created from record but asset_path may not resolve |
| Duplicate asset IDs (same name in different folders) | Both scanned, different paths |
| Very deep nesting (assets/faction/chapter/approved/) | Still detects status from path |
| Non-JSON files in records/ | Skipped without error |
| Malformed JSON in records/ | Skipped without error |
| Malformed comparison JSON | Skipped without error |

### Extractor edge cases

| Test | Assert |
|------|--------|
| Asset with empty tags object | Still yields classification unit |
| Asset with no canon_explanation | No canon_explanation unit emitted |
| Comparison with empty reasoning | Preference unit still works, chosen is generic |
| Comparison with empty criteria_scores | Lower quality_score, still emits |
| All assets are "wip" | No classification/critique units |
| No canon docs at all | Constitution extractor yields nothing, no error |
| Constitution text is very long | Truncated to 2000 chars in system prompt |

### Synthetic pair edge cases

| Test | Assert |
|------|--------|
| No rejected assets | No synthetic pairs generated |
| No approved assets | No synthetic pairs (nothing to match against) |
| All rejected have matching existing comparisons | No new synthetic pairs (dedup works) |
| Multiple rejected with same faction | Each gets a different approved match if possible |

---

## Constraints

1. **Zero runtime dependencies** — only `node:*` and project source
2. **No network calls** — all tests use local fixture
3. **Windows-compatible** — `path.join`, `os.tmpdir()` for temp dirs
4. **< 30s for visual tests** — fixture is tiny (6 x 1px PNGs)
5. **Self-contained** — each test file manages its own setup/teardown
6. **Don't test image content** — we test metadata, structure, and pipeline flow; the PNGs are placeholders

---

## Running

```bash
npm run build
# All tests
node --test dist/tests/**/*.test.js

# Visual tests only
node --test dist/tests/visual/*.test.js
```
