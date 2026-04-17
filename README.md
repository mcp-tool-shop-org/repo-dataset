<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="500" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

### Build training data from repos before you touch the trainer.

repo-dataset turns code, commits, docs, tests, and curated visual assets into trainer-ready datasets — then checks quality, binding integrity, and contamination risk so you do not fine-tune on junk.

repo-dataset is the dataset construction and verification layer for local ML workflows. Not a trainer. Not a format zoo.

## What it is / what it isn't

- **Not a trainer.** It stops at the JSONL. Pair with [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate), Axolotl, TRL, LLaMA-Factory, LLaVA, or Qwen2-VL.
- **Not another format converter.** Format breadth is table stakes; the layer above it — contamination checks, quality grading, binding integrity — is the product.
- **A dataset construction and verification layer** for local ML workflows. It runs before training, and it flags what would poison a fine-tune run.
- **Complement, not competitor to [style-dataset-lab](https://github.com/mcp-tool-shop-org/style-dataset-lab).** style-dataset-lab is the specialized canon + visual dataset system for authored style bibles; repo-dataset is the broader construction and verification layer that any repo — code or visual — can flow through.

## Who this is for

- Solo ML practitioners training small models on their own code and want to know whether their dataset is actually fit to train on.
- Teams curating private visual datasets for VLM fine-tuning who need asset + canon + judgment binding enforced instead of trusted.
- Researchers who need contamination audits (leaked secrets, PII, benchmark signatures) before publishing a dataset or a paper.

## Install

```bash
npm install -g @mcptoolshop/repo-dataset
```

## The contamination check

The reason this exists. After you generate a dataset, `validate` is what tells you whether it is safe to feed a trainer.

```bash
repo-dataset validate ./dataset-output/dataset.jsonl
```

The output is shaped like this (shape only — actual numbers depend on your corpus):

```
Dataset Quality Report
  Records:          <count>
  Duplicate rate:   <percent>   (MinHash LSH, 64 hashes / 8 bands / 0.8 threshold)
  Token budget:     <p50 / p95 / max>

Contamination
  Leaked secrets:   <count>     (API keys, tokens, private key headers)
  PII patterns:     <count>     (emails, phone numbers, SSN-shaped strings)
  Benchmark leaks:  <count>     (HumanEval signature matches)

Grade: <A | B | C | D | F>
```

The grade is the verdict. A record that trips a secret, PII, or benchmark signature is flagged per-record so you can drop it, redact it, or regenerate the slice that produced it — before the trainer ever sees the file.

## Code pipeline

```bash
# Generate training data from a code repo
repo-dataset generate ./my-project --format alpaca

# Preview extraction (dry run)
repo-dataset inspect ./my-project

# Control signal balance across extractors
repo-dataset generate ./my-project --format completion --auto-balance
```

### Output formats

| Format | Use case |
|--------|----------|
| `alpaca` | Supervised fine-tuning (instruction/input/output) |
| `sharegpt` | Multi-turn conversation fine-tuning |
| `openai` | OpenAI messages format |
| `chatml` | ChatML role tokens (Mistral, Hermes, OpenHermes) |
| `raw` | Continued pre-training / RAG ingestion |
| `completion` | Raw code as text (language modeling) |
| `fim` | Fill-in-the-middle (StarCoder tokens) |

### Extractors

| Extractor | Source | Training signal |
|-----------|--------|-----------------|
| `code` | Source files | Function/class extraction with import context |
| `commits` | Git history | Change explanation pairs |
| `docs` | Markdown files | Section-based concept explanations |
| `tests` | Test files | Code-to-test generation pairs |
| `config` | Structured files | Dockerfile, tsconfig, Cargo.toml, CI workflows, etc. |

## Visual pipeline

The visual pipeline is not a thin wrapper over the code pipeline. It enforces the **training triangle** — image + canon + judgment — because that binding is what separates a usable VLM dataset from a pile of labeled pictures.

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

### Binding integrity (the triangle)

Every visual training unit is checked for three things:

1. **Image** — valid image file (PNG/JPEG/WebP, dimensions extracted, truncation detected).
2. **Canon** — canonical explanation grounded in style rules.
3. **Judgment** — approved/rejected status with per-dimension scores.

Units missing any leg are dropped by default. `--allow-incomplete` keeps partials when you know why you want them.

### Output formats

**Framework-native (recommended):**

| Format | Framework | DPO support |
|--------|-----------|-------------|
| `trl` | HuggingFace TRL, Unsloth | Yes |
| `axolotl` | Axolotl | Yes |
| `llava` | LLaVA, LLaVA-NeXT | SFT only |
| `llama_factory` | LLaMA-Factory | Yes |
| `qwen2vl` | Qwen2-VL, MS-Swift | Yes |

**Generic:**

| Format | Use case |
|--------|----------|
| `visual_universal` | Inspection, debugging, conversion |
| `visual_dpo` | DPO preference pairs |
| `visual_kto` | KTO binary labels |
| `visual_contrastive` | CLIP-style positive/negative pairs |
| `visual_pointwise` | Per-asset quality scores |

### Flags

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

## Backpropagate integration

repo-dataset outputs flow into [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate) for local fine-tuning without a format conversion step.

| Goal | Format | Why |
|------|--------|-----|
| Code fine-tuning | `chatml` or `alpaca` | Structured instruction pairs map directly to code tasks |
| Chat fine-tuning | `sharegpt` or `openai` | Multi-turn conversation structure preserved |
| Raw completion | `completion` | Unstructured text for continued pre-training |

Backpropagate accepts: `alpaca`, `sharegpt`, `openai`, `chatml`, `completion`.

```bash
# Generate, validate, then fine-tune
repo-dataset generate ./my-project --format chatml --validate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

Visual pipeline outputs (TRL, Axolotl, LLaVA, etc.) target vision-language model fine-tuning. Backpropagate does not yet support VLM training — use the framework-native formats with their respective trainers.

## Security model

repo-dataset reads source files and git history from repos you point it at, and writes JSONL to a directory you specify. It does **not** make network requests, collect telemetry, or access files outside the target repo and output directory. Path traversal and symlink attacks are guarded against. See [SECURITY.md](SECURITY.md) for reporting vulnerabilities. Shipcheck hard gates A–D all pass (see [SHIP_GATE.md](SHIP_GATE.md) and [SCORECARD.md](SCORECARD.md)).

## Receipts

Real datasets from real repos, coming with M5 Max runs (~2026-04-24). This section will fill with contamination catches, quality grades, and end-to-end fine-tune curves from dogfood runs against our own code and visual corpora.

Until then, the proof is in the test suite and the validator output shape above — not in marketing claims.

## Stats

- **Version:** 1.2.0
- **Tests:** 460 passing across 91 suites
- **Runtime deps:** 0
- **Node:** 20+
- **Package:** 83 files / 245 kB

## License

MIT

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
