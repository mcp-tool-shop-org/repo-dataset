/** Config/Schema extractor — extracts structured config files as dense training signal */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename, relative, extname } from "node:path";
import { createHash } from "node:crypto";
import { estimateTokens } from "../pipeline/tokens.js";
import type { Extractor, ExtractedPair, ExtractionContext, PairMetadata, ExtractorSubType } from "../types.js";

const EXTRACTOR_VERSION = "0.1.0";

/** Max config files per repo to avoid flooding the dataset */
const MAX_CONFIGS_PER_REPO = 50;

/** Max file size for config files (100KB) */
const MAX_CONFIG_SIZE = 100 * 1024;

// ── Well-known config filenames (exact match on basename) ──

const EXACT_CONFIG_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "Cargo.toml",
  "Makefile",
  "CMakeLists.txt",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "biome.json",
  "nginx.conf",
  ".env.example",
]);

// ── Glob-style prefix/suffix patterns ──

interface ConfigPattern {
  test: (name: string) => boolean;
}

const CONFIG_PATTERNS: ConfigPattern[] = [
  // jest.config.*, vitest.config.*
  { test: (n) => /^jest\.config\.\w+$/.test(n) },
  { test: (n) => /^vitest\.config\.\w+$/.test(n) },
  // .eslintrc.*, .prettierrc.*
  { test: (n) => /^\.eslintrc(\.\w+)?$/.test(n) },
  { test: (n) => /^\.prettierrc(\.\w+)?$/.test(n) },
  // webpack.config.*, vite.config.*, rollup.config.*
  { test: (n) => /^webpack\.config\.\w+$/.test(n) },
  { test: (n) => /^vite\.config\.\w+$/.test(n) },
  { test: (n) => /^rollup\.config\.\w+$/.test(n) },
];

// ── Purpose detection ──

interface ConfigPurpose {
  description: string;
  subType: ExtractorSubType;
}

const PURPOSE_MAP: Record<string, ConfigPurpose> = {
  "package.json":        { description: "Node.js project dependencies and scripts", subType: "config:package" },
  "tsconfig.json":       { description: "TypeScript compilation settings", subType: "config:build" },
  "Cargo.toml":          { description: "Rust project dependencies and build settings", subType: "config:package" },
  "Makefile":            { description: "build automation rules", subType: "config:build" },
  "CMakeLists.txt":      { description: "C/C++ build system configuration", subType: "config:build" },
  "pyproject.toml":      { description: "Python project metadata and build settings", subType: "config:package" },
  "setup.py":            { description: "Python package distribution settings", subType: "config:package" },
  "setup.cfg":           { description: "Python package distribution settings", subType: "config:package" },
  "requirements.txt":    { description: "Python dependency pinning", subType: "config:package" },
  "Dockerfile":          { description: "container image build instructions", subType: "config:container" },
  "docker-compose.yml":  { description: "multi-container Docker orchestration", subType: "config:container" },
  "docker-compose.yaml": { description: "multi-container Docker orchestration", subType: "config:container" },
  "biome.json":          { description: "Biome linter and formatter settings", subType: "config:lint" },
  "nginx.conf":          { description: "Nginx web server configuration", subType: "config:general" },
  ".env.example":        { description: "environment variable template", subType: "config:general" },
};

function detectPurpose(filename: string, relativePath: string): ConfigPurpose {
  // Exact filename match
  if (PURPOSE_MAP[filename]) return PURPOSE_MAP[filename];

  // GitHub Actions workflows
  if (relativePath.startsWith(".github/workflows/")) {
    return { description: "CI/CD pipeline", subType: "config:ci" };
  }

  // Pattern-based detection
  if (/^jest\.config\.\w+$/.test(filename))    return { description: "Jest test runner settings", subType: "config:build" };
  if (/^vitest\.config\.\w+$/.test(filename))  return { description: "Vitest test runner settings", subType: "config:build" };
  if (/^\.eslintrc/.test(filename))            return { description: "ESLint code linting rules", subType: "config:lint" };
  if (/^\.prettierrc/.test(filename))          return { description: "Prettier code formatting rules", subType: "config:lint" };
  if (/^webpack\.config\.\w+$/.test(filename)) return { description: "Webpack bundler configuration", subType: "config:build" };
  if (/^vite\.config\.\w+$/.test(filename))    return { description: "Vite build tool configuration", subType: "config:build" };
  if (/^rollup\.config\.\w+$/.test(filename))  return { description: "Rollup bundler configuration", subType: "config:build" };

  return { description: "project configuration", subType: "config:general" };
}

function isConfigFile(name: string, relativePath: string): boolean {
  if (EXACT_CONFIG_FILES.has(name)) return true;
  if (relativePath.startsWith(".github/workflows/") && /\.ya?ml$/.test(name)) return true;
  return CONFIG_PATTERNS.some((p) => p.test(name));
}

function detectLanguage(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".json": "json",
    ".toml": "toml",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".py": "python",
    ".cfg": "ini",
    ".txt": "text",
    ".conf": "nginx",
    ".js": "javascript",
    ".ts": "typescript",
    ".mjs": "javascript",
    ".cjs": "javascript",
  };
  if (filename === "Dockerfile") return "dockerfile";
  if (filename === "Makefile") return "makefile";
  if (filename === "CMakeLists.txt") return "cmake";
  return map[ext] || "text";
}

// ── Quality scoring ──

function scoreConfigQuality(content: string, tokens: number, filename: string): number {
  let score = 0.3; // baseline

  // Healthy token range for config (not trivially small, not huge)
  if (tokens >= 20 && tokens <= 500) score += 0.2;
  else if (tokens >= 10 && tokens <= 1000) score += 0.1;

  // Well-known high-value configs get a boost
  const highValue = new Set(["package.json", "tsconfig.json", "Cargo.toml", "pyproject.toml", "Dockerfile"]);
  if (highValue.has(filename)) score += 0.15;

  // Has meaningful structure (not just a list of names)
  const lines = content.split("\n").length;
  if (lines >= 5 && lines <= 200) score += 0.1;

  // Has comments (documentation within config)
  if (/^\s*(#|\/\/|;)/m.test(content)) score += 0.1;

  // Is not mostly empty lines
  const nonEmpty = content.split("\n").filter((l) => l.trim()).length;
  if (nonEmpty / Math.max(lines, 1) > 0.5) score += 0.1;

  return Math.min(score, 1.0);
}

// ── Filesystem walker (scoped to config files) ──

const ALWAYS_SKIP = new Set([".git", ".hg", ".svn", ".DS_Store", "node_modules"]);

interface ConfigFileEntry {
  path: string;
  relativePath: string;
  size: number;
}

async function findConfigFiles(repoPath: string): Promise<ConfigFileEntry[]> {
  const found: ConfigFileEntry[] = [];

  async function walk(dirPath: string): Promise<void> {
    if (found.length >= MAX_CONFIGS_PER_REPO) return;

    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (found.length >= MAX_CONFIGS_PER_REPO) return;

      const fullPath = join(dirPath, entry.name);
      const relPath = relative(repoPath, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        if (ALWAYS_SKIP.has(entry.name)) continue;
        await walk(fullPath);
      } else if (entry.isFile() && isConfigFile(entry.name, relPath)) {
        let fileSize = 0;
        try {
          const st = await stat(fullPath);
          fileSize = st.size;
        } catch {
          continue;
        }
        if (fileSize > MAX_CONFIG_SIZE) continue;
        if (fileSize === 0) continue;

        found.push({ path: fullPath, relativePath: relPath, size: fileSize });
      }
    }
  }

  await walk(repoPath);
  return found;
}

// ── Extractor ──

export class ConfigExtractor implements Extractor {
  name = "config" as const;
  description = "Extracts structured config files as high-value training signal for config generation and explanation";

  async *extract(ctx: ExtractionContext): AsyncIterable<ExtractedPair> {
    const configFiles = await findConfigFiles(ctx.repoPath);

    for (const file of configFiles) {
      let content: string;
      try {
        content = await readFile(file.path, "utf-8");
      } catch {
        continue;
      }

      if (!content.trim()) continue;

      // Skip binary content
      const probe = content.slice(0, 8192);
      if (probe.includes("\0")) continue;

      const tokens = estimateTokens(content);
      if (tokens < ctx.config.minTokens || tokens > ctx.config.maxTokens) continue;

      const filename = basename(file.relativePath);
      const purpose = detectPurpose(filename, file.relativePath);
      const language = detectLanguage(filename);
      const qualityScore = scoreConfigQuality(content, tokens, filename);

      const id = createHash("sha256")
        .update(`config:${file.relativePath}`)
        .digest("hex").slice(0, 16);

      const meta: PairMetadata = {
        id,
        source: "config",
        repo_name: ctx.repoName,
        file: file.relativePath,
        language,
        commit_sha: ctx.headSha,
        line_start: 1,
        line_end: content.split("\n").length,
        extractor_type: purpose.subType,
        extractor_version: EXTRACTOR_VERSION,
        extracted_at: new Date().toISOString(),
        tokens,
        char_count: content.length,
        has_docstring: false,
        has_tests: false,
        complexity: "low",
        quality_score: qualityScore,
        signal_type: "config",
      };

      yield {
        instruction: `What does this ${filename} configure?`,
        input: content,
        output: `This ${filename} configures ${purpose.description}.`,
        metadata: meta,
      };
    }
  }
}
