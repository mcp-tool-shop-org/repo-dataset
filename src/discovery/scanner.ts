/** Repo structure scanner — walks file tree, classifies files */

import { readdir, stat } from "node:fs/promises";
import { join, extname, basename, relative } from "node:path";
import { detectLanguage, isSourceFile, isDocFile } from "./languages.js";
import { shouldInclude } from "./filters.js";
import type { RepoInfo, FileEntry, LanguageStats } from "../types.js";

export async function scanRepo(
  repoPath: string,
  include: string[],
  exclude: string[]
): Promise<RepoInfo> {
  const sourceFiles: FileEntry[] = [];
  const docFiles: FileEntry[] = [];
  const testFiles: FileEntry[] = [];
  const langCounts: Record<string, number> = {};

  await walkDir(repoPath, repoPath, include, exclude, (entry) => {
    const ext = extname(entry.relativePath).toLowerCase();
    const lang = detectLanguage(ext);
    langCounts[lang] = (langCounts[lang] || 0) + 1;

    if (isTestFile(entry.relativePath)) {
      testFiles.push(entry);
    } else if (isDocFile(ext)) {
      docFiles.push(entry);
    } else if (isSourceFile(ext)) {
      sourceFiles.push(entry);
    }
  });

  const totalFiles = sourceFiles.length + docFiles.length + testFiles.length;
  const languages: LanguageStats[] = Object.entries(langCounts)
    .filter(([lang]) => lang !== "unknown")
    .sort((a, b) => b[1] - a[1])
    .map(([language, fileCount]) => ({
      language,
      fileCount,
      percentage: totalFiles > 0 ? Math.round((fileCount / totalFiles) * 100) : 0,
    }));

  return {
    path: repoPath,
    name: basename(repoPath),
    languages,
    fileCount: totalFiles,
    sourceFiles,
    docFiles,
    testFiles,
  };
}

async function walkDir(
  rootPath: string,
  dirPath: string,
  include: string[],
  exclude: string[],
  onFile: (entry: FileEntry) => void
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const relativePath = relative(rootPath, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      // Skip hidden dirs and common non-source dirs early
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      await walkDir(rootPath, fullPath, include, exclude, onFile);
    } else if (entry.isFile()) {
      if (!shouldInclude(relativePath, include, exclude)) continue;

      let fileSize = 0;
      try {
        const st = await stat(fullPath);
        fileSize = st.size;
      } catch {
        continue;
      }

      // Skip very large files (>1MB likely not useful training data)
      if (fileSize > 1024 * 1024) continue;

      const ext = extname(entry.name).toLowerCase();
      const language = detectLanguage(ext);

      onFile({
        path: fullPath,
        relativePath,
        language,
        size: fileSize,
      });
    }
  }
}

function isTestFile(relativePath: string): boolean {
  const name = basename(relativePath).toLowerCase();
  const dir = relativePath.toLowerCase();
  return (
    name.includes(".test.") ||
    name.includes(".spec.") ||
    name.includes("_test.") ||
    name.startsWith("test_") ||
    dir.includes("/tests/") ||
    dir.includes("/test/") ||
    dir.includes("/__tests__/")
  );
}
