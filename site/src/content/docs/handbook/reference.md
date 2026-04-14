---
title: CLI Reference
description: Complete reference for all repo-dataset commands and flags.
sidebar:
  order: 2
---

## Commands

### `generate`

Extract training data from a code repository.

```bash
repo-dataset generate <repo-path> [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--format` | `jsonl` | Output format: alpaca, sharegpt, openai, chatml, raw, completion, fim |
| `--output` | `<repo>-dataset/` | Output directory (use `-` for stdout) |
| `--extractors` | `code,commits,docs,tests` | Comma-separated list (also: `config`) |
| `--auto-balance` | off | Balance pair counts across extractors |
| `--max-tokens` | 2048 | Maximum tokens per pair |
| `--min-tokens` | 10 | Minimum tokens per pair |
| `--validate` | off | Run validation after generation |
| `--include-metadata` | off | Preserve provenance metadata in output |
| `--global-max-pairs` | 100000 | Memory-bound cap via reservoir sampling |
| `--pipe-to-backpropagate` | off | Print backpropagate training command |
| `--stdout` | off | Write JSONL to stdout |
| `--json` | off | Machine-readable JSON summary |

### `inspect`

Preview extraction without writing output. Same flags as `generate`.

### `validate`

Quality report on a generated dataset.

```bash
repo-dataset validate <dataset.jsonl>
```

Checks structural integrity, distribution, content quality, and contamination. Returns a letter grade (A-F).

### `merge`

Combine and deduplicate multiple dataset files.

```bash
repo-dataset merge file1.jsonl file2.jsonl --output combined.jsonl
```

### `visual generate`

Extract multimodal training data from a visual style repo.

```bash
repo-dataset visual generate <repo-path> [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--format` | `visual_universal` | 10 visual formats available |
| `--extractors` | `asset_record,comparison,constitution` | Also: `set_coherence` |
| `--embed` | off | Base64-encode images into JSONL |
| `--min-quality` | 0.0 | Drop units below quality threshold |
| `--min-resolution` | 32 | Minimum image edge size in pixels |
| `--max-resolution` | 4096 | Maximum image edge size in pixels |

### `visual inspect` / `visual validate`

Same as code pipeline equivalents, for visual datasets.
