# Test Specification — @mcptoolshop/repo-dataset (Phase 2A)

## Overview

This is the test spec for `@mcptoolshop/repo-dataset` after the Phase 2A upgrade. The schema changed significantly — this spec supersedes any previous test spec.

**Stack:** TypeScript, ESM (`"type": "module"`), Node 20+  
**Test runner:** `node --test` (built-in)  
**Assertions:** `node:assert/strict`  
**Build:** `npx tsc` then `node --test dist/tests/**/*.test.js`  
**Repo:** `F:/AI/repo-dataset`

---

## Critical Schema Changes (Phase 2A)

### PairMetadata expanded from 5 fields to 18

Old (Phase 1):
```typescript
{ source, file, language, commitSha, tokens }
```

New (Phase 2A):
```typescript
{
  id: string;                    // content hash
  source: ExtractorName;         // "code" | "commits" | "docs" | "tests"
  repo_name: string;
  file: string | null;
  language: string | null;
  commit_sha: string | null;     // was "commitSha"
  line_start: number | null;
  line_end: number | null;
  extractor_type: ExtractorSubType;  // e.g. "code:function", "docs:section"
  extractor_version: string;
  extracted_at: string;          // ISO 8601
  tokens: number;
  char_count: number;
  has_docstring: boolean;
  has_tests: boolean;
  complexity: "low" | "medium" | "high";
  quality_score: number;         // 0.0 - 1.0
  signal_type: SignalType;
}
```

### PipelineConfig new required fields

```typescript
{
  repoPath: string;
  repoName: string;            // NEW
  outputDir: string;
  format: OutputFormat;         // NOW includes "completion" | "fim"
  extractors: ExtractorName[];
  maxTokens: number;
  minTokens: number;
  maxCommits: number;
  include: string[];
  exclude: string[];
  pipeToBackpropagate: boolean;
  json: boolean;
  balance: BalanceConfig | null;  // NEW
  fimRate: number;               // NEW (default 0.5)
  fimSpmRate: number;            // NEW (default 0.5)
}
```

### ExtractionContext new required fields

```typescript
{
  repoPath: string;
  repoName: string;            // NEW
  repoInfo: RepoInfo;
  config: PipelineConfig;
  headSha: string | null;      // NEW
}
```

### PipelineResult changed

```typescript
{
  totalFiles: number;
  filesProcessed: number;
  pairsExtracted: number;
  pairsAfterFilter: number;
  pairsAfterBalance: number;     // NEW (was absent)
  duplicatesRemoved: number;
  outputPath: string;
  manifestPath: string | null;   // NEW
  totalTokens: number;
  byExtractor: Record<string, SourceStats>;  // CHANGED: was Record<string, number>
  warnings: string[];            // NEW
  trainability: "good" | "marginal" | "insufficient";  // NEW
}
```

### SourceStats (new)

```typescript
{ pairs: number; tokens: number; pct: number; avgQuality: number; }
```

### OutputFormat now includes

`"alpaca" | "sharegpt" | "openai" | "raw" | "completion" | "fim"`

---

## Helper Patterns for All Test Files

### Making a valid PipelineConfig

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

### Making a valid ExtractionContext

```typescript
function makeCtx(
  repoPath: string,
  repoInfo: RepoInfo,
  config: PipelineConfig
): ExtractionContext {
  return { repoPath, repoName: config.repoName, repoInfo, config, headSha: null };
}
```

### Making a valid ExtractedPair (for unit tests)

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

### Collecting pairs from an async generator

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

## Module-by-Module Test Specs

### 1. `src/pipeline/tokens.ts`

Export: `estimateTokens(text: string): number`

| Test | Assert |
|------|--------|
| Empty string → 0 | `estimateTokens("") === 0` |
| Rounds up | `estimateTokens("abc") === 1` |
| Exact multiple | `estimateTokens("a".repeat(100)) === 25` |
| Standard text | `estimateTokens("hello") === 2` |

---

### 2. `src/discovery/filters.ts`

Exports: `isBinary`, `isVendored`, `isGenerated`, `shouldInclude`

Already well-tested. No schema changes affect this module.

---

### 3. `src/discovery/languages.ts`

Exports: `detectLanguage`, `isSourceFile`, `isDocFile`

Already well-tested. No schema changes.

---

### 4. `src/pipeline/dedup.ts`

Export: `Deduplicator` class with `isDuplicate(pair: ExtractedPair): boolean`

Uses `pair.metadata.id` as the hash key now (not content hash of instruction+input+output).

| Test | Assert |
|------|--------|
| First occurrence passes | `isDuplicate(pair) === false` |
| Same id = duplicate | Second call with same pair → `true` |
| Different id = not duplicate | Two pairs with different `.metadata.id` → both `false` |
| Count tracks unique entries | After 3 unique pairs, `.count === 3` |

---

### 5. `src/pipeline/quality.ts`

Export: `passesQuality(pair: ExtractedPair, config: PipelineConfig): boolean`

**Key behavioral change:** For `completion` and `fim` formats, empty `instruction` is allowed (code IS the signal in `.input`). The function checks that at least `input` or `output` is non-empty for those formats.

| Test | Assert |
|------|--------|
| Valid pair passes | Long enough content, all fields → `true` |
| Empty instruction+input rejects (alpaca format) | `passesQuality(emptyInstructionPair, alpacaConfig) === false` |
| Empty instruction OK in completion format | `passesQuality(completionPair, completionConfig) === true` (as long as input is set) |
| Below minTokens rejects | Short content → `false` |
| Above maxTokens rejects | Huge content → `false` |
| Excessive repetition rejects | 20 identical lines → `false` |
| Auto-generated content rejects | Text starting with "// DO NOT EDIT" → `false` |
| Code: max line >1000 rejects | Line with 1001 chars → `false` |
| Code: mean line >100 rejects | Many long lines → `false` |
| Code: alphanumeric ratio <0.25 rejects | Mostly symbols → `false` |
| Non-code: skips code quality checks | docs pair with long lines → still passes |

---

### 6. `src/formatters/alpaca.ts`

| Test | Assert |
|------|--------|
| Produces `{instruction, input, output}` | JSON.parse(line) has those 3 keys |
| Values match pair fields | `parsed.instruction === pair.instruction` |

---

### 7. `src/formatters/sharegpt.ts`

| Test | Assert |
|------|--------|
| Produces `{conversations: [{from, value}]}` | Array of 2 entries |
| First entry is human | `conversations[0].from === "human"` |
| Second entry is gpt | `conversations[1].from === "gpt"` |

---

### 8. `src/formatters/openai.ts`

| Test | Assert |
|------|--------|
| Produces `{messages: [{role, content}]}` | Array of 2 |
| Roles are user/assistant | Check `.role` values |

---

### 9. `src/formatters/raw.ts`

| Test | Assert |
|------|--------|
| Produces `{text, metadata}` | Both keys present |
| Text contains all non-empty fields | Concatenation of instruction+input+output |
| Metadata matches pair.metadata | `parsed.metadata.source === pair.metadata.source` |

---

### 10. `src/formatters/completion.ts` (NEW)

| Test | Assert |
|------|--------|
| Implementation signal: uses `input` as text | Pair with `signal_type: "implementation"` → `parsed.text === pair.input` |
| Non-code signal: concatenates all fields | Pair with `signal_type: "documentation"` → text contains instruction+input+output |
| Includes metadata | `parsed.metadata` exists and has `source` field |
| Empty instruction is fine | No crash when instruction is `""` |

---

### 11. `src/formatters/fim.ts` (NEW)

| Test | Assert |
|------|--------|
| Produces `{text, metadata}` | Both keys present |
| FIM tokens appear at configured rate | With `fimRate=1.0`, ALL outputs have `<fim_prefix>` |
| No FIM tokens at rate 0 | With `fimRate=0`, NO outputs have `<fim_prefix>` |
| PSM format has prefix-suffix-middle order | When `spmRate=0`, text matches `<fim_prefix>...<fim_suffix>...<fim_middle>...` |
| SPM format has suffix first | When `spmRate=1.0`, text starts with `<fim_prefix><fim_suffix>` |
| Short code (<3 lines) is not FIM-transformed | 2-line input → no FIM tokens even at rate 1.0 |
| Seeded PRNG is deterministic | Same seed → same output |
| Different seeds → different output | Two formatters with different seeds produce different splits |

---

### 12. `src/formatters/registry.ts`

| Test | Assert |
|------|--------|
| `getFormatter("alpaca")` returns AlpacaFormatter | `.name === "alpaca"` |
| `getFormatter("completion")` returns CompletionFormatter | `.name === "completion"` |
| `getFormatter("fim")` returns FimFormatter | `.name === "fim"` |
| `isValidFormat("completion")` → true | |
| `isValidFormat("fim")` → true | |
| `isValidFormat("invalid")` → false | |
| `getAllFormats()` returns 6 items | Length 6, includes "completion" and "fim" |

---

### 13. `src/pipeline/balance.ts` (NEW)

Exports: `applyBalance(pairs, config)`, `getAutoBalanceConfig()`, `assessTrainability()`

| Test | Assert |
|------|--------|
| `getAutoBalanceConfig()` returns code:3,tests:2,commits:1,docs:1 | Check `.ratios` |
| Balance reduces dominant source | 100 docs + 10 code → docs count drops |
| Balance preserves small sources fully | 10 code pairs, ratio 3 → all 10 kept |
| Sorts by quality_score when trimming | Top-N by score are kept, not random |
| Hard cap (`maxPairs`) is respected | `maxPairs: {docs: 5}` → at most 5 docs |
| `minPairs` generates warning when unmet | `minPairs: {code: 50}` with only 10 → warning |
| Before/after stats computed correctly | `result.before.docs.pairs === 100`, `result.after.docs.pairs < 100` |
| Trainability: <50 pairs → "insufficient" | 30 pairs → `trainability === "insufficient"` |
| Trainability: 50-199 → "marginal" | 100 pairs → `trainability === "marginal"` |
| Trainability: >=200 balanced → "good" | 250 pairs, no dominance → `"good"` |
| Trainability: >80% single source → "marginal" | 300 pairs, 90% docs → `"marginal"` |
| Pct values sum to ~100 | Sum of all `after[*].pct` ≈ 100 (rounding ok) |

**Test data factory for balance tests:**
```typescript
function makePairs(source: ExtractorName, count: number, quality = 0.5): ExtractedPair[] {
  return Array.from({ length: count }, (_, i) => ({
    instruction: `inst-${source}-${i}`,
    input: `input-${source}-${i}`,
    output: `output-${source}-${i}`,
    metadata: {
      id: `${source}-${i}`,
      source,
      repo_name: "test/repo",
      file: null,
      language: null,
      commit_sha: null,
      line_start: null,
      line_end: null,
      extractor_type: `${source}:function` as any,
      extractor_version: "0.2.0",
      extracted_at: new Date().toISOString(),
      tokens: 50,
      char_count: 200,
      has_docstring: false,
      has_tests: false,
      complexity: "low" as const,
      quality_score: quality + (i * 0.001), // slight variance for sort testing
      signal_type: "explanation" as const,
    },
  }));
}
```

---

### 14. `src/extractors/code.ts`

**Key behavioral change:** In `completion`/`fim` format mode, emits raw code (no instruction wrapping). In `alpaca`/`sharegpt`/`openai` mode, emits explanation pairs.

| Test | Assert |
|------|--------|
| Extracts functions from TypeScript | Fixture `utils.ts` → yields pairs |
| Completion mode: emits raw code in `.input` | `format: "completion"` → `pair.instruction === ""`, `pair.input` contains code |
| Completion mode: includes imports | `pair.input` starts with import block |
| Instruction mode: generates explanation | `format: "alpaca"` → `pair.instruction` contains "Explain" |
| Extracts docstrings as output | Function with JSDoc → `pair.output` contains docstring text |
| Sets `extractor_type` to "code:function" | For function extractions |
| Sets `extractor_type` to "code:class" | For class extractions |
| Sets `extractor_type` to "code:file" | For file-level extractions |
| Sets `line_start` and `line_end` | Non-null, `line_start < line_end` |
| `quality_score` is between 0 and 1 | For all pairs |
| `quality_score` higher for docstring functions | Compare pair with/without docstring |
| Skips functions below minTokens | `minTokens: 500` → short functions excluded |
| Skips functions above maxTokens | `maxTokens: 10` → all excluded |
| `signal_type` is "implementation" in completion mode | |
| `signal_type` is "explanation" in instruction mode | |
| Handles empty files gracefully | Empty file → no pairs, no error |
| File-level pairs emitted in completion mode | Whole file as single pair when within bounds |
| `complexity` field is set | One of "low", "medium", "high" |

---

### 15. `src/extractors/commits.ts`

| Test | Assert |
|------|--------|
| Extracts pairs from commit history | Repo with commits → pairs with `source: "commits"` |
| Skips merge commits | "Merge branch..." message → not in output |
| Skips trivial short messages | Message < 10 chars → not in output |
| Generates "explain" pair | `extractor_type === "commits:explain"` |
| Generates "implement" pair for small diffs | `extractor_type === "commits:implement"` |
| Respects maxCommits config | `maxCommits: 1` → at most 2 pairs (explain+implement) |
| Sets `commit_sha` in metadata | Non-null, >= 7 chars |
| `signal_type` is "change_explanation" or "change_implementation" | |
| `quality_score` is between 0 and 1 | |
| Handles repos with no commits | Empty repo → 0 pairs |

---

### 16. `src/extractors/docs.ts`

| Test | Assert |
|------|--------|
| Extracts sections from markdown | README with headings → pairs |
| Uses heading as instruction | Instruction contains the heading text |
| Sets `extractor_type` to "docs:section" | |
| Sets `line_start`/`line_end` | Non-null for all pairs |
| `signal_type` is "documentation" | |
| `quality_score` higher for sections with code blocks | Compare section with ``` vs without |
| Boilerplate headings get lower quality | "License" section vs "API" section |
| Skips empty sections | Heading with no body → not in output |
| Skips sections below minTokens | Short section → filtered |
| Handles multiple doc files | Both README.md and docs/api.md produce pairs |

---

### 17. `src/extractors/tests.ts`

| Test | Assert |
|------|--------|
| Pairs test file with source file | `tests/utils.test.ts` ↔ `src/utils.ts` |
| Generates "write tests" pair | `extractor_type === "tests:write"` |
| Generates reverse pair | `extractor_type === "tests:reverse"` |
| `signal_type` is "test_generation" for write | |
| `signal_type` is "implementation" for reverse | |
| `has_tests` is true | On test extractor pairs |
| `quality_score` higher with more test cases | More `it()/test()` calls → higher score |
| No pair when source file not found | Orphan test file → nothing |
| Skips pairs exceeding maxTokens | Large files combined → filtered |

---

### 18. `src/extractors/registry.ts`

| Test | Assert |
|------|--------|
| `getExtractors(["code"])` returns 1 extractor | `.length === 1`, `.name === "code"` |
| `getExtractors(["code","docs","tests"])` returns 3 | Correct count |
| `getAllExtractorNames()` returns 4 | `["code","commits","docs","tests"]` |
| `isValidExtractor("code")` → true | |
| `isValidExtractor("bogus")` → false | |

---

### 19. `src/pipeline/runner.ts` (integration)

Exports: `runPipeline(config)`, `inspectPipeline(config)`

| Test | Assert |
|------|--------|
| `runPipeline` creates output JSONL file | File exists at `result.outputPath` |
| `runPipeline` creates `_manifest.json` | File exists at `result.manifestPath` |
| Manifest has correct schema | Parse it, check `schema_version === "2"` |
| Manifest `stats.total_pairs` matches result | `manifest.stats.total_pairs === result.pairsAfterBalance` |
| Output JSONL: every line is valid JSON | Parse each line |
| Alpaca format: lines have instruction/input/output | Check keys |
| Completion format: lines have text/metadata | Check keys |
| `inspectPipeline` does NOT write files | No file at outputDir |
| `inspectPipeline` returns stats | `result.pairsAfterFilter > 0` |
| `byExtractor` values are SourceStats | Each has `.pairs`, `.tokens`, `.pct`, `.avgQuality` |
| Sum of `byExtractor[*].pairs` equals `pairsAfterBalance` | |
| Balance applied when config.balance is set | fewer total pairs than without |
| Warnings array populated for docs-heavy repos | Contains "dominance" |
| `trainability` field is set | One of the 3 values |
| Creates outputDir if missing | Non-existent dir → created |
| Handles repos with no source files | Only docs → still works |

---

### 20. `src/discovery/git.ts`

Exports: `isGitRepo`, `gitLog`, `gitDiff`, `getHeadSha`, `gitClone`

| Test | Assert |
|------|--------|
| `isGitRepo` true for git repo | Init a temp dir → `true` |
| `isGitRepo` false for non-git dir | `/tmp/random` → `false` |
| `getHeadSha` returns sha for repo with commits | Non-null, 40 hex chars |
| `getHeadSha` returns null for no-commit repo | `null` |
| `gitLog` returns empty for no-commit repo | `[]` |
| `gitLog` returns CommitInfo array | Has `sha`, `message`, `author`, `date` |
| `gitLog` respects count | Count 1 → length <= 1 |
| `gitDiff` returns patch text | Contains `+` or `diff --git` |
| `gitDiff` returns "" for invalid sha | Empty string |

---

### 21. `src/discovery/scanner.ts`

Export: `scanRepo(repoPath, include, exclude) → Promise<RepoInfo>`

| Test | Assert |
|------|--------|
| Finds all files in fixture | `fileCount >= 5` |
| Classifies source files | `sourceFiles` contains `.ts` files |
| Classifies doc files | `docFiles` contains `.md` files |
| Classifies test files | `testFiles` contains `tests/utils.test.ts` |
| Computes language stats | `languages` has typescript entry |
| Respects include filter | `include: ["src/**"]` → only src files |
| Respects exclude filter | `exclude: ["docs/**"]` → no docs from docs/ |
| Skips hidden directories | `.hidden/` not scanned |
| Returns repo name | `repoInfo.name === basename(path)` |

---

### 22. `src/pipeline/chunker.ts`

Export: `chunkText(text, maxTokens, overlapLines?) → Chunk[]`

| Test | Assert |
|------|--------|
| Short text → single chunk | `chunks.length === 1` |
| Long text splits | `chunks.length > 1` |
| Respects maxTokens | Every `chunk.tokens <= maxTokens` |
| Has correct line numbers | `startLine` and `endLine` are reasonable |
| Empty text → empty array | `[]` |

---

### 23. `src/errors.ts`

| Test | Assert |
|------|--------|
| Error has code, message, hint | All three set in constructor |
| `toJSON()` returns `{code, message, hint}` | |
| Extends Error | `instanceof Error === true` |
| `.name === "RepoDatasetError"` | |

---

### 24. CLI tests (`src/cli.ts`)

Run via `execFileSync("node", [CLI_PATH, ...args])`.

| Test | Assert |
|------|--------|
| `help` exits 0, shows commands | stdout includes "generate", "inspect", "info" |
| `--version` shows version | stdout includes "repo-dataset" |
| `info` shows all formats including completion/fim | stdout includes "completion", "fim" |
| `info` shows balance flags | stdout includes "--auto-balance" |
| Unknown command exits 1 | exitCode 1 |
| `generate` with no path exits 1 | exitCode 1 |
| `generate` with invalid path exits 1 | exitCode 1 |
| `generate --format invalid` exits 1 | Error contains INVALID_FORMAT |
| `generate --extractors bogus` exits 1 | Error contains INVALID_EXTRACTOR |
| `generate --json` outputs valid JSON | `JSON.parse(stdout)` has `pairsAfterBalance` |
| `generate --format completion` works | exitCode 0, output file has `text` field |
| `generate --auto-balance` works | exitCode 0 |
| `inspect --json` outputs valid JSON | Has `byExtractor`, `trainability`, `warnings` |

---

## Fixture

`src/tests/fixtures/sample-repo/` contains:
- `package.json`
- `README.md` (with headings: Installation, Usage, API)
- `src/utils.ts` (4 functions + 1 class with JSDoc)
- `src/index.ts` (barrel re-export)
- `tests/utils.test.ts` (test file pairing with utils.ts)
- `docs/api.md` (API reference with headings)

**For git-dependent tests:** Initialize the fixture as a git repo in `before()`:
```typescript
execFileSync("git", ["init"], { cwd: FIXTURE });
execFileSync("git", ["add", "-A"], { cwd: FIXTURE });
execFileSync("git", ["-c", "user.email=t@t.com", "-c", "user.name=T", "commit", "-m", "init"], { cwd: FIXTURE });
```

Or create temp repos with `mkdtemp` for isolation.

---

## Constraints

1. **Zero runtime dependencies** — only `node:*` and project source
2. **No mocking libraries** — manual mocks only
3. **Windows-compatible** — `os.tmpdir()`, `path.join`, forward slashes in assertions
4. **No network calls** — mock `gitClone`, don't hit GitHub
5. **< 60s total** — small fixtures, no large repos
6. **Each file self-contained** — no shared mutable state between files
