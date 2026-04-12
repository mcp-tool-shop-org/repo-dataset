# Phase 2B/2C Design — Better Code Units + Quality Proof

Research synthesis from investigations into function extraction heuristics, test-source matching, and dataset quality validation.

---

## Phase 2B: Better Code Learning Units

### 1. Function Extraction Upgrade

**Root architecture change:** scope-map approach (what ctags does internally).

```
Pass 1: stripStringsAndComments() → safe brace/indent counting
Pass 2: Build scope map (startLine, endLine, depth) for whole file
Pass 3: Classify each scope (function, class, method, if, loop, other)
Pass 4: Extract classified scopes as training pairs
```

**The single biggest fix:** `stripStringsAndComments()` preprocessor before brace counting. Replaces string/comment content with spaces so braces inside `"{"` or `/* { */` never corrupt the scope map.

**Upgraded regex patterns (95%+ coverage):**

| Language | What's new |
|----------|-----------|
| TS/JS | Arrow functions (`const Foo = () =>`), generators (`function*`), private methods (`#method(`), accessor methods (`get/set`), abstract class, interface/type |
| Python | Decorator collection (scan backward from `def`), multi-line signatures (paren balance), `async def` |
| Rust | `pub(crate)`, `async unsafe fn`, `impl<T> Trait for Struct`, `macro_rules!`, `const fn` |
| Go | Receivers with generics (`func (s *Server) Handle[T any](`), type interfaces |
| Java/C# | Annotations on same line, generic return types, `suspend`/`virtual`/`override`, records |

**Multi-line signature handling:**
When function start line has unbalanced parens, scan forward until `parenDepth === 0`, then look for opening brace. Catches:
```typescript
export async function processData(
  input: DataStream,
  options: ProcessOptions
): Promise<Result> {
```

**Python block-end improvement:**
Track multi-line signatures (unbalanced parens), handle `elif/else/except/finally` as continuation of the same block, don't terminate on blank lines.

**Optional acorn dep (Phase 2B+):**
`acorn` + `acorn-typescript` (~400KB, pure JS) as optional peer dependency for JS/TS. When detected, use real AST for JS/TS files → ~99% accuracy. Other languages keep improved heuristics.

---

### 2. Test↔Source Matching Upgrade

**Current accuracy:** ~60-65%  
**Target accuracy:** ~88-92%

**Tiered matching algorithm (priority order):**

```
Tier 1: Import graph parsing (highest confidence, +20% accuracy)
  → Parse import/require/use statements from test file
  → Resolve to filesystem paths
  → If 1 project-internal import → gold pair (high confidence)
  → If 2-3 imports → pair with primary, mark confidence: "medium"
  → If 4+ imports → skip or mark as integration test

Tier 2: Language-specific conventions (high confidence)
  → Go: same directory, strip _test.go → .go (guaranteed 1:1)
  → Java: src/test/java/Foo/BarTest.java → src/main/java/Foo/Bar.java
  → Ruby: spec/models/user_spec.rb → app/models/user.rb
  → C#: Foo.Tests/BarTests.cs → Foo/Bar.cs
  → Elixir: test/foo_test.exs → lib/foo.ex

Tier 3: Filename stripping (current, expanded)
  → Add: _spec.rb, Spec.java, Tests.cs, .cy.ts, .e2e.ts, .integration.ts

Tier 4: Directory traversal (current, expanded)
  → Add: spec/ → app/, spec/ → lib/, .Tests/ → /, src/test/ → src/main/

Tier 5: Describe/class name extraction
  → Parse describe('UserService', ...) → look for UserService source file

Tier 6: Edit distance fallback (low confidence)
  → If Levenshtein distance ≤ 3, match with confidence: "low"
```

**Import parsing regexes:**
```
JS/TS:  /(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g
Python: /^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm
Rust:   /^use\s+((?:crate|super|self)::[\w:]+|[\w]+::[\w:]+)/gm
Go:     /import\s+(?:\w+\s+)?"([^"]+)"/g
Java:   /^import\s+([\w.]+);/gm
Ruby:   /require(?:_relative)?\s+['"]([^'"]+)['"]/g
```

**New: Inline test extraction (Rust)**
Detect `#[cfg(test)]` in source files, split at that boundary. Everything above = source, everything below = test. These get `quality_score += 0.15` bonus (perfect 1:1 alignment, tests written alongside code).

**Exclusion list (not test files):**
`conftest.py`, `test_helper.rb`, `spec_helper.rb`, `rails_helper.rb`, `jest.config.*`, `vitest.config.*`, `setup.ts`, `setupTests.ts`, `test-utils.*`, `common/mod.rs`, `__init__.py`

---

### 3. Quality Scoring Improvements

**Function quality scoring (refined):**
| Signal | Score | Source |
|--------|-------|--------|
| Token count 50-500 (sweet spot) | +0.30 | StarCoder research |
| Has docstring | +0.25 | Code quality indicator |
| Has meaningful name (not `foo`, `handle`) | +0.15 | Training signal quality |
| 5-100 lines (not trivial, not unfocused) | +0.15 | Function length sweet spots |
| Has control flow (if/for/while) | +0.15 | Non-trivial logic |
| Is paired with test | +0.15 | Cross-reference bonus |
| Is inline-tested (Rust #[cfg(test)]) | +0.15 | Highest confidence |

**Test pair quality scoring:**
| Signal | Score |
|--------|-------|
| 3+ assertions | +0.20 |
| 6+ assertions | +0.10 |
| Single-source import (unit test) | +0.15 |
| Has setup/teardown | +0.05 |
| Test:source ratio 0.5x-3.0x | +0.10 |
| Source has exports (public API) | +0.10 |

---

## Phase 2C: Quality Proof

### The `validate` Command

New CLI command: `repo-dataset validate <path-to-jsonl>`

Reads a generated JSONL file (no repo access needed) and produces a quality report with a composite score and letter grade.

**Four validation tiers:**

#### Tier 1: Structural Integrity (blocks release)
- JSONL validity: every line parses as JSON (100% required)
- Schema compliance: required fields present per format
- Empty field rate: <2% (fail at >5%)
- Encoding correctness: no mojibake, null bytes, control chars

#### Tier 2: Distribution Health
- Token length distribution: CV between 0.3-1.5 (not too uniform, not bimodal)
- Percentiles: P10 > 30 tokens, P90 < 1500 tokens
- Source balance: no single source > 60% (warn at >80%)
- Signal type entropy: > 1.5 (max ~2.8 for 7 types)

#### Tier 3: Content Quality
- Near-duplicate rate (10-gram overlap): <5% pairs share 10-grams
- Vocabulary richness (Type-Token Ratio): > 0.15 on 1000-pair sample
- Instruction diversity: >40% unique prefixes (first 10 words)
- Trivial pair rate: <5% (output restates input with <20 novel tokens)
- File concentration: >50% of pairs from >10% of files

#### Tier 4: Trainability Grade

| Score | Grade | Meaning |
|-------|-------|---------|
| 90-100 | A | Production-ready |
| 75-89 | B | Good, minor improvements possible |
| 60-74 | C | Usable with caution |
| 40-59 | D | Significant issues |
| 0-39 | F | Do not use |

Score formula (weighted):
- Structural integrity: 20% (binary pass/fail)
- Source balance entropy: 20%
- Content quality composite: 30%
- Length distribution health: 15%
- Pair count bonus: 15% (log-scaled, 50=min, 1000=full)

---

### Benchmark Repos for Phase 2C Proof

| Type | Repo | Why |
|------|------|-----|
| **Docs-heavy** | `tldr-pages/tldr` | Pure markdown, tests --auto-balance effectiveness |
| **Code-heavy** | `colinhacks/zod` | TypeScript, rich logic, minimal docs, tests function extraction |
| **Mixed** | `vitejs/vite` | Balanced code + docs + tests + commits |
| **Self** | `repo-dataset` itself | Smallest, fully known, regression test |

**What to prove per repo:**
1. `completion` format produces code-dominant output (not docs)
2. `--auto-balance` prevents collapse into markdown QA
3. `validate` command gives grade B+ or higher
4. Signal type entropy > 1.5
5. No single source > 60% after balance

---

## Implementation Sequence

### Phase 2B (code quality)
1. `stripStringsAndComments()` preprocessor in code.ts
2. Scope-map architecture (buildScopeMap → classifyScope)
3. Upgraded regex patterns per language
4. Multi-line signature handling (paren balance)
5. Decorator/annotation collection (scan backward)
6. Import graph parsing for test matching (new file: `src/extractors/imports.ts`)
7. Tiered matching algorithm in tests.ts
8. Inline test extraction for Rust
9. Expanded exclusion list for non-test helpers
10. Quality scoring refinements

### Phase 2C (quality proof)
1. New file: `src/validate/` directory (report, structural, distribution, content, scoring)
2. CLI command: `repo-dataset validate <jsonl>`
3. Run against 4 benchmark repos
4. Document results in QUALITY_PROOF.md
5. Grade must be B+ or higher on all 4 before v1.0.0

---

## Files to Create/Modify

| Action | File | Change |
|--------|------|--------|
| MODIFY | `src/extractors/code.ts` | stripStringsAndComments, scope-map, upgraded patterns |
| MODIFY | `src/extractors/tests.ts` | Tiered matching, import parsing, inline test extraction |
| MODIFY | `src/discovery/scanner.ts` | Expanded isTestFile exclusions |
| CREATE | `src/extractors/imports.ts` | Import parsing regexes per language |
| CREATE | `src/validate/report.ts` | Orchestrator, reads JSONL, calls metric modules |
| CREATE | `src/validate/structural.ts` | JSONL validity, schema, encoding checks |
| CREATE | `src/validate/distribution.ts` | Length stats, entropy, balance |
| CREATE | `src/validate/content.ts` | Near-dedup 10-gram, TTR, instruction diversity, trivial detection |
| CREATE | `src/validate/scoring.ts` | Composite score + grade |
| MODIFY | `src/cli.ts` | Add `validate` command |
| CREATE | `QUALITY_PROOF.md` | Benchmark results documenting the proof |
