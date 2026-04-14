---
title: Architecture
description: How repo-dataset processes repositories into training data.
---

## Code Pipeline

```
Repository → Scanner → Extractors → Quality Filter → Dedup → Balance → Formatter → JSONL
```

1. **Scanner** walks the file tree, classifies files by language, skips binary/oversized/vendor files
2. **Extractors** (5 types) yield `ExtractedPair` objects with instruction/input/output + metadata
3. **Quality filter** drops low-signal pairs (empty content, trivial repetition, auto-generated)
4. **Deduplicator** runs exact SHA-256 then MinHash LSH near-dedup (Jaccard threshold 0.8)
5. **Balance** optionally resamples to equalize extractor representation
6. **Formatter** serializes to the chosen output format (7 code formats)

### Extractors

| Extractor | Signal | What It Extracts |
|-----------|--------|------------------|
| `code` | Functions, classes, methods | Instruction pairs from docstrings + structural summaries |
| `commits` | Git history | Commit message → diff pairs |
| `docs` | Markdown, README | Documentation explanation pairs |
| `tests` | Test files | Test case → implementation pairs |
| `config` | Build/CI/lint configs | Configuration explanation pairs |

## Visual Pipeline

```
Visual Repo → Scanner → Image Validation → Extractors → Dedup → Quality Filter → Balance → Formatter → JSONL
```

1. **Scanner** finds images (PNG/JPEG/WebP) + JSON records + comparison files + constitution docs
2. **Image validation** parses headers, checks dimensions, detects truncation
3. **Extractors** produce `VisualTrainingUnit` objects with messages + image refs
4. **Dedup** removes exact-duplicate units by content hash
5. **Quality filter** drops units below `--min-quality` and outside resolution bounds
6. **Balance** caps per-task-type counts to prevent classification dominance
7. **Formatter** serializes to one of 10 visual formats

### Binding Integrity

Every visual unit is checked for the training triangle:
- **Image** — valid file with parsed dimensions
- **Canon** — canonical explanation from constitution/style docs
- **Judgment** — approved/rejected/borderline status with scores

Units missing any leg are dropped by default (`--allow-incomplete` overrides).

## Validation Pipeline

```
Dataset → Structural Check → Distribution Analysis → Content Quality → Contamination Scan → Score → Grade
```

The contamination scan checks for:
- **Secrets**: AWS keys, GitHub tokens, API keys, RSA private keys
- **PII**: Email addresses, IP addresses
- **Benchmark leakage**: HumanEval function signatures

Contamination findings apply score penalties: -10/secret, -5/PII, -15/benchmark match.
