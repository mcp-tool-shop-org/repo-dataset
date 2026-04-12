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

export interface ExtractedPair {
  instruction: string;
  input: string;
  output: string;
  metadata: PairMetadata;
}

export interface PairMetadata {
  source: "code" | "commits" | "docs" | "tests";
  file?: string;
  language?: string;
  commitSha?: string;
  tokens: number;
}

export interface PipelineConfig {
  repoPath: string;
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
}

export type OutputFormat = "alpaca" | "sharegpt" | "openai" | "raw";
export type ExtractorName = "code" | "commits" | "docs" | "tests";

export interface PipelineResult {
  totalFiles: number;
  filesProcessed: number;
  pairsExtracted: number;
  pairsAfterFilter: number;
  duplicatesRemoved: number;
  outputPath: string;
  totalTokens: number;
  byExtractor: Record<string, number>;
}

export interface ExtractionContext {
  repoPath: string;
  repoInfo: RepoInfo;
  config: PipelineConfig;
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
