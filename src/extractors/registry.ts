/** Extractor registry — maps names to instances */

import { CodeExtractor } from "./code.js";
import { CommitExtractor } from "./commits.js";
import { DocsExtractor } from "./docs.js";
import { TestExtractor } from "./tests.js";
import { ConfigExtractor } from "./config.js";
import type { Extractor, ExtractorName } from "../types.js";

const EXTRACTORS: Record<ExtractorName, () => Extractor> = {
  code: () => new CodeExtractor(),
  commits: () => new CommitExtractor(),
  docs: () => new DocsExtractor(),
  tests: () => new TestExtractor(),
  config: () => new ConfigExtractor(),
};

export function getExtractors(names: ExtractorName[]): Extractor[] {
  return names.map((name) => EXTRACTORS[name]());
}

export function getAllExtractorNames(): ExtractorName[] {
  return Object.keys(EXTRACTORS) as ExtractorName[];
}

export function isValidExtractor(name: string): name is ExtractorName {
  return name in EXTRACTORS;
}
