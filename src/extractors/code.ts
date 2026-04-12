/** Code extractor — heuristic function detection, generates explanation pairs */

import { readFile } from "node:fs/promises";
import { estimateTokens } from "../pipeline/tokens.js";
import type { Extractor, ExtractedPair, ExtractionContext } from "../types.js";

export class CodeExtractor implements Extractor {
  name = "code" as const;
  description = "Extracts function/class explanations and docstring pairs from source files";

  async *extract(ctx: ExtractionContext): AsyncIterable<ExtractedPair> {
    for (const file of ctx.repoInfo.sourceFiles) {
      let content: string;
      try {
        content = await readFile(file.path, "utf-8");
      } catch {
        continue;
      }

      if (!content.trim()) continue;

      // Extract function-level chunks
      const functions = extractFunctions(content, file.language);
      for (const fn of functions) {
        const tokens = estimateTokens(fn.body);
        if (tokens < ctx.config.minTokens || tokens > ctx.config.maxTokens) continue;

        yield {
          instruction: `Explain what this ${fn.type} does in ${file.language}`,
          input: fn.body,
          output: generateExplanation(fn),
          metadata: {
            source: "code",
            file: file.relativePath,
            language: file.language,
            tokens,
          },
        };
      }

      // File-level chunk if file is reasonably sized
      const fileTokens = estimateTokens(content);
      if (fileTokens >= ctx.config.minTokens && fileTokens <= ctx.config.maxTokens) {
        yield {
          instruction: `Explain the purpose and structure of this ${file.language} file`,
          input: `// File: ${file.relativePath}\n${content}`,
          output: `This file (${file.relativePath}) contains ${file.language} code with ${functions.length} function(s).`,
          metadata: {
            source: "code",
            file: file.relativePath,
            language: file.language,
            tokens: fileTokens,
          },
        };
      }
    }
  }
}

interface FunctionChunk {
  name: string;
  type: "function" | "class" | "method";
  body: string;
  docstring?: string;
}

function extractFunctions(content: string, language: string): FunctionChunk[] {
  const chunks: FunctionChunk[] = [];
  const lines = content.split("\n");

  // Language-specific function patterns
  const patterns = getFunctionPatterns(language);

  let i = 0;
  while (i < lines.length) {
    for (const pattern of patterns) {
      const match = lines[i].match(pattern.regex);
      if (match) {
        const name = match[1] || "anonymous";
        const startLine = i;
        const endLine = findBlockEnd(lines, i, language);

        if (endLine > startLine) {
          const body = lines.slice(startLine, endLine + 1).join("\n");
          const tokens = estimateTokens(body);
          // Only include functions with meaningful content (>5 lines, >20 tokens)
          if (endLine - startLine >= 5 && tokens >= 20) {
            // Check for docstring above
            const docstring = extractDocstring(lines, startLine, language);
            chunks.push({ name, type: pattern.type, body, docstring });
          }
          i = endLine;
        }
        break;
      }
    }
    i++;
  }

  return chunks;
}

interface FunctionPattern {
  regex: RegExp;
  type: "function" | "class" | "method";
}

function getFunctionPatterns(language: string): FunctionPattern[] {
  switch (language) {
    case "typescript":
    case "javascript":
      return [
        { regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/, type: "function" },
        { regex: /^\s*(?:export\s+)?class\s+(\w+)/, type: "class" },
        { regex: /^\s*(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(/, type: "function" },
        { regex: /^\s*(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\(/, type: "method" },
      ];
    case "python":
      return [
        { regex: /^(?:async\s+)?def\s+(\w+)\s*\(/, type: "function" },
        { regex: /^class\s+(\w+)/, type: "class" },
      ];
    case "rust":
      return [
        { regex: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/, type: "function" },
        { regex: /^\s*(?:pub\s+)?struct\s+(\w+)/, type: "class" },
        { regex: /^\s*impl\s+(\w+)/, type: "class" },
      ];
    case "go":
      return [
        { regex: /^func\s+(\w+)\s*\(/, type: "function" },
        { regex: /^func\s+\(\w+\s+\*?\w+\)\s+(\w+)\s*\(/, type: "method" },
        { regex: /^type\s+(\w+)\s+struct/, type: "class" },
      ];
    case "java":
    case "kotlin":
    case "csharp":
      return [
        { regex: /^\s*(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?\w+\s+(\w+)\s*\(/, type: "method" },
        { regex: /^\s*(?:public|private|protected|internal)?\s*class\s+(\w+)/, type: "class" },
      ];
    default:
      return [
        { regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/, type: "function" },
        { regex: /^\s*(?:def|fn|func)\s+(\w+)/, type: "function" },
        { regex: /^\s*class\s+(\w+)/, type: "class" },
      ];
  }
}

function findBlockEnd(lines: string[], startLine: number, language: string): number {
  if (language === "python") {
    // Python: indentation-based
    const baseIndent = getIndent(lines[startLine]);
    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "") continue;
      if (getIndent(line) <= baseIndent && i > startLine + 1) {
        return i - 1;
      }
    }
    return lines.length - 1;
  }

  // Brace-based languages
  let braceCount = 0;
  let foundOpen = false;
  for (let i = startLine; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") {
        braceCount++;
        foundOpen = true;
      } else if (ch === "}") {
        braceCount--;
        if (foundOpen && braceCount === 0) {
          return i;
        }
      }
    }
  }

  // Fallback: take next 30 lines
  return Math.min(startLine + 30, lines.length - 1);
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function extractDocstring(lines: string[], fnLine: number, language: string): string | undefined {
  if (language === "python") {
    // Look for docstring inside function (line after def)
    for (let i = fnLine + 1; i < Math.min(fnLine + 3, lines.length); i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        const docs: string[] = [trimmed];
        if (!trimmed.endsWith('"""') || trimmed === '"""') {
          for (let j = i + 1; j < lines.length; j++) {
            docs.push(lines[j].trim());
            if (lines[j].trim().endsWith('"""') || lines[j].trim().endsWith("'''")) break;
          }
        }
        return docs.join(" ").replace(/"""/g, "").replace(/'''/g, "").trim();
      }
    }
  }

  // JSDoc / block comment above function
  if (fnLine > 0) {
    const above = lines[fnLine - 1].trim();
    if (above === "*/") {
      const docs: string[] = [];
      for (let j = fnLine - 2; j >= 0; j--) {
        const line = lines[j].trim();
        docs.unshift(line.replace(/^\*\s?/, "").replace(/^\/\*\*\s?/, ""));
        if (line.startsWith("/**") || line.startsWith("/*")) break;
      }
      return docs.join(" ").trim();
    }
  }

  return undefined;
}

function generateExplanation(fn: FunctionChunk): string {
  if (fn.docstring) {
    return fn.docstring;
  }
  return `The ${fn.type} "${fn.name}" performs its defined operations as shown in the implementation.`;
}
