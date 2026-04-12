/** Core domain types for repo-dataset */

export interface RepoInfo {
  path: string;
  name: string;
  languages: LanguageStats[];
  fileCount: number;
  sourceFiles: FileEntry[];
  docFiles: FileEntry[];
  testFiles: FileEntry[];
}

export interface LanguageStats {
  language: string;
  fileCount: number;
  percentage: number;
}

export interface FileEntry {
  path: string;
  relativePath: string;
  language: string;
  size: number;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  files: string[];
  diff: string;
}

// ── Signal classification ──

export type SignalType =
  | "implementation"        // raw code for LM/completion training
  | "completion"            // code for FIM training
  | "explanation"           // natural language explaining code
  | "test_generation"       // code → test pairs
  | "change_explanation"    // commit → description
  | "change_implementation" // description → commit
  | "documentation";        // docs sections

export type ExtractorSubType =
  | "code:function"
  | "code:class"
  | "code:method"
  | "code:file"
  | "docs:section"
  | "commits:explain"
  | "commits:implement"
  | "tests:write"
  | "tests:reverse";

// ── Provenance metadata (18 fields) ──

export interface PairMetadata {
  // Tier 1: Identity
  id: string;
  source: ExtractorName;
  repo_name: string;
  file: string | null;
  language: string | null;

  // Tier 2: Reproducibility
  commit_sha: string | null;
  line_start: number | null;
  line_end: number | null;
  extractor_type: ExtractorSubType;
  extractor_version: string;
  extracted_at: string;

  // Tier 3: Quality signals
  tokens: number;
  char_count: number;
  has_docstring: boolean;
  has_tests: boolean;
  complexity: "low" | "medium" | "high";
  quality_score: number;
  signal_type: SignalType;
}

export interface ExtractedPair {
  instruction: string;
  input: string;
  output: string;
  metadata: PairMetadata;
}

// ── Pipeline config ──

export interface PipelineConfig {
  repoPath: string;
  repoName: string;
  outputDir: string;
  format: OutputFormat;
  extractors: ExtractorName[];
  maxTokens: number;
  minTokens: number;
  maxCommits: number;
  include: string[];
  exclude: string[];
  pipeToBackpropagate: boolean;
  json: boolean;
  balance: BalanceConfig | null;
  fimRate: number;
  fimSpmRate: number;
}

export interface BalanceConfig {
  ratios: Partial<Record<ExtractorName, number>>;
  maxPairs: Partial<Record<ExtractorName, number>>;
  minPairs: Partial<Record<ExtractorName, number>>;
}

export type OutputFormat = "alpaca" | "sharegpt" | "openai" | "raw" | "completion" | "fim";
export type ExtractorName = "code" | "commits" | "docs" | "tests";

// ── Pipeline results ──

export interface SourceStats {
  pairs: number;
  tokens: number;
  pct: number;
  avgQuality: number;
}

export interface PipelineResult {
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

export interface ExtractionContext {
  repoPath: string;
  repoName: string;
  repoInfo: RepoInfo;
  config: PipelineConfig;
  headSha: string | null;
}

export interface Extractor {
  name: ExtractorName;
  description: string;
  extract(ctx: ExtractionContext): AsyncIterable<ExtractedPair>;
}

export interface Formatter {
  name: string;
  formatPair(pair: ExtractedPair): string;
}

// ── Manifest ──

export interface DatasetManifest {
  schema_version: string;
  tool_version: string;
  created_at: string;
  source_repo: { name: string; commit_sha: string | null; path: string };
  extractors_used: ExtractorName[];
  format: OutputFormat;
  balance_config: BalanceConfig | null;
  filters_applied: { min_tokens: number; max_tokens: number; dedup: string };
  stats: {
    total_pairs: number;
    total_tokens: number;
    by_source: Record<string, number>;
    by_signal_type: Record<string, number>;
  };
}
