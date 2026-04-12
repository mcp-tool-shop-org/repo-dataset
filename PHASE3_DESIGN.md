# Phase 3: Image Embedding + Binding Integrity

## Why

The visual pipeline today produces JSONL with **file path references** — the model never sees the pixels. That makes the output a metadata index, not a training dataset. For the model to learn your art director's eye, every training example must be a complete triangle:

```
image pixels  +  canonical explanation  +  quality judgment
```

A "Visual - Gritty Space" corpus ships as one artifact. A trainer loads it and the model sees the sprite, reads the design rationale, and learns what approved vs rejected means in your style language.

Phase 3 makes that real.

---

## Research Summary

Five research swarms ran (2026-04-12). Key findings:

| Topic | Finding |
|-------|---------|
| **Embedding format** | Most frameworks prefer paths + image folder. Only Qwen2-VL natively supports data URIs. Offer both modes. |
| **Image validation** | Zero deps needed. PNG/JPEG/WebP format detection, dimension extraction, and truncation check in ~60 lines of pure Buffer code. |
| **Training formats** | Two paradigms: content-array (`[{"type":"image"}, {"type":"text"}]` — TRL/Axolotl/Unsloth) and inline-token (`<image>` in text + separate images field — LLaVA/LLaMA-Factory/Qwen2-VL). DPO has two schemas. |
| **Binding integrity** | CLIP score as floor filter, n-gram template detection for critique specificity, transitivity audits for preference pairs. |
| **Corpus health** | Target 50-60/40-50 approved/rejected balance, track judgment diversity, canon coverage, embedding spread. Minimum viable: 500 binary, 1-2k critique, 5k+ preference. |
| **Architecture** | Registry pattern with common envelope + modality payload. Current CLI subcommands scale correctly. |

---

## Design

### 1. Image Processing Module (`src/visual/image.ts`)

Zero runtime dependencies. Pure Buffer operations.

```typescript
export interface ImageInfo {
  format: 'png' | 'jpeg' | 'webp';
  width: number;
  height: number;
  bytes: number;
  valid: boolean;          // magic bytes + truncation check
  base64?: string;         // populated when --embed is used
  dataUri?: string;        // populated when format needs it
}

export function detectFormat(buf: Buffer): 'png' | 'jpeg' | 'webp' | null;
export function parseImageInfo(buf: Buffer): ImageInfo | null;
export function validateImage(buf: Buffer): { valid: boolean; reason?: string };
```

**Validation checks:**
- Magic bytes match declared extension
- Dimensions > 0 and ≤ 16384
- PNG: IHDR chunk present, IEND chunk present (not truncated)
- JPEG: SOI marker present, SOF0/SOF2 found (dimensions extractable), EOI marker present
- WebP: RIFF header valid, VP8/VP8L chunk parseable
- File size > 0 and < 50MB (sanity cap)

**Embedding:**
- `Buffer.toString('base64')` — that's it
- Data URI: `data:image/${format};base64,${base64}`
- Embedding is opt-in via `--embed` flag

### 2. Updated Training Unit Type

```typescript
export interface VisualTrainingUnit {
  id: string;
  task: 'classify' | 'critique' | 'preference' | 'contrastive' | 'coherence';

  // Image data — CHANGED from string[] paths
  images: ImageReference[];

  messages: Message[];
  metadata: VisualUnitMetadata;

  // Binding integrity fields — NEW
  binding: BindingReport;

  // DPO/KTO/contrastive fields (unchanged)
  preferred_index?: number;
  chosen?: string;
  rejected?: string;
  label?: boolean;
  margin?: number;
  scores?: Record<string, number>;
}

export interface ImageReference {
  path: string;              // always present — filesystem path
  format: 'png' | 'jpeg' | 'webp';
  width: number;
  height: number;
  bytes: number;
  base64?: string;           // present when --embed
}

export interface BindingReport {
  has_image: boolean;        // image loads and validates
  has_canon: boolean;        // canon explanation is non-empty
  has_judgment: boolean;     // quality judgment present (status + scores or critique)
  triangle_complete: boolean; // all three present
  critique_specificity?: number;  // 0-1, how grounded the critique is (not boilerplate)
}
```

### 3. Output Formats — Two Paradigms

The research revealed two dominant format families. We support both.

#### Content-Array Paradigm (TRL / Axolotl / Unsloth)

Used by: TRL SFTTrainer, TRL DPOTrainer, Axolotl, Unsloth

```jsonc
// SFT example
{
  "messages": [
    {"role": "system", "content": [{"type": "text", "text": "You are a pixel art style judge..."}]},
    {"role": "user", "content": [
      {"type": "image"},
      {"type": "text", "text": "Evaluate this sprite against the Fractured Road constitution."}
    ]},
    {"role": "assistant", "content": [
      {"type": "text", "text": "Approved. Silhouette reads at 64px, palette matches..."}
    ]}
  ],
  "images": ["path/to/sprite.png"]  // or base64 strings when --embed
}

// DPO example
{
  "prompt": [{"role": "user", "content": [
    {"type": "image"}, {"type": "image"},
    {"type": "text", "text": "Which sprite better matches the Keth faction style?"}
  ]}],
  "chosen": [{"role": "assistant", "content": [
    {"type": "text", "text": "Image 1. The silhouette reads cleanly at 64px..."}
  ]}],
  "rejected": [{"role": "assistant", "content": [
    {"type": "text", "text": "Image 2. The palette drifts warm beyond faction spec..."}
  ]}],
  "images": ["approved.png", "rejected.png"]
}
```

#### Inline-Token Paradigm (LLaVA / LLaMA-Factory / Qwen2-VL)

Used by: LLaVA training scripts, LLaMA-Factory, Qwen2-VL/Swift

```jsonc
// LLaVA SFT
{
  "id": "style_001",
  "image": "approved/keth_soldier_front_01.png",
  "conversations": [
    {"from": "human", "value": "<image>\nEvaluate this sprite against the Fractured Road constitution."},
    {"from": "gpt", "value": "Approved. Silhouette reads at 64px, palette matches..."}
  ]
}

// LLaMA-Factory DPO
{
  "images": ["approved.png", "rejected.png"],
  "conversations": [
    {"from": "human", "value": "<image><image>\nWhich sprite better matches the Keth faction style?"}
  ],
  "chosen": {"from": "gpt", "value": "Image 1. The silhouette reads cleanly..."},
  "rejected": {"from": "gpt", "value": "Image 2. The palette drifts warm..."}
}
```

#### Format Matrix

| Format name | Paradigm | Framework target | DPO support |
|-------------|----------|-----------------|-------------|
| `trl` | content-array | TRL, Unsloth | yes |
| `axolotl` | content-array | Axolotl | yes |
| `llava` | inline-token | LLaVA, LLaVA-NeXT | no (SFT only) |
| `llama_factory` | inline-token | LLaMA-Factory | yes |
| `qwen2vl` | inline-token | Qwen2-VL, MS-Swift | yes |
| `universal` | content-array | Generic (inspection/debugging) | yes |
| `dpo` | content-array | TRL DPOTrainer | yes (DPO only) |
| `kto` | flat | TRL KTOTrainer | n/a (KTO only) |
| `contrastive` | flat | Custom contrastive training | n/a |
| `pointwise` | flat | Custom pointwise training | n/a |

**`--embed` flag** works with all formats. When enabled:
- Content-array formats: `images` array contains base64 strings instead of paths
- Inline-token formats: `image`/`images` field contains base64 strings
- Flat formats: `image`/`positive_image`/`negative_image` contain base64

### 4. Binding Integrity Validation

Every training unit is checked for triangle completeness before output.

#### Per-Unit Checks

| Check | What it validates | Failure action |
|-------|-------------------|----------------|
| `image_valid` | Image file exists, loads, passes format/dimension validation | Drop unit, warn |
| `canon_present` | Canon explanation field is non-empty and > 20 chars | Flag as weak binding |
| `judgment_present` | Status (approved/rejected) exists OR scores dict is non-empty | Flag as weak binding |
| `triangle_complete` | All three above pass | Required for output (unless `--allow-incomplete`) |
| `critique_specific` | N-gram overlap with other critiques < 80% (not boilerplate) | Warn, include |

#### Corpus-Level Checks (in `visual validate`)

| Metric | Target | Red flag |
|--------|--------|----------|
| Triangle completion rate | > 90% | < 70% |
| Class balance (approved/rejected) | 50-60% / 40-50% | > 80/20 |
| Judgment diversity | < 50% shared 3-grams | > 50% (degenerate critiques) |
| Canon coverage | > 80% of style rules exercised | < 50% |
| Image format validity | 100% | Any corrupt images |
| Dedup (pHash Hamming ≤ 10) | < 5% duplicates | > 15% |

### 5. CLI Changes

```bash
# Existing (unchanged)
repo-dataset visual generate <path> --format universal
repo-dataset visual inspect <path>

# New flags
repo-dataset visual generate <path> --format trl --embed     # base64 embedded
repo-dataset visual generate <path> --format llava            # LLaVA native
repo-dataset visual generate <path> --format qwen2vl --embed  # Qwen2-VL data URIs
repo-dataset visual generate <path> --allow-incomplete        # skip triangle check

# New command
repo-dataset visual validate <output.jsonl>   # corpus-level health report
```

### 6. Architecture Changes

```
src/
  visual/
    image.ts          # NEW — zero-dep image validation + embedding
    extractors.ts     # MODIFIED — populate ImageReference, compute BindingReport
    formatters.ts     # REWRITTEN — two paradigm families, 10 format targets
    scanner.ts        # MODIFIED — validate images during scan
    runner.ts         # MODIFIED — respect --embed flag, drop incomplete triangles
    validate.ts       # NEW — corpus-level health metrics
  types.ts            # MODIFIED — ImageReference, BindingReport types
  cli.ts              # MODIFIED — new flags, visual validate command
```

### 7. Image Folder Output

When not using `--embed`, the pipeline also copies referenced images into a structured output folder alongside the JSONL:

```
output/
  dataset.jsonl           # training data
  _manifest.json          # corpus metadata + health report
  images/                 # copied/symlinked images
    approved/
      keth_soldier_front_01.png
    rejected/
      keth_soldier_front_03.png
```

This makes the output self-contained even without base64 — just zip and ship.

### 8. Test Strategy

#### Unit Tests (zero I/O)
- `image.ts` — test parsers against known byte sequences (PNG IHDR, JPEG SOF, WebP RIFF)
- Formatter output shape — assert every format produces valid JSON matching its schema
- Binding report computation — test triangle completeness logic

#### Integration Tests (real files)
- Fixture corpus with real images (tiny but valid PNGs — valid headers, IEND present)
- Full pipeline run with `--embed` — verify base64 round-trips to valid image
- Full pipeline run per format — verify output matches framework's expected schema
- Corrupt image handling — truncated PNG, wrong extension, zero-byte file
- Triangle validation — incomplete units dropped when `--allow-incomplete` not set

#### Corpus Validation Tests
- Health metrics on synthetic corpus with known properties
- Class balance detection on skewed corpus
- Duplicate detection on corpus with known pHash-identical pairs

### 9. Implementation Order

1. `image.ts` — format detection, dimension parsing, validation, base64 encoding
2. Types update — `ImageReference`, `BindingReport`, updated `VisualTrainingUnit`
3. Scanner update — validate images during scan, populate `ImageReference`
4. Extractor update — compute `BindingReport` per unit
5. Formatter rewrite — 10 format targets across two paradigms
6. Runner update — `--embed` flag, triangle enforcement, image folder output
7. `visual validate` command — corpus-level health report
8. CLI wiring — new flags, help text
9. Tests — unit + integration + corpus validation
10. Bump to v1.1.0

---

## What This Does NOT Include (Future)

- **CLIP score computation** — requires Python/ONNX runtime. Deferred to a `repo-dataset evaluate` command or external tool.
- **Perceptual hashing / dedup** — can be added to `visual validate` later. Requires a hash implementation (pure JS pHash exists but is ~500 lines).
- **Auto-detection** — `repo-dataset generate` without modality subcommand. Deferred to Phase 4.
- **Audio / game design modalities** — same architecture, different extractors. Deferred.
- **Parquet / WebDataset output** — for datasets > 50K examples. JSONL + image folder covers the near-term.
