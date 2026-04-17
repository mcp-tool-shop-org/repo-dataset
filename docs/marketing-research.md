# Marketing Research — @mcptoolshop/repo-dataset

**Date:** 2026-04-17
**Purpose:** Drive the truth-aligned marketing swarm. This document captures what the public-surface rewrite is based on. The thesis is the user's, not derived here.

## Protected thesis (locked, do not soften)

> **repo-dataset is the dataset construction layer for serious local ML practice.**

Not a trainer. Not another format converter. A dataset construction and verification layer for local ML workflows.

## Sharp edges (what actually differentiates)

1. **Contamination-aware** — catches HumanEval benchmark leaks, PII patterns, and secrets *before* training, not after
2. **Quality-scored** — letter grades A-F with per-dimension breakdown, not "it shipped"
3. **Triangle-enforced** for multimodal — image + canon + judgment bound together, dropped on incomplete
4. **Clean bridge** to local fine-tuning stack (backpropagate / axolotl / TRL / LLaVA / LLaMA-Factory / Qwen2-VL)

## Competitor scan

Compiled in `research-inputs/competitors.md`. 5 tools read: Axolotl, LLaMA-Factory, Unsloth, HuggingFace datasets, LLaVA.

### Key findings

**All 5 lead with training verbs.** Taglines use: "fine-tune", "train", "load", "run". None leads with construct, verify, check, validate, score, or de-duplicate.

**"Contamination" appears exactly once, and means something different.** LLaMA-Factory's `neat_packing` is about training-time sequence packing (avoiding cross-document attention contamination). It is NOT about dataset-level benchmark/PII/secret leakage. The axis is open.

**Dataset prep, when mentioned, is always a side-feature.** "Flexible Dataset Handling" (Axolotl), "Data Recipes" (Unsloth), "efficient pre-processing" (HF). It's the thing you do *quickly* so you can get to the real work (training).

**HuggingFace datasets is the closest neighbor** — but it's a *loader* for existing datasets, not a *constructor + verifier* for datasets you build from your own repos.

### Positioning gap (the lane to own)

There is no tool in this sample that leads with **dataset construction + verification as the thesis**. That is the lane repo-dataset can claim without head-on overlap.

## Verbs to lead with

**Use:** build, construct, verify, check, validate, score, enforce, bind, de-dup, flag (contamination).
**Avoid as lead verbs:** train, fine-tune, load, run. These are the verbs downstream tools own. repo-dataset feeds them.

## Claims we will NOT make

Per the marketing-research doctrine from the ollama-intern treatment:

- **No unsupported percentages.** Specifically: no "X% of datasets contain HumanEval leaks" claim without data. Category is saturated with invented stats; falsifiability is the axis we compete on.
- **No "the only tool that…"** Unsloth's Data Recipes and Unsloth Studio cover adjacent territory; we are *differentiated*, not *alone*.
- **No performance benchmarks until M5 Max runs produce them.** Leave receipts sections scaffolded.

## Claims we WILL make (evidence-backed)

- 7 code formats + 10 visual formats (counted in `src/types.ts` + `src/visual/formatters.ts`)
- 5 extractors: code, commits, docs, tests, config
- 460 tests passing, zero runtime dependencies
- MinHash LSH near-dedup (parameters documented: 64 hashes, 8 bands, threshold 0.8)
- Contamination validator covers: leaked secrets, PII patterns, HumanEval benchmark signatures
- Shipcheck hard gates A–D pass (see `SHIP_GATE.md` + `SCORECARD.md`)

## Headline / hero direction (user-locked)

### GitHub repo description
> Turn code repos and curated visual repos into contamination-checked training datasets for local fine-tuning.

### README hero line
> Build training data from repos before you touch the trainer.

### README subhead
> repo-dataset turns code, commits, docs, tests, and curated visual assets into trainer-ready datasets — then checks quality, binding integrity, and contamination risk so you do not fine-tune on junk.

### What it is / what it isn't (required section)
- Not a trainer.
- Not another format converter.
- A dataset construction and verification layer for local ML workflows.

### Topics (10)
`training-data`, `fine-tuning`, `dataset-generation`, `multimodal-datasets`, `data-contamination`, `benchmark-leakage`, `vision-language`, `jsonl`, `axolotl`, `llava`

## Intern pass notes

Intern was exercised during this research step. Findings captured in `research-inputs/intern-seams-2026-04-17.md`:

- `ollama_research` (array-param path) failed at MCP input validation — new seam filed (#3)
- `ollama_draft` for doc-prose: shape-correct but content-generic — confirms adoption-pass verdict, none of the 6 variants shipped

Net: intern contributed tone calibration and telemetry, not thesis. The adoption-pass doctrine ("draft for prose saves typing, not thinking") held under real load.

## Wave 2 agent briefs (what to hand to each surface agent)

Each agent has exclusive ownership of its surface. No agent touches a file outside its assignment.

| Agent | Surface | Brief |
|-------|---------|-------|
| **Agent R** (README) | `README.md` + 7 translations | Restructure hero per user-locked text. Add "What it is / what it isn't" section. Keep all feature tables. Scaffold an empty "Receipts" section for M5 Max backfill. Translations deferred — user runs polyglot locally. |
| **Agent L** (Landing) | `site/src/site-config.ts` | Hero: headline + accent per user lock. Description: match README subhead exactly (do not paraphrase). Fix "8 Output Formats" → "7 code + 10 visual". Hero previews: keep. Add a Contamination feature card with a concrete example (secrets/PII/HumanEval). |
| **Agent H** (Handbook) | `site/src/content/docs/handbook/index.md` + `getting-started.md` | Reshape index page to lead with *why* before *what*. Getting-started should show the contamination-check moment, not just install+run. Reference `architecture.md` and `security.md` from the hub. |
| **Agent G** (GitHub metadata) | `gh repo edit` + `package.json` description + keywords | Description: user-locked text. Topics: the 10 listed. Replace package.json keywords with the topics list (plus existing relevant ones). Homepage stays the landing page URL. |

## Wave 2 constraints (apply to all agents)

1. Thesis is locked. Do not re-phrase it.
2. No invented percentages.
3. No "the only tool that…" claims.
4. Scaffold Receipts sections empty — M5 Max runs will populate.
5. Every claim must be backed by a file in the repo or a documented fact.
6. Build must pass after each agent's edit. Agent R runs `npm run verify`; Agent L runs `npm run build` in `site/`; Agent G runs `gh repo view` to confirm metadata.
