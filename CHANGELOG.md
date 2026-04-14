# Changelog

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
