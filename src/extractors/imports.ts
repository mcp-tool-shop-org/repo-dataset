/** Import graph parser — extracts project-internal imports from test files */

import { readFile } from "node:fs/promises";
import { dirname, join, resolve, relative, basename, extname } from "node:path";
import type { FileEntry } from "../types.js";

export interface ParsedImport {
  raw: string;         // original import path/module
  resolved: string | null;  // resolved to relative file path (if project-internal)
  isProjectInternal: boolean;
}

/**
 * Parse imports from a file and resolve them to project-internal paths.
 */
export async function parseFileImports(
  filePath: string,
  language: string,
  projectRoot: string
): Promise<ParsedImport[]> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return [];
  }

  const rawImports = extractRawImports(content, language);
  return rawImports.map((raw) => resolveImport(raw, filePath, language, projectRoot));
}

/**
 * Given parsed imports, find which source files they reference.
 */
export function matchImportsToSources(
  imports: ParsedImport[],
  sourceFiles: FileEntry[]
): FileEntry[] {
  const matched: FileEntry[] = [];

  for (const imp of imports) {
    if (!imp.isProjectInternal || !imp.resolved) continue;

    // Try exact match
    const exact = sourceFiles.find((sf) => sf.relativePath === imp.resolved);
    if (exact) { matched.push(exact); continue; }

    // Try with common extensions
    for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".rs", ".go"]) {
      const withExt = sourceFiles.find((sf) => sf.relativePath === imp.resolved + ext);
      if (withExt) { matched.push(withExt); break; }
    }

    // Try as index file
    const asIndex = sourceFiles.find((sf) =>
      sf.relativePath === imp.resolved + "/index.ts" ||
      sf.relativePath === imp.resolved + "/index.js" ||
      sf.relativePath === imp.resolved + "/mod.rs"
    );
    if (asIndex) matched.push(asIndex);
  }

  return matched;
}

// ── Raw import extraction ──

function extractRawImports(content: string, language: string): string[] {
  const imports: string[] = [];

  switch (language) {
    case "typescript":
    case "javascript": {
      // import ... from 'path'
      const esm = content.matchAll(/(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"])/g);
      for (const m of esm) imports.push(m[1] || m[2]);
      // require('path')
      const cjs = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
      for (const m of cjs) imports.push(m[1]);
      break;
    }
    case "python": {
      // from package.module import ...
      const fromImports = content.matchAll(/^from\s+([\w.]+)\s+import/gm);
      for (const m of fromImports) imports.push(m[1]);
      // import package.module
      const directImports = content.matchAll(/^import\s+([\w.]+)/gm);
      for (const m of directImports) imports.push(m[1]);
      break;
    }
    case "rust": {
      // use crate::module::submod
      const uses = content.matchAll(/^use\s+((?:crate|super|self)::[\w:]+|[\w]+::[\w:]+)/gm);
      for (const m of uses) imports.push(m[1]);
      break;
    }
    case "go": {
      // import "path" or grouped imports
      const goImports = content.matchAll(/import\s+(?:\w+\s+)?"([^"]+)"/g);
      for (const m of goImports) imports.push(m[1]);
      // Grouped: match lines inside import ( ... )
      const grouped = content.match(/import\s*\(([\s\S]*?)\)/);
      if (grouped) {
        const lines = grouped[1].matchAll(/\s*(?:\w+\s+)?"([^"]+)"/g);
        for (const m of lines) imports.push(m[1]);
      }
      break;
    }
    case "java":
    case "kotlin": {
      const javaImports = content.matchAll(/^import\s+([\w.]+);?/gm);
      for (const m of javaImports) imports.push(m[1]);
      break;
    }
    case "ruby": {
      const rubyImports = content.matchAll(/require(?:_relative)?\s+['"]([^'"]+)['"]/g);
      for (const m of rubyImports) imports.push(m[1]);
      break;
    }
    case "elixir": {
      const elixirImports = content.matchAll(/(?:import|alias|use)\s+([\w.]+)/gm);
      for (const m of elixirImports) imports.push(m[1]);
      break;
    }
    default: {
      // Generic: catch import/require/use patterns
      const generic = content.matchAll(/(?:import|require|use|from)\s+['"]([^'"]+)['"]/g);
      for (const m of generic) imports.push(m[1]);
    }
  }

  return imports;
}

// ── Import resolution ──

function resolveImport(
  raw: string,
  importerPath: string,
  language: string,
  projectRoot: string
): ParsedImport {
  // Detect non-project imports
  if (isExternalImport(raw, language)) {
    return { raw, resolved: null, isProjectInternal: false };
  }

  let resolved: string | null = null;

  switch (language) {
    case "typescript":
    case "javascript": {
      if (raw.startsWith(".") || raw.startsWith("/")) {
        // Relative import
        const importerDir = dirname(importerPath);
        const abs = resolve(importerDir, raw);
        resolved = relative(projectRoot, abs).replace(/\\/g, "/");
        // Strip extension if present (.js, .ts — TypeScript often imports as .js)
        resolved = resolved.replace(/\.(js|ts|tsx|jsx|mjs)$/, "");
      }
      break;
    }
    case "python": {
      // Convert dots to path: package.module → package/module
      resolved = raw.replace(/\./g, "/");
      break;
    }
    case "rust": {
      // crate::module::sub → src/module/sub
      if (raw.startsWith("crate::")) {
        resolved = "src/" + raw.slice(7).replace(/::/g, "/");
      } else if (raw.startsWith("super::")) {
        const importerDir = dirname(importerPath);
        resolved = join(dirname(importerDir), raw.slice(7).replace(/::/g, "/")).replace(/\\/g, "/");
      }
      break;
    }
    case "go": {
      // Go imports are full module paths — project-internal if they share the module prefix
      // For simplicity, resolve relative to project root
      resolved = raw;
      break;
    }
    case "java":
    case "kotlin": {
      // com.foo.Bar → com/foo/Bar
      resolved = raw.replace(/\./g, "/");
      break;
    }
    case "ruby": {
      resolved = raw;
      break;
    }
    default:
      resolved = raw;
  }

  return { raw, resolved, isProjectInternal: true };
}

function isExternalImport(raw: string, language: string): boolean {
  switch (language) {
    case "typescript":
    case "javascript":
      // Relative imports are internal
      if (raw.startsWith(".") || raw.startsWith("/")) return false;
      // node: builtins
      if (raw.startsWith("node:")) return true;
      // Scoped packages or bare specifiers are external
      return true;
    case "python":
      // Standard library modules (rough heuristic)
      const stdlibPrefixes = ["os", "sys", "re", "json", "typing", "collections",
        "pathlib", "unittest", "pytest", "dataclasses", "abc", "io", "math",
        "datetime", "functools", "itertools", "logging", "argparse", "subprocess"];
      return stdlibPrefixes.some((p) => raw === p || raw.startsWith(p + "."));
    case "rust":
      // crate::, super::, self:: are internal
      return !raw.startsWith("crate::") && !raw.startsWith("super::") && !raw.startsWith("self::");
    case "go":
      // Standard library (no dots in path)
      return !raw.includes(".");
    case "java":
    case "kotlin":
      // java.*, javax.*, org.junit.*, etc. are external
      return raw.startsWith("java.") || raw.startsWith("javax.") ||
        raw.startsWith("org.junit") || raw.startsWith("kotlin.");
    default:
      return false;
  }
}
