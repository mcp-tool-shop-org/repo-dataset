# Test Specification — @mcptoolshop/repo-dataset v1.0.0

## Overview

Complete test spec for repo-dataset after Phase 2A+2B. 190 tests currently passing across 20 test files.

**Stack:** TypeScript, ESM (`"type": "module"`), Node 20+  
**Test runner:** `node --test` (built-in)  
**Assertions:** `node:assert/strict`  
**Build:** `npx tsc` then `node --test dist/tests/**/*.test.js`  
**Repo:** `F:/AI/repo-dataset`

---

## Current Test File Inventory

| File | Tests | Status |
|------|-------|--------|
| `src/tests/tokens.test.ts` | 4 | passing |
| `src/tests/filters.test.ts` | 13 | passing |
| `src/tests/languages.test.ts` | 8 | passing |
| `src/tests/dedup.test.ts` | 4 | passing |
| `src/tests/quality.test.ts` | 6 | passing |
| `src/tests/formatters.test.ts` | 4 | passing |
| `src/tests/completion.test.ts` | ? | passing |
| `src/tests/fim.test.ts` | ? | passing |
| `src/tests/balance.test.ts` | ? | passing |
| `src/tests/cli.test.ts` | 6 | passing |
| `src/tests/errors.test.ts` | ? | passing |
| `src/tests/chunker.test.ts` | ? | passing |
| `src/tests/git.test.ts` | ? | passing |
| `src/tests/scanner.test.ts` | ? | passing |
| `src/tests/registry.test.ts` | ? | passing |
| `src/tests/pipeline.test.ts` | ? | passing |
| `src/tests/extractors/code.test.ts` | ? | passing |
| `src/tests/extractors/commits.test.ts` | ? | passing |
| `src/tests/extractors/docs.test.ts` | ? | passing |
| `src/tests/extractors/tests.test.ts` | ? | passing |

**Not yet tested (no test file exists):**
- `src/extractors/scope.ts` — stripStringsAndComments, buildBraceScopeMap, classifyScope, buildPythonScopeMap
- `src/extractors/imports.ts` — parseFileImports, matchImportsToSources
- `src/validate/structural.ts` — validateStructural
- `src/validate/distribution.ts` — validateDistribution
- `src/validate/content.ts` — validateContent
- `src/validate/scoring.ts` — computeScore
- `src/validate/report.ts` — runValidation

---

## Schema Reference

### PairMetadata (18 fields)

```typescript
interface PairMetadata {
  // Tier 1: Identity
  id: string;                    // content hash (16 hex chars)
  source: ExtractorName;         // "code" | "commits" | "docs" | "tests"
  repo_name: string;             // "org/repo" or basename
  file: string | null;           // relative path
  language: string | null;

  // Tier 2: Reproducibility
  commit_sha: string | null;
  line_start: number | null;     // 1-indexed
  line_end: number | null;
  extractor_type: ExtractorSubType;  // "code:function" | "code:class" | "code:method" | "code:file" | "docs:section" | "commits:explain" | "commits:implement" | "tests:write" | "tests:reverse"
  extractor_version: string;     // "0.2.0" or "0.3.0"
  extracted_at: string;          // ISO 8601

  // Tier 3: Quality signals
  tokens: number;
  char_count: number;
  has_docstring: boolean;
  has_tests: boolean;
  complexity: "low" | "medium" | "high";
  quality_score: number;         // 0.0 - 1.0
  signal_type: SignalType;       // "implementation" | "completion" | "explanation" | "test_generation" | "change_explanation" | "change_implementation" | "documentation"
}
```

### PipelineConfig (all fields required)

```typescript
interface PipelineConfig {
  repoPath: string;
  repoName: string;
  outputDir: string;
  format: OutputFormat;    // "alpaca" | "sharegpt" | "openai" | "raw" | "completion" | "fim"
  extractors: ExtractorName[];
  maxTokens: number;
  minTokens: number;
  maxCommits: number;
  include: string[];
  exclude: string[];
  pipeToBackpropagate: boolean;
  json: boolean;
  balance: BalanceConfig | null;
  fimRate: number;         // 0.0 - 1.0
  fimSpmRate: number;      // 0.0 - 1.0
}
```

### ExtractionContext (all fields required)

```typescript
interface ExtractionContext {
  repoPath: string;
  repoName: string;
  repoInfo: RepoInfo;
  config: PipelineConfig;
  headSha: string | null;
}
```

### PipelineResult

```typescript
interface PipelineResult {
  totalFiles: number;
  filesProcessed: number;
  pairsExtracted: number;
  pairsAfterFilter: number;
  pairsAfterBalance: number;
  duplicatesRemoved: number;
  outputPath: string;
  manifestPath: string | null;
  totalTokens: number;
  byExtractor: Record<string, SourceStats>;
  warnings: string[];
  trainability: "good" | "marginal" | "insufficient";
}

interface SourceStats {
  pairs: number;
  tokens: number;
  pct: number;
  avgQuality: number;
}
```

---

## Helper Factories

### makeConfig

```typescript
function makeConfig(repoPath: string, overrides?: Partial<PipelineConfig>): PipelineConfig {
  return {
    repoPath,
    repoName: "test/repo",
    outputDir: "/tmp/test-output",
    format: "alpaca",
    extractors: ["code", "commits", "docs", "tests"],
    maxTokens: 2048,
    minTokens: 5,
    maxCommits: 100,
    include: [],
    exclude: [],
    pipeToBackpropagate: false,
    json: false,
    balance: null,
    fimRate: 0.5,
    fimSpmRate: 0.5,
    ...overrides,
  };
}
```

### makeCtx

```typescript
function makeCtx(dir: string, info: RepoInfo, config: PipelineConfig): ExtractionContext {
  return { repoPath: dir, repoName: config.repoName, repoInfo: info, config, headSha: null };
}
```

### makePair

```typescript
function makePair(overrides?: Partial<ExtractedPair>): ExtractedPair {
  return {
    instruction: "Explain this",
    input: "const x = 1;",
    output: "Sets x to 1",
    metadata: {
      id: "test123",
      source: "code",
      repo_name: "test/repo",
      file: "src/main.ts",
      language: "typescript",
      commit_sha: null,
      line_start: 1,
      line_end: 10,
      extractor_type: "code:function",
      extractor_version: "0.2.0",
      extracted_at: new Date().toISOString(),
      tokens: 50,
      char_count: 200,
      has_docstring: false,
      has_tests: false,
      complexity: "low",
      quality_score: 0.5,
      signal_type: "explanation",
    },
    ...overrides,
  };
}
```

### makePairs (for balance tests)

```typescript
function makePairs(source: ExtractorName, count: number, quality = 0.5): ExtractedPair[] {
  return Array.from({ length: count }, (_, i) => ({
    instruction: `inst-${source}-${i}`,
    input: `input-${source}-${i} `.repeat(20), // enough tokens
    output: `output-${source}-${i} `.repeat(20),
    metadata: {
      id: `${source}-${i}`,
      source,
      repo_name: "test/repo",
      file: `src/${source}-${i}.ts`,
      language: "typescript",
      commit_sha: null,
      line_start: null,
      line_end: null,
      extractor_type: `${source === "docs" ? "docs:section" : source === "tests" ? "tests:write" : source === "commits" ? "commits:explain" : "code:function"}` as any,
      extractor_version: "0.2.0",
      extracted_at: new Date().toISOString(),
      tokens: 50,
      char_count: 200,
      has_docstring: false,
      has_tests: false,
      complexity: "low" as const,
      quality_score: quality + (i * 0.001),
      signal_type: "explanation" as const,
    },
  }));
}
```

### collectPairs

```typescript
async function collectPairs(extractor: Extractor, ctx: ExtractionContext): Promise<ExtractedPair[]> {
  const pairs: ExtractedPair[] = [];
  for await (const pair of extractor.extract(ctx)) {
    pairs.push(pair);
  }
  return pairs;
}
```

---

## Tests Needed for New Modules

### `src/tests/scope.test.ts` — NEW

**Module:** `src/extractors/scope.ts`  
**Exports:** `stripStringsAndComments`, `buildBraceScopeMap`, `classifyScope`, `buildPythonScopeMap`

| Test | Assert |
|------|--------|
| stripStringsAndComments: preserves normal code | `"const x = 1;"` → unchanged |
| stripStringsAndComments: replaces double-quoted strings with spaces | `'const s = "hello{}"'` → braces become spaces |
| stripStringsAndComments: replaces single-quoted strings | `"const s = '{'"` → brace becomes space |
| stripStringsAndComments: replaces backtick strings | `` const t = `${x}` `` → interpolation content becomes spaces |
| stripStringsAndComments: handles escaped quotes | `'const s = "he said \\"hi\\""'` → correctly finds string boundaries |
| stripStringsAndComments: replaces // comments | `"code // comment {"` → everything after `//` becomes spaces |
| stripStringsAndComments: replaces # comments | `"x = 1 # comment {"` → comment becomes spaces |
| stripStringsAndComments: handles block comment start | `"code /* start"` with state → state.inBlockComment becomes true |
| stripStringsAndComments: handles block comment end | `"end */ code {"` with state.inBlockComment=true → returns `"     code {"`, state becomes false |
| stripStringsAndComments: multi-line block comment state persists | Process two lines: `"/* start"` then `"end */"` → state tracks correctly |
| buildBraceScopeMap: empty file → empty array | `[]` |
| buildBraceScopeMap: single function | `["function foo() {", "  return 1;", "}"]` → 1 scope, startLine=0, endLine=2 |
| buildBraceScopeMap: nested braces | Outer function with inner if → 2 scopes, inner nested |
| buildBraceScopeMap: ignores braces in strings | `['const x = "{"', "const y = 1;", "}"]` → no scope (the `{` is in a string) |
| buildBraceScopeMap: ignores braces in comments | `["// {", "function foo() {", "}"]` → 1 scope (from function, not comment) |
| classifyScope: identifies function | Header `"function foo() {"` → kind="function", name="foo" |
| classifyScope: identifies class | Header `"class Bar {"` → kind="class", name="Bar" |
| classifyScope: identifies method | Header `"  async handle() {"` → kind="method", name="handle" |
| classifyScope: identifies control flow | Header `"  if (x) {"` → kind="control" |
| classifyScope: TS arrow function | Header `"export const foo = () => {"` → kind="function", name="foo" |
| classifyScope: Rust fn | Header `"pub async fn process() {"` → kind="function", name="process" |
| classifyScope: Go method | Header `"func (s *Server) Handle() {"` → kind="method", name="Handle" |
| buildPythonScopeMap: finds def | `["def foo():", "  return 1", ""]` → 1 scope |
| buildPythonScopeMap: finds class | `["class Bar:", "  pass", ""]` → 1 scope, kind="class" |
| buildPythonScopeMap: handles decorators | `["@decorator", "def foo():", "  pass"]` → startLine=0 (includes decorator) |
| buildPythonScopeMap: multi-line signature | `["def foo(", "  x,", "  y", "):", "  return x"]` → correct endLine |
| buildPythonScopeMap: nested functions | `["def outer():", "  def inner():", "    pass", "  return inner"]` → 2 scopes |
| buildPythonScopeMap: elif/else continuation | `["def foo():", "  if x:", "    pass", "  else:", "    pass"]` → endLine includes else block |

---

### `src/tests/imports.test.ts` — NEW

**Module:** `src/extractors/imports.ts`  
**Exports:** `parseFileImports`, `matchImportsToSources`

| Test | Assert |
|------|--------|
| Parses ES import (from) | `import { foo } from './bar'` → resolved to relative path |
| Parses ES import (bare) | `import './styles.css'` → raw='./styles.css' |
| Parses require() | `const x = require('./utils')` → resolved |
| Filters node: as external | `import fs from 'node:fs'` → isProjectInternal=false |
| Filters npm packages as external | `import express from 'express'` → isProjectInternal=false |
| Parses Python from...import | `from package.module import X` → resolved to "package/module" |
| Parses Python import | `import os.path` → external (stdlib) |
| Filters Python stdlib | `import json` → isProjectInternal=false |
| Parses Rust use crate:: | `use crate::utils::helper` → resolved to "src/utils/helper" |
| Filters Rust external crates | `use serde::Serialize` → isProjectInternal=false |
| Parses Go imports | `import "myproject/pkg/utils"` → resolved |
| Filters Go stdlib | `import "fmt"` → isProjectInternal=false |
| Parses Java imports | `import com.foo.Bar;` → resolved to "com/foo/Bar" |
| Parses Ruby require_relative | `require_relative '../lib/foo'` → resolved |
| matchImportsToSources: finds exact match | Import resolves to "src/utils" → matches sourceFile "src/utils.ts" |
| matchImportsToSources: tries extensions | Import "src/foo" → finds "src/foo.ts" |
| matchImportsToSources: tries index | Import "src/lib" → finds "src/lib/index.ts" |
| matchImportsToSources: returns empty for no match | Import "src/nonexistent" → [] |
| Multiple imports from one file | File with 3 imports → returns 3 matches |

---

### `src/tests/validate/structural.test.ts` — NEW

**Module:** `src/validate/structural.ts`

| Test | Assert |
|------|--------|
| Valid JSONL passes | Write valid alpaca JSONL → pass=true, validLines=totalLines |
| Invalid JSON fails | Write `"not json\n"` → validLines < totalLines |
| Empty fields detected | Write `{"instruction":"","input":"","output":""}` → emptyFields > 0 |
| Encoding errors detected | Write line with null byte → encodingErrors > 0 |
| Oversized lines detected | Write 600KB line → oversizedLines > 0 |
| Blank lines are skipped | Write valid JSONL with blank lines between → totalLines counts only non-blank |
| Completion format: text field checked | `{"text":""}` → emptyFields > 0 |
| Completion format: valid text passes | `{"text":"hello world"}` → emptyFields = 0 |
| ShareGPT format: empty conversations | `{"conversations":[]}` → emptyFields > 0 |
| OpenAI format: empty messages | `{"messages":[]}` → emptyFields > 0 |
| Pass threshold: <5% empty | 1 empty out of 100 → pass=true |
| Fail threshold: >5% empty | 10 empty out of 100 → pass=false |

---

### `src/tests/validate/distribution.test.ts` — NEW

**Module:** `src/validate/distribution.ts`

| Test | Assert |
|------|--------|
| Computes mean/median/stddev correctly | Known data → exact values |
| Computes percentiles correctly | 100 values → P50 is median |
| CV (coefficient of variation) | stddev/mean | Verify formula |
| Source balance as fractions | 50 code + 50 docs → each 0.5 |
| Shannon entropy: single source | All from "code" → entropy = 0 |
| Shannon entropy: uniform | Equal from 4 sources → entropy = 2.0 |
| Detects dominant source | 70% from one → dominantSource set |
| No dominant when balanced | 40%/30%/30% → dominantSource null |
| Signal types counted correctly | Mixed signal_type values → correct counts |
| Pass when healthy | CV 0.5, no dominant, good percentiles → pass=true |
| Warn when uniform lengths | CV < 0.3 → pass=false |
| Warn when extreme lengths | P10 < 20 → pass=false |

---

### `src/tests/validate/content.test.ts` — NEW

**Module:** `src/validate/content.ts`

| Test | Assert |
|------|--------|
| Detects exact duplicates | Two identical pairs → exactDuplicates = 1 |
| No duplicates in unique set | All different → exactDuplicates = 0 |
| 10-gram overlap detection | Two pairs sharing a 10-word phrase → nearDuplicatePct > 0 |
| Short pairs skip n-gram check | <10 words → not flagged |
| Vocabulary TTR computed correctly | Known word set → exact TTR |
| Instruction diversity: all unique | 10 unique prefixes out of 10 → 100% |
| Instruction diversity: all same | Same instruction repeated → low % |
| Trivial pair detection | Output restates instruction with <20 novel words → flagged |
| Non-trivial pairs pass | Long informative output → not flagged |
| Unique source files counted | 5 different file paths → uniqueSourceFiles = 5 |
| Pass when all healthy | Good TTR, low dedup, high diversity → pass=true |
| Fail when vocabulary poor | TTR < 0.08 → pass=false |
| Fail when near-dup high | >15% near-dup → pass=false |

---

### `src/tests/validate/scoring.test.ts` — NEW

**Module:** `src/validate/scoring.ts`

| Test | Assert |
|------|--------|
| Perfect inputs → high score | structural pass, good entropy, good content, 1000 pairs → score >= 85 |
| Structural fail → loses 20 points | structural.pass=false → score drops by 20 |
| Low entropy → loses balance points | sourceEntropy=0 → entropy component is 0 |
| Max entropy → full balance points | sourceEntropy = sourceEntropyMax → full 20 |
| Content all good → 30 points | All thresholds met → contentScore = 30 |
| Content all bad → 0 points | All thresholds missed → contentScore near 0 |
| 50 pairs → minimum pair bonus | log2(50)/log2(1000) * 15 ≈ 8 |
| 1000 pairs → full pair bonus | 15 points |
| Grade A: score >= 90 | |
| Grade B: score 75-89 | |
| Grade C: score 60-74 | |
| Grade D: score 40-59 | |
| Grade F: score < 40 | |
| Trainability insufficient: <50 pairs | |
| Trainability marginal: <200 pairs | |
| Trainability good: >=200 + good grade | |

---

### `src/tests/validate/report.test.ts` — NEW

**Module:** `src/validate/report.ts`  
**Requires:** Writing a temp JSONL file to validate against.

| Test | Assert |
|------|--------|
| Returns all sections | Result has structural, distribution, content, scoring |
| Reads valid JSONL correctly | totalPairs matches line count |
| totalTokens is sum of pair tokens | Sum matches |
| scoring.grade is set | One of A/B/C/D/F |
| Empty file → 0 pairs | Empty JSONL → totalPairs=0 |

---

## Tests to Expand on Existing Files

### `src/tests/cli.test.ts` — expand

| Test | Assert |
|------|--------|
| `validate` with no path exits 1 | exitCode 1 |
| `validate` with nonexistent file exits 1 | exitCode 1 |
| `validate` with non-jsonl file exits 1 | exitCode 1 |
| `generate --format completion` works | exitCode 0 |
| `generate --format fim` works | exitCode 0 |
| `generate --auto-balance` works | exitCode 0 |
| `generate --balance code:3,docs:1` works | exitCode 0 |
| `info` shows completion and fim | stdout includes both |
| `info` shows --auto-balance | stdout includes it |

### `src/tests/quality.test.ts` — expand

| Test | Assert |
|------|--------|
| Completion format: empty instruction OK if input present | `passesQuality(pair, completionConfig)` where instruction="" but input has code → true |
| Rejects auto-generated content | Input starts with "// DO NOT EDIT" → false |
| Code: max line > 1000 rejects | Single line > 1000 chars → false |
| Code: mean line > 100 rejects | All lines 120 chars → false |
| Code: alphanumeric < 0.25 rejects | Mostly symbols/whitespace → false |
| Non-code source skips code checks | docs pair with long lines → still passes |

---

## Constraints

1. **Zero runtime dependencies** — only `node:*` and project source
2. **No mocking libraries** — manual mocks, temp files, or dependency injection
3. **Windows-compatible** — `os.tmpdir()`, `path.join`, no hardcoded `/` in assertions
4. **No network calls** — don't clone repos in tests
5. **< 60s total** — small fixtures, no large repos
6. **Each file self-contained** — no shared mutable state between files
7. **Temp files cleaned up** — use `after()` hooks with `rm(dir, { recursive: true, force: true })`

---

## Fixture Repo

`src/tests/fixtures/sample-repo/` has:
- `package.json`
- `README.md` (with headings)
- `src/utils.ts` (4 functions + 1 class with JSDoc)
- `src/index.ts` (barrel)
- `tests/utils.test.ts`
- `docs/api.md`

For git-dependent tests, init the fixture in `before()`:
```typescript
execFileSync("git", ["init"], { cwd: FIXTURE });
execFileSync("git", ["add", "-A"], { cwd: FIXTURE });
execFileSync("git", ["-c", "user.email=t@t.com", "-c", "user.name=T", "commit", "-m", "init"], { cwd: FIXTURE });
```

Or create temp repos with `mkdtemp` for isolation.

---

## Running

```bash
npm run build
npm test
# or specific file:
node --test dist/tests/scope.test.js
```
