# Changelog

## 1.2.1 (2026-04-17)

Docs and positioning release — no runtime behavior changes. Locks one spine across every public surface: **repo-dataset is the dataset construction and verification layer for local ML workflows. Not a trainer. Not a format zoo.**

### Changed

- README, landing page, and handbook rewritten around the construction-and-verification thesis. Contamination check surfaced as the flagship proof section, not a feature bullet.
- Landing page (`site/src/site-config.ts`) sections reordered so verification leads, features and usage follow. Hero CTA now points at the contamination check.
- Handbook index and getting-started reshaped around "Why this exists" and "When to reach for it" before install/usage.
- GitHub repo description and topics realigned to the thesis (10 topics: training-data, fine-tuning, dataset-generation, multimodal-datasets, data-contamination, benchmark-leakage, vision-language, jsonl, axolotl, llava).
- New repo-dataset logo pushed to `mcp-tool-shop-org/brand` (magnifying glass over dataset stack — verification motif). README logo width bumped 400 → 500.

### Fixed

- Corrected stale v1.1.0 / 445-test references in README Stats section.
- Landing page feature list said "8 Output Formats" — corrected to "7 Code Formats + 10 Visual Formats" and enumerated.
- Code format table in README was missing `chatml` (shipped in 1.2.0); now listed.
- Code extractor table was missing `config` (shipped in 1.2.0); now listed.

### Added

- `docs/marketing-research.md` — positioning research, competitor scan, and wave briefs driving the rewrite.
- `docs/research-inputs/competitors.md` — 5-tool positioning scan (Axolotl, LLaMA-Factory, Unsloth, HuggingFace datasets, LLaVA).
- `docs/research-inputs/intern-seams-2026-04-17.md` — ollama-intern seam notes filed during the dogfood pass.
- SHIP_GATE.md Section E checkmarks now reflect actual shipped state (logo, 7 translations, landing, GitHub metadata).
- SCORECARD.md filled with evidence-backed post-ship assessment (50/50).
- Translations refreshed across 7 languages (ja, zh, es, fr, hi, it, pt-BR) to track the new English spine.
- HANDOFF.md rewritten for the v1.2.1 post-marketing-swarm, pre-M5-Max state.

## 1.2.0 (2026-04-14)

### Added

- ChatML output format (`--format chatml`) for Mistral/Hermes/OpenHermes fine-tuning
- Contamination validation: secrets, PII, and benchmark leakage detection in `validate`
- MinHash near-duplicate detection with LSH acceleration (64 hashes, 8 bands, threshold 0.8)
- Config extractor for structured files (Dockerfile, tsconfig.json, Cargo.toml, CI workflows, etc.)
- `merge` command for cross-file dedup of multi-repo datasets
- `set_coherence` visual extractor for faction/character stylistic coherence
- Visual dataset balancing (`--max-per-task`) and quality filtering (`--min-quality`)
- Image resolution filtering (`--min-resolution`, `--max-resolution`)
- Borderline asset handling in visual extractors (decision boundary training signal)
- `--validate` flag on generate for single-step generate+validate workflow
- `--stdout` / `--output -` for piping JSONL to stdout
- `--include-metadata` flag to preserve provenance in instruction formats
- `--global-max-pairs` reservoir sampling for memory-bounded extraction
- Language-aware token estimation (30+ language multipliers)
- Structural summary for undocumented functions (replaces tautological fallback)
- Image dedup (SHA-256 exact) in visual pipeline

### Fixed

- Path traversal via untrusted JSON record `asset_path` fields
- Symlink traversal in visual scanner
- ReDoS in glob-to-regex conversion (`matchGlob`)
- CLI `indexOf` corruption when flag values match command names
- NaN propagation from unparseable `--max-tokens`, `--fim-rate`, etc.
- SPM (suffix-prefix-middle) FIM token ordering
- JPEG parser: expanded SOF marker coverage, malformed segment guard
- `imgIdx` scoping in multi-turn visual conversations
- Stream write errors now produce structured `OUTPUT_WRITE_FAILED` errors
- Non-RepoDatasetError exceptions wrapped as structured errors (`DISK_FULL`, `PERMISSION_DENIED`)
- Empty dataset division-by-zero in distribution validation
- Binary file detection prevents garbage training pairs from .wasm/.so files

### Improved

- CI workflow with Node 20+22 matrix, npm cache, source maps
- npm package 71% smaller (83 files / 245kB, down from 226 files / 852kB)
- Per-extractor fault isolation (partial output on failure, not crash)
- Progress milestones to stderr during extraction and visual pipeline
- `TOOL_VERSION` in metadata now matches package.json (was hardcoded '0.2.0')
- Backpropagate integration: format-aware command, steps estimation, detection
- Format registry single source of truth (OUTPUT_FORMATS const)
- Skipped oversized files reported in scan results

## 1.1.0 (2026-04-12)

### Added

- Visual pipeline for image-based training data (PNG/JPEG/WebP)
- 10 visual output formats: trl, axolotl, visual_universal, visual_dpo, visual_kto, visual_contrastive, visual_pointwise, llava, llama_factory, qwen2vl
- Image validation (format detection, dimension parsing, corruption checks)
- Binding integrity system (`has_image` + `has_canon` + `has_judgment` = `triangle_complete`)
- `visual generate` and `visual validate` CLI subcommands
- `--embed`, `--allow-incomplete`, `--no-copy-images`, `--no-synthetic` flags
- Comparison-based extractors (DPO, contrastive, pointwise)

## 1.0.0 (2026-04-12)

Initial release. Converts any git repository into LLM training datasets.

### Features

- **6 output formats:** alpaca, sharegpt, openai, raw, completion (language modeling), fim (StarCoder fill-in-the-middle)
- **4 extractors:** code (scope-map architecture), commits (git history), docs (markdown sections), tests (tiered import-based matching)
- **18-field provenance metadata** on every record (The Stack v2 inspired)
- **Balance system:** `--auto-balance` (code:3, tests:2, commits:1, docs:1), custom ratios, hard caps
- **Quality scoring:** StarCoder-derived filters (alphanumeric ratio, line length, auto-generated detection), per-pair quality_score 0-1
- **Validate command:** 4-tier quality report with composite score and letter grade (A-F)
- **Manifest sidecar:** `_manifest.json` with full provenance chain, extraction config, and aggregate stats
- **Inspect command:** Dry-run with per-source breakdown, trainability assessment, balance simulation

### Quality Proof

Benchmarked on 3 repos (tldr-pages/tldr, colinhacks/zod, vitejs/vite). All scored Grade B or higher. Proven: does not collapse into "markdown QA generator" on code-heavy repos.

### Architecture

- Zero runtime dependencies
- TypeScript, ESM-only, Node 20+
- AsyncIterable extractors (streaming, handles large repos)
- Heuristic function detection with string/comment stripping
- Import graph analysis for test↔source matching (8 languages)
- Reservoir sampling with priority scoring for balance
