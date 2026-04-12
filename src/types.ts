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

// ── Visual corpus types ──

export interface AssetImageInfo {
  format: "png" | "jpeg" | "webp";
  width: number;
  height: number;
  bytes: number;
  valid: boolean;
  error?: string;
  base64?: string;
}

export interface AssetRecord {
  id: string;
  asset_path: string;
  status: "approved" | "rejected" | "borderline" | "wip" | "unknown";
  status_source: "record" | "folder" | "filename" | "inferred";
  lane: string | null;
  faction: string | null;
  view: string | null;
  tags: Record<string, string[]>;
  must_have: string[];
  must_not_have: string[];
  canon_explanation: string | null;
  failure_modes: string[];
  neighbors: string[];
  canon_assertions: CanonAssertion[];
  record_path: string | null;
  metadata_confidence: number;
  image?: AssetImageInfo;
}

export interface CanonAssertion {
  rule_id: string;
  rule_text?: string;
  verdict: "pass" | "fail" | "skip";
  reviewer: string;
}

export interface ComparisonRecord {
  id: string;
  asset_a_id: string;
  asset_b_id: string;
  asset_a_path: string;
  asset_b_path: string;
  chosen: "a" | "b" | "tie";
  source: "human" | "synthetic_status_pair" | "model";
  reasoning: string | null;
  criteria_scores: Record<string, { a: number; b: number }>;
  rubric_citations: Array<{ rule_id: string; verdict: string }>;
  reviewer: string | null;
  reviewed_at: string | null;
}

export interface VisualRepoInfo {
  path: string;
  name: string;
  structureTier: "perfect" | "structured" | "partial" | "messy";
  assets: AssetRecord[];
  comparisons: ComparisonRecord[];
  canonDocs: FileEntry[];
  rubricDocs: FileEntry[];
  yield: ExtractionYield;
}

export interface ExtractionYield {
  totalAssets: number;
  assetsWithRecords: number;
  assetsWithStatus: number;
  assetsInComparisons: number;
  assetsWithCanonLinks: number;
  orphanAssets: number;
  explicitComparisons: number;
  syntheticComparisons: number;
  recordCoverage: number;
  comparisonCoverage: number;
  wasteRate: number;
}

export type VisualExtractorName = "asset_record" | "comparison" | "constitution" | "set_coherence";

export type VisualSignalType =
  | "style_classification"
  | "style_critique"
  | "canon_explanation"
  | "pairwise_preference"
  | "canon_grounded_critique"
  | "set_coherence";

export type VisualOutputFormat =
  // Legacy (kept for backward compat)
  | "visual_universal" | "visual_dpo" | "visual_kto" | "visual_contrastive" | "visual_pointwise"
  // Framework-native formats (Phase 3)
  | "trl" | "axolotl" | "llava" | "llama_factory" | "qwen2vl";

export interface VisualPipelineConfig {
  repoPath: string;
  repoName: string;
  outputDir: string;
  format: VisualOutputFormat;
  extractors: VisualExtractorName[];
  generateSyntheticPairs: boolean;
  json: boolean;
  embed: boolean;
  allowIncomplete: boolean;
  copyImages: boolean;
}

// ── Binding integrity (Phase 3) ──

export interface BindingReport {
  has_image: boolean;
  has_canon: boolean;
  has_judgment: boolean;
  triangle_complete: boolean;
  critique_specificity?: number;
}

export interface VisualPipelineResult {
  structureTier: string;
  totalAssets: number;
  yield: ExtractionYield;
  classificationPairs: number;
  preferencePairs: number;
  critiquePairs: number;
  totalTrainingUnits: number;
  droppedIncomplete: number;
  triangleCompletionRate: number;
  imagesEmbedded: boolean;
  invalidImages: number;
  outputPath: string;
  manifestPath: string | null;
  imageDir: string | null;
  warnings: string[];
  trainability: "good" | "marginal" | "insufficient";
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
