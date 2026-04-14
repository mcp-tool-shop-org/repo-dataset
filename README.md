<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="400" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

Convert any git repository or visual style repo into LLM training datasets.

**Code pipeline:** Extracts training signals from code, commits, documentation, and tests. Outputs JSONL in 6 formats ready for fine-tuning or pre-training.

**Visual pipeline:** Extracts multimodal training data from curated visual repos. Validates images, enforces asset+canon+judgment binding, outputs in 10 framework-native formats for vision-language model fine-tuning.

## Security Model

repo-dataset reads source files and git history from repos you point it at. It writes JSONL output to a directory you specify. It does **not** make network requests, collect telemetry, or access files outside the target repo and output directory. Path traversal and symlink attacks are guarded against. See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

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

repo-dataset outputs are compatible with [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate) for local fine-tuning.

### Recommended Formats

| Goal | Format | Why |
|------|--------|-----|
| Code fine-tuning | `chatml` or `alpaca` | Structured instruction pairs map directly to code tasks |
| Chat fine-tuning | `sharegpt` or `openai` | Multi-turn conversation structure preserved |
| Raw completion | `completion` | Unstructured text for continued pre-training |

Backpropagate accepts: `alpaca`, `sharegpt`, `openai`, `chatml`, and `completion`.

### End-to-End Workflow

```bash
# Generate training data from your repo
repo-dataset generate ./my-project --format chatml --validate

# Fine-tune with backpropagate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

### Visual Datasets

Visual pipeline outputs (TRL, Axolotl, LLaVA, etc.) target vision-language model fine-tuning. Backpropagate does not yet support VLM training -- use the framework-native formats directly with their respective trainers.

## Stats

- **Version:** 1.1.0
- **Tests:** 445
- **Runtime deps:** 0
- **Node:** 20+

## License

MIT

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
