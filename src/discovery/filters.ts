/** Binary, vendor, and generated file filters */

import { basename, extname } from "node:path";

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp",
  ".mp3", ".mp4", ".wav", ".ogg", ".webm", ".flac",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".exe", ".dll", ".so", ".dylib", ".o", ".obj",
  ".wasm", ".pyc", ".class",
  ".db", ".sqlite", ".sqlite3",
]);

const VENDOR_PATTERNS = [
  "node_modules/",
  "vendor/",
  ".venv/",
  "venv/",
  "__pycache__/",
  ".git/",
  ".hg/",
  ".svn/",
  "bower_components/",
  "target/debug/",
  "target/release/",
  ".gradle/",
  "build/",
  "dist/",
  ".next/",
  ".nuxt/",
  ".output/",
  "coverage/",
  ".nyc_output/",
];

const GENERATED_PATTERNS = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "composer.lock",
  ".min.js",
  ".min.css",
  ".bundle.js",
  ".chunk.js",
  ".generated.",
  "auto-generated",
];

const LOCK_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "composer.lock",
  "go.sum",
]);

export function isBinary(relativePath: string): boolean {
  const ext = extname(relativePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export function isVendored(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return VENDOR_PATTERNS.some((p) => normalized.includes(p));
}

export function isGenerated(relativePath: string): boolean {
  const name = basename(relativePath);
  if (LOCK_FILES.has(name)) return true;
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  return GENERATED_PATTERNS.some((p) => normalized.includes(p));
}

export function shouldInclude(
  relativePath: string,
  include: string[],
  exclude: string[]
): boolean {
  if (isBinary(relativePath)) return false;
  if (isVendored(relativePath)) return false;
  if (isGenerated(relativePath)) return false;

  const normalized = relativePath.replace(/\\/g, "/");

  if (exclude.length > 0) {
    for (const pattern of exclude) {
      if (matchGlob(normalized, pattern)) return false;
    }
  }

  if (include.length > 0) {
    return include.some((pattern) => matchGlob(normalized, pattern));
  }

  return true;
}

/** Simple glob matching — supports * and ** */
function matchGlob(path: string, pattern: string): boolean {
  // Convert glob to regex
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{DOUBLESTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{DOUBLESTAR\}\}/g, ".*");
  return new RegExp(`^${regex}$`).test(path) ||
    new RegExp(`(^|/)${regex}($|/)`).test(path);
}
