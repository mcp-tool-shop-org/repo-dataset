# @mcptoolshop/repo-dataset

Convert any git repository or visual style repo into LLM training datasets.

**Code pipeline:** Extracts training signals from code, commits, documentation, and tests. Outputs JSONL in 6 formats ready for fine-tuning or pre-training.

**Visual pipeline:** Extracts multimodal training data from curated visual repos. Validates images, enforces asset+canon+judgment binding, outputs in 10 framework-native formats for vision-language model fine-tuning.

## Install

```bash
npm install -g @mcptoolshop/repo-dataset
```

## Code Pipeline

```bash
# Generate training data from a code repo
repo-dataset generate ./my-project --format alpaca

# Preview extraction (dry run)
repo-dataset inspect ./my-project

# Quality report on generated data
repo-dataset validate ./dataset-output/dataset.jsonl

# Control signal balance
repo-dataset generate ./my-project --format completion --auto-balance
```

### Code Output Formats

| Format | Use Case |
|--------|----------|
| `alpaca` | Supervised fine-tuning (instruction/input/output) |
| `sharegpt` | Multi-turn conversation fine-tuning |
| `openai` | OpenAI messages format |
| `raw` | Continued pre-training / RAG ingestion |
| `completion` | Raw code as text (language modeling) |
| `fim` | Fill-in-the-middle (StarCoder tokens) |

### Code Extractors

| Extractor | Source | Training Signal |
|-----------|--------|-----------------|
| `code` | Source files | Function/class extraction with import context |
| `commits` | Git history | Change explanation pairs |
| `docs` | Markdown files | Section-based concept explanations |
| `tests` | Test files | Code-to-test generation pairs |

## Visual Pipeline

```bash
# Generate training data from a visual style repo
repo-dataset visual generate ./my-style-repo --format trl

# With base64-embedded images (self-contained JSONL)
repo-dataset visual generate ./my-style-repo --format trl --embed

# Preview visual extraction
repo-dataset visual inspect ./my-style-repo

# Corpus health report
repo-dataset visual validate ./exports/dataset.jsonl
```

### Visual Output Formats

**Framework-native (recommended):**

| Format | Framework | DPO Support |
|--------|-----------|-------------|
| `trl` | HuggingFace TRL, Unsloth | Yes |
| `axolotl` | Axolotl | Yes |
| `llava` | LLaVA, LLaVA-NeXT | SFT only |
| `llama_factory` | LLaMA-Factory | Yes |
| `qwen2vl` | Qwen2-VL, MS-Swift | Yes |

**Generic:**

| Format | Use Case |
|--------|----------|
| `visual_universal` | Inspection, debugging, conversion |
| `visual_dpo` | DPO preference pairs |
| `visual_kto` | KTO binary labels |
| `visual_contrastive` | CLIP-style positive/negative pairs |
| `visual_pointwise` | Per-asset quality scores |

### Visual Flags

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

### Binding Integrity

Every visual training unit is checked for the **training triangle**:

1. **Image** — valid image file (PNG/JPEG/WebP, dimensions extracted, truncation detected)
2. **Canon** — canonical explanation grounded in style rules
3. **Judgment** — approved/rejected status with per-dimension scores

Units without all three are dropped by default. Use `--allow-incomplete` to keep partial units.

## Backpropagate Integration

```bash
repo-dataset generate ./my-project --pipe-to-backpropagate
```

## Stats

- **Version:** 1.1.0
- **Tests:** 445
- **Runtime deps:** 0
- **Node:** 20+

## License

MIT
