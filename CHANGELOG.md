# Changelog

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
