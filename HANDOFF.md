# Session Handoff — 2026-04-17

Supersedes the 2026-04-12 handoff (v1.1.0 / 445 tests). Current spine is v1.2.0 post-dogfood-swarm, published to npm, pre-M5-Max adoption.

## Current state

- **Version:** 1.2.1
- **Tests:** 460 passing (`npm run verify`)
- **Runtime deps:** 0
- **Node:** 20+
- **Repo:** https://github.com/mcp-tool-shop-org/repo-dataset
- **npm:** https://www.npmjs.com/package/@mcptoolshop/repo-dataset
- **Landing:** https://mcp-tool-shop-org.github.io/repo-dataset/
- **Handbook:** https://mcp-tool-shop-org.github.io/repo-dataset/handbook/
- **Shipcheck A-D:** PASS (see `SHIP_GATE.md`)
- **Working tree:** clean, all code pushed

## What this tool does (current shape)

repo-dataset is the **dataset construction and verification layer** for local ML practice. It converts code repos and curated visual repos into trainer-ready JSONL, then checks quality, binding integrity, and contamination risk.

It is not a trainer. It is not another format converter. It is the step you run *before* you touch backpropagate (or axolotl, TRL, LLaMA-Factory, etc.).

### Code pipeline
- **7 output formats:** alpaca, sharegpt, openai, chatml, raw, completion, fim
- **5 extractors:** code, commits, docs, tests, config
- **MinHash LSH near-dedup** (64 hashes, 8 bands, threshold 0.8)
- **Contamination validation:** leaked secrets, PII patterns, HumanEval benchmark signatures
- **Quality scoring:** letter grades A-F with per-dimension breakdown
- **18-field provenance:** file, commit, extractor, chunk offsets, etc.
- **Reservoir sampling** for memory-bounded extraction at scale
- **merge command** for cross-repo dedup

### Visual pipeline
- **10 output formats** across 2 paradigms (content-array and inline-token)
- **Zero-dep image validation** — PNG/JPEG/WebP, dimension extraction, truncation detection
- **Triangle enforcement** — every unit binds image + canon + judgment or is dropped
- **Quality/resolution filtering**, borderline asset handling, image dedup
- **Base64 embedding** for self-contained JSONL (`--embed`)

### Backpropagate integration
- Format-aware command generation
- Steps estimation from dataset size
- PATH detection for `--pipe-to-backpropagate`
- Supported formats: alpaca, sharegpt, openai, chatml, completion

## History

1. **v1.0.0** (2026-04-10-ish) — MVP: code pipeline, 240 tests
2. **v1.0.x** — Quality proof, 409 tests (added visual test suite)
3. **v1.1.0** (2026-04-12) — Phase 3: visual pipeline + binding integrity, 445 tests
4. **v1.2.0** (2026-04-14) — Full 10-phase dogfood swarm
   - Health Pass A/B/C: 46 fixes (13 CRITICAL/HIGH security + proactive + humanization)
   - Feature Pass (3 waves): 24 features including ChatML, MinHash, contamination, config extractor, merge
   - Full Treatment: shipcheck, translations (7), landing page, handbook (5 pages)
   - 70 files changed, +10,761 lines
   - npm tarball 71% smaller (245 kB, 83 files)

## What's next

### Imminent (pre-M5-Max)
1. **Public-surface truth-alignment + marketing swarm** (2026-04-17 — this session)
   - Truth-align README, HANDOFF, SHIP_GATE, SCORECARD with v1.2.0 reality
   - Reshape public surfaces around the protected thesis:
     *"repo-dataset is the dataset construction layer for serious local ML practice."*
   - New GitHub description, topics, README hero, landing hero, handbook front page
   - Lead with contamination-aware / quality-aware / triangle-enforced — not "supports many formats"

### M5 Max arrival (~2026-04-24)
2. **Real adoption pass** — use repo-dataset on actual repos to produce training data for local fine-tuning runs on the M5 Max
3. **Receipts backfill** — populate landing page with real contamination-caught-leak moments, real letter-grade scorecards, real backpropagate training curves
4. **Canon binding enrichment** — populate `canon_assertions` in style-dataset-lab records so visual triangle completion > 0%

### Future enhancements (not scheduled)
- Parquet / WebDataset output for datasets > 50K examples
- Perceptual hash (pHash) visual dedup
- CLIP score floor filter for image-text coherence
- `repo-dataset generate` auto-detection (no modality subcommand)
- Audio and game-design modalities

## Key files

| File | Purpose |
|------|---------|
| `src/types.ts` | `OUTPUT_FORMATS` single source of truth, `ExtractorName`, all types |
| `src/formatters/registry.ts` | Format registry + `isValidFormat` / `getAllFormats` |
| `src/extractors/*.ts` | 5 code extractors (code, commits, docs, tests, config) |
| `src/validators/contamination.ts` | Secret / PII / benchmark leak detection |
| `src/dedup/minhash.ts` | MinHash LSH near-dedup |
| `src/visual/image.ts` | Zero-dep PNG/JPEG/WebP validation |
| `src/visual/runner.ts` | Visual pipeline with triangle enforcement |
| `src/cli.ts` | CLI surface |
| `site/src/site-config.ts` | Landing page config |
| `site/src/content/docs/handbook/*.md` | Handbook pages |

## Commands

```bash
# Build + verify
npm run verify

# Code pipeline
repo-dataset generate <path> --format chatml --validate
repo-dataset inspect <path> --json
repo-dataset validate <output.jsonl>
repo-dataset merge a.jsonl b.jsonl --output combined.jsonl

# Visual pipeline
repo-dataset visual generate <path> --format trl --embed
repo-dataset visual inspect <path>
repo-dataset visual validate <output.jsonl>

# End-to-end with backpropagate
repo-dataset generate ./my-repo --format chatml --pipe-to-backpropagate
```

## Protected thesis (do not soften)

> **repo-dataset is the dataset construction layer for serious local ML practice.**

Not a trainer. Not "JSONL exporter with many formats." Not a subset of style-dataset-lab (which owns visual canon/judgment; repo-dataset owns the extraction + verification + format layer that feeds local trainers).

The sharp edges are:
1. **Contamination-aware** — catches HumanEval leaks, PII, secrets *before* training, not after
2. **Quality-scored** — letter grades, not "it shipped"
3. **Triangle-enforced** for multimodal — image + canon + judgment or it's dropped
4. **Clean bridge** to the local fine-tuning stack (backpropagate, axolotl, TRL, LLaVA, LLaMA-Factory, Qwen2-VL)
