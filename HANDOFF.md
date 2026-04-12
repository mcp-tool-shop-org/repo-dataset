# Session Handoff — 2026-04-12

## What happened this session

Built `@mcptoolshop/repo-dataset` from zero to v1.0.0 + shipped the Visual Learning Spine.

### Timeline

1. **Phase 1 (MVP)** — scaffolded the entire CLI, 4 extractors (code, commits, docs, tests), 4 output formats (alpaca, sharegpt, openai, raw), 46 tests
2. **Phase 2A (Signal Control)** — 18-field provenance, balance system (--auto-balance), completion + FIM formats, quality scoring (StarCoder-derived), manifest sidecar, inspect redesign
3. **Phase 2B (Better Code Units)** — scope-map architecture (stripStringsAndComments), import graph parser for test matching, tiered matching algorithm, validate command (4-tier quality report with letter grades)
4. **Phase 2C (Quality Proof)** — benchmarked on tldr (docs-heavy), zod (code-heavy), vite (mixed). All scored Grade B. Bumped to v1.0.0.
5. **Visual Learning Spine** — 5 visual extractors, 5 multimodal output formats (universal/DPO/KTO/contrastive/pointwise), visual repo scanner with 4-tier structure detection, synthetic pair generation

### Current state

- **Version:** 1.0.0
- **Tests:** 240 passing (run `npm run build && npm test`)
- **Repo:** https://github.com/mcp-tool-shop-org/repo-dataset
- **All code pushed.** Working tree is clean.

---

## What's next

### Immediate (Phase 2D — Visual Proof)

Run the visual pipeline on a real style corpus (Fractured Road sprites via Sprite Foundry registry or a subset exported to the repo folder contract). Prove:
- Image+record extraction at scale
- Ranking pairs from real comparisons
- Grounded critique from real constitution docs
- Grade B+ or higher

### Then (before npm publish)

1. Run `npx @mcptoolshop/shipcheck audit` — pass all hard gates
2. SECURITY.md
3. Translations (user runs locally via polyglot-mcp)
4. Landing page / handbook entry (Starlight)
5. `npm publish --access public`

### Future enhancements

- MinHash near-dedup (reduces structural repetition from ~58% to <10%)
- `acorn` as optional peer dep for JS/TS (regex → ~99% accuracy)
- GitHub URL clone support (`repo-dataset generate https://github.com/org/repo`)
- Set coherence extractor (same character across views)
- Visual validate command (grade visual datasets)

---

## Key files to know

| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI entry point — all commands dispatched here |
| `src/types.ts` | Every type in the system (code + visual) |
| `src/pipeline/runner.ts` | Code pipeline orchestrator |
| `src/visual/runner.ts` | Visual pipeline orchestrator |
| `src/visual/scanner.ts` | Scans visual repos, detects structure |
| `src/visual/extractors.ts` | All 4 visual extractors + synthetic pair gen |
| `src/visual/formatters.ts` | 5 multimodal output formatters |
| `src/pipeline/balance.ts` | Reservoir sampling balance system |
| `src/validate/report.ts` | 4-tier validation with letter grades |
| `PHASE2_VISUAL_DESIGN.md` | Full design spec for visual pipeline |
| `PHASE2B_DESIGN.md` | Design spec for code extraction improvements |
| `QUALITY_PROOF.md` | Benchmark results (tldr, zod, vite) |
| `TEST_SPEC.md` | Code pipeline test spec |
| `TEST_SPEC_VISUAL.md` | Visual pipeline test spec |

---

## Commands

```bash
# Code pipeline
repo-dataset generate <path> --format completion --auto-balance
repo-dataset inspect <path> --json
repo-dataset validate <output.jsonl>

# Visual pipeline
repo-dataset visual generate <path> --format visual_dpo
repo-dataset visual inspect <path>

# Build & test
npm run build
npm test
```

---

## Research artifacts (in the design docs)

Six research swarms ran this session covering:
- Training data provenance (The Stack v2, Dolma, OASST)
- Code extraction quality (StarCoder, CodeParrot, SantaCoder)
- Dataset balance controls (The Pile, DoReMi)
- Function extraction heuristics (ctags, scope-map, WASM parsers)
- Test-source matching (import graph, 8 ecosystems)
- Dataset quality validation (LIMA, phi-1, AlpaGasus)
- Multimodal training formats (LLaVA, Qwen-VL, InternVL, TRL)
- Preference/ranking datasets (DPO, KTO, Pick-a-Pic, HPD)
- Style corpus structures (ShotGrid, ftrack, design tokens, AVA)

All synthesized into the design docs above.
