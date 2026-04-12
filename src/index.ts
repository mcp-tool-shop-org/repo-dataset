/** @mcptoolshop/repo-dataset — library exports */

export type {
  RepoInfo,
  LanguageStats,
  FileEntry,
  CommitInfo,
  ExtractedPair,
  PairMetadata,
  PipelineConfig,
  PipelineResult,
  ExtractionContext,
  Extractor,
  Formatter,
  OutputFormat,
  ExtractorName,
} from "./types.js";

export { runPipeline, inspectPipeline } from "./pipeline/runner.js";
export { scanRepo } from "./discovery/scanner.js";
export { getExtractors, getAllExtractorNames } from "./extractors/registry.js";
export { getFormatter, getAllFormats } from "./formatters/registry.js";
export { estimateTokens } from "./pipeline/tokens.js";
export { RepoDatasetError, ErrorCodes } from "./errors.js";
