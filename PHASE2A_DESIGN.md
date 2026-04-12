# Phase 2A Design — Truth, Provenance, and Signal Control

Research synthesis from 3 parallel investigations into training data provenance (The Stack v2, Dolma, OASST), code extraction quality (StarCoder, CodeParrot, SantaCoder), and dataset balance controls (The Pile, DoReMi).

---

## Root Cause of the 90/10 Problem

The code extractor wraps everything in `"Explain this function"` instruction format — turning code into a docs task. The code itself should BE the training signal, not a prompt for generating explanations.

**Fix:** Add `completion` and `fim` output formats that emit raw code. Keep `alpaca`/`sharegpt`/`openai` for instruction-following tasks (small fraction of output).

---

## New Output Formats (Phase 2A)

### `completion` — Language modeling format
```jsonl
{"text": "import { readFile } from 'node:fs/promises';\n\nexport async function loadConfig(path: string) {\n  const raw = await readFile(path, 'utf-8');\n  return JSON.parse(raw);\n}", "metadata": {...}}
```
No instruction wrapping. The code IS the signal. This is how StarCoder, SantaCoder, and CodeParrot were trained.

### `fim` — Fill-in-the-middle format
```jsonl
{"text": "<fim_prefix>import { readFile } from 'node:fs/promises';\n\nexport async function loadConfig(path: string) {\n  <fim_suffix>\n  return JSON.parse(raw);\n}<fim_middle>const raw = await readFile(path, 'utf-8');", "metadata": {...}}
```
Parameters: `--fim-rate 0.5` (50% of examples get FIM transform, rest stay left-to-right), `--fim-spm-rate 0.5`.

StarCoder tokens: `<fim_prefix>`, `<fim_suffix>`, `<fim_middle>`

---

## Provenance Schema (expanding PairMetadata from 5 → 18 fields)

### Current (5 fields)
```typescript
{ source, file, language, commitSha, tokens }
```

### New schema
```typescript
export interface PairMetadata {
  // Tier 1: Identity (required)
  id: string;                    // SHA-256 of instruction+input+output
  source: ExtractorName;         // "code" | "commits" | "docs" | "tests"
  repo_name: string;             // "mcp-tool-shop-org/shipcheck"
  file: string | null;           // relative path
  language: string | null;       // detected language

  // Tier 2: Reproducibility
  commit_sha: string | null;     // HEAD at extraction time (or commit being analyzed)
  line_start: number | null;     // exact extraction range
  line_end: number | null;
  extractor_type: string;        // "code:function" | "code:class" | "code:file" | "docs:section" | "commits:explain" | "commits:implement" | "tests:write" | "tests:reverse"
  extractor_version: string;     // "0.2.0"
  extracted_at: string;          // ISO 8601

  // Tier 3: Quality signals
  tokens: number;
  char_count: number;
  has_docstring: boolean;
  has_tests: boolean;            // paired with a test file
  complexity: "low" | "medium" | "high";  // heuristic
  quality_score: number;         // 0.0 - 1.0 composite
  signal_type: SignalType;       // classification of what this teaches
}

export type SignalType =
  | "implementation"    // raw code, function bodies
  | "completion"        // code for LM/FIM training
  | "explanation"       // natural language explaining code
  | "test_generation"   // code → test pairs
  | "change_explanation" // commit → description
  | "change_implementation" // description → commit
  | "documentation";   // docs sections
```

### Manifest sidecar (`_manifest.json`)
Generated alongside `dataset.jsonl`:
```json
{
  "schema_version": "2",
  "tool_version": "0.2.0",
  "created_at": "2026-04-12T...",
  "source_repo": { "name": "org/repo", "commit_sha": "abc123", "path": "/local/path" },
  "extractors_used": ["code", "commits", "docs", "tests"],
  "format": "alpaca",
  "balance_config": { "ratios": {"code": 3, "docs": 1}, "strategy": "reservoir" },
  "filters_applied": { "min_tokens": 20, "max_tokens": 2048, "dedup": "minhash" },
  "stats": {
    "total_pairs": 213,
    "total_tokens": 27602,
    "by_source": { "code": 16, "docs": 191, "commits": 6, "tests": 0 },
    "by_signal_type": { "implementation": 12, "explanation": 4, "documentation": 191, "change_explanation": 6 }
  }
}
```

---

## Balance System

### Philosophy
Emit everything with full provenance. Balance is optional post-processing, not data destruction.

### CLI Flags
```
--balance code:3,docs:1,commits:1,tests:2    Ratio-based (The Pile model)
--auto-balance                                Sensible defaults
--max-pairs docs:50                           Hard cap per source
--min-pairs code:20                           Soft floor (warns if unmet)
```

### Auto-balance defaults (from research)
- code: **3x** (underrepresented per-pair, highest value)
- tests: **2x** (paired signal, high value)
- commits: **1x** (natural quantity usually reasonable)
- docs: **1x** (already overproduces, no boost)

### Implementation: Reservoir Sampling
```
1. Run all extractors → collect pairs into buckets by source
2. Score pairs within each bucket (quality_score)
3. Compute target: total_budget × (ratio_i / sum_ratios)
4. If bucket < target → take all (can't fabricate)
5. If bucket > target → take top-N by quality_score
6. Apply max-cap as hard ceiling
7. Emit balance report
```

### Trainability Assessment
| Condition | Level | Threshold |
|-----------|-------|-----------|
| Single source > 80% | WARNING | Docs dominating |
| Total pairs < 50 | ERROR | Not trainable |
| Total pairs < 200 | WARNING | Marginal |
| Avg tokens/pair < 30 | WARNING | Too shallow |
| Avg tokens/pair > 1000 | WARNING | Too long for LoRA |
| docs > 5× code | WARNING | Imbalanced |

---

## Better Quality Filters (from StarCoder/CodeParrot research)

Add to `quality.ts`:

| Filter | Threshold | Source |
|--------|-----------|--------|
| Max line length | < 1000 chars | CodeParrot |
| Mean line length | < 100 chars | CodeParrot |
| Alphanumeric ratio | > 0.25 | BigCode |
| Comment-to-code ratio | 0.01 - 0.80 | SantaCoder |
| Auto-generated detection | keyword scan | CodeParrot |
| Function token sweet spot | 50-500 tokens | Research consensus |

Auto-generated keywords to detect:
- "DO NOT EDIT", "auto-generated", "generated by", "@generated"
- Tool headers: protobuf, swagger-codegen, openapi-generator

---

## Improved Code Extractor

### Changes to `extractors/code.ts`:

1. **Include imports as context** — prepend file's import block to each function extraction
2. **Stop generating synthetic explanations** — `generateExplanation()` produces filler. For `completion`/`fim` formats, output IS the code.
3. **Classify extraction sub-types** — `code:function`, `code:class`, `code:method`, `code:file`
4. **Quality scoring per function:**
   - Has docstring: +0.2
   - Token count in sweet spot (50-500): +0.3
   - Has meaningful name (not `foo`, `handle`, `process`): +0.1
   - Cyclomatic complexity 3-25: +0.2
   - Has paired test: +0.2

### New: `completion` extractor mode
When format is `completion` or `fim`:
- Emit whole functions as `{"text": "<imports>\n\n<function body>"}`
- Emit whole files (if under maxTokens) as `{"text": "<file content>"}`
- NO instruction wrapping
- FIM transform applied with configurable rate

---

## Near-Deduplication Upgrade

Replace exact SHA-256 with MinHash (BigCode standard):
- **Permutations:** 256
- **N-gram size:** 5 (5-grams significantly better than unigrams for code)
- **Jaccard threshold:** 0.7
- **Keep:** one document per cluster (highest quality_score)

Implementation note: This adds compute cost. Keep exact-hash as fast pre-filter, then MinHash on survivors. For v0.2.0, can use a simplified approach: shingle the text into 5-grams, compute 256 min-hashes, compare Jaccard. No need for LSH banding at repo-scale (<100K pairs).

---

## Inspect Command Redesign

```
$ repo-dataset inspect ./my-project

  Repository: my-project (TypeScript, 47 source files)

  Signal Distribution:
    source     pairs    tokens   share    quality
    ──────────────────────────────────────────────
    code        142     14,200   28.9%    avg 0.72
    docs        310     28,000   63.1%    avg 0.45
    commits      23      3,200    4.7%    avg 0.68
    tests        16      2,800    3.3%    avg 0.81
    ──────────────────────────────────────────────
    total       491     48,200   100%

  Warnings:
    ⚠ docs dominance: 63.1% (recommend --balance or --auto-balance)
    ⚠ low test pairing: only 16/142 code functions have tests

  With --auto-balance:
    code   142 → 142 (all kept, 3x weight)
    docs   310 →  47 (top by quality_score)
    commits 23 →  23 (all kept)
    tests   16 →  16 (all kept)
    effective: 228 pairs, ~23,100 tokens

  Trainability: GOOD (228 pairs, balanced signal mix)
```

---

## Implementation Sequence

### Step 1: Provenance expansion
- Expand `PairMetadata` in `types.ts`
- Update all extractors to populate new fields
- Generate `_manifest.json` sidecar from runner
- Add `--repo-name` flag (auto-detect from git remote)

### Step 2: Quality scoring
- Add `scorePair()` to `quality.ts`
- Add StarCoder-derived quality filters
- Auto-generated file detection in `filters.ts`

### Step 3: Balance system
- New file: `src/pipeline/balance.ts`
- Reservoir sampling with priority scoring
- `--balance`, `--auto-balance`, `--max-pairs`, `--min-pairs` flags
- Balance report in inspect output

### Step 4: New formats
- `completion` formatter (raw text, no instruction wrap)
- `fim` formatter (StarCoder tokens, configurable rate)
- Code extractor emits raw code when format is completion/fim

### Step 5: Near-dedup upgrade
- MinHash implementation in `dedup.ts`
- 5-gram shingling, 256 permutations, 0.7 threshold
- Keep exact-hash as fast pre-filter

### Step 6: Inspect redesign
- Per-source breakdown with quality averages
- Trainability assessment with thresholds
- Balance simulation ("with --auto-balance applied")
- Recommendations engine

---

## Files to Create/Modify

| Action | File | Change |
|--------|------|--------|
| MODIFY | `src/types.ts` | Expand PairMetadata, add BalanceConfig, BalanceReport, SignalType |
| MODIFY | `src/pipeline/quality.ts` | Add scorePair(), StarCoder filters, auto-generated detection |
| MODIFY | `src/pipeline/dedup.ts` | Add MinHash alongside exact-hash |
| MODIFY | `src/pipeline/runner.ts` | Add balance step, manifest generation, inspect redesign |
| MODIFY | `src/extractors/code.ts` | Import context, sub-type classification, quality scoring, completion mode |
| MODIFY | `src/extractors/*.ts` | Populate new metadata fields |
| MODIFY | `src/discovery/filters.ts` | Auto-generated file detection |
| MODIFY | `src/cli.ts` | New flags, inspect redesign, repo-name detection |
| CREATE | `src/pipeline/balance.ts` | Reservoir sampling, priority scoring, balance report |
| CREATE | `src/formatters/completion.ts` | Raw text formatter (no instruction wrap) |
| CREATE | `src/formatters/fim.ts` | FIM transform with StarCoder tokens |
| MODIFY | `src/formatters/registry.ts` | Register new formats |
