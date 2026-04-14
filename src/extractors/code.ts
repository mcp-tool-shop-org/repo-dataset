/** Code extractor — heuristic function detection, completion mode, quality scoring */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { estimateTokens } from "../pipeline/tokens.js";
import type { Extractor, ExtractedPair, ExtractionContext, PairMetadata, ExtractorSubType, SignalType } from "../types.js";

const EXTRACTOR_VERSION = "0.2.0";

export class CodeExtractor implements Extractor {
  name = "code" as const;
  description = "Extracts code as completion training data, with optional instruction pairs";

  async *extract(ctx: ExtractionContext): AsyncIterable<ExtractedPair> {
    const isCompletionMode = ctx.config.format === "completion" || ctx.config.format === "fim";

    for (const file of ctx.repoInfo.sourceFiles) {
      let content: string;
      try {
        content = await readFile(file.path, "utf-8");
      } catch {
        continue;
      }

      if (!content.trim()) continue;

      // Skip binary files — null bytes in the first 8KB indicate non-text content
      // that would produce garbage training pairs and poison a fine-tune
      const probe = content.slice(0, 8192);
      if (probe.includes("\0")) continue;

      const imports = extractImports(content, file.language);
      const functions = extractFunctions(content, file.language);

      // Function-level extraction
      for (const fn of functions) {
        const tokens = estimateTokens(fn.body);
        if (tokens < ctx.config.minTokens || tokens > ctx.config.maxTokens) continue;

        const qualityScore = scoreFunctionQuality(fn, tokens);
        const id = createHash("sha256").update(fn.body).digest("hex").slice(0, 16);
        const subType: ExtractorSubType = fn.type === "class" ? "code:class" : fn.type === "method" ? "code:method" : "code:function";

        const baseMeta: PairMetadata = {
          id,
          source: "code",
          repo_name: ctx.repoName,
          file: file.relativePath,
          language: file.language,
          commit_sha: ctx.headSha,
          line_start: fn.startLine,
          line_end: fn.endLine,
          extractor_type: subType,
          extractor_version: EXTRACTOR_VERSION,
          extracted_at: new Date().toISOString(),
          tokens,
          char_count: fn.body.length,
          has_docstring: !!fn.docstring,
          has_tests: false, // populated by pipeline if test pairing exists
          complexity: estimateComplexity(fn.body),
          quality_score: qualityScore,
          signal_type: isCompletionMode ? "implementation" : "explanation",
        };

        if (isCompletionMode) {
          // Completion mode: code IS the signal, include imports for context
          const codeWithContext = imports
            ? `${imports}\n\n${fn.body}`
            : fn.body;

          yield {
            instruction: "",
            input: codeWithContext,
            output: "",
            metadata: { ...baseMeta, signal_type: "implementation", tokens: estimateTokens(codeWithContext) },
          };
        } else {
          // Instruction mode: generate explanation pairs
          if (fn.docstring) {
            yield {
              instruction: `Explain what this ${fn.type} does in ${file.language}`,
              input: fn.body,
              output: fn.docstring,
              metadata: baseMeta,
            };
          } else {
            // No docstring — generate structural summary or skip if too short
            const bodyLines = fn.body.split("\n").length;
            if (bodyLines < 3) continue; // too short for meaningful structure, skip in instruction mode
            const summary = generateStructuralSummary(fn);
            yield {
              instruction: `Explain what this ${fn.type} does in ${file.language}`,
              input: fn.body,
              output: summary,
              metadata: { ...baseMeta, quality_score: Math.max(0, baseMeta.quality_score - 0.1) },
            };
          }
        }
      }

      // File-level extraction (for completion/fim — whole file as training example)
      if (isCompletionMode) {
        const fileTokens = estimateTokens(content);
        if (fileTokens >= ctx.config.minTokens && fileTokens <= ctx.config.maxTokens) {
          const id = createHash("sha256").update(content).digest("hex").slice(0, 16);
          yield {
            instruction: "",
            input: content,
            output: "",
            metadata: {
              id,
              source: "code",
              repo_name: ctx.repoName,
              file: file.relativePath,
              language: file.language,
              commit_sha: ctx.headSha,
              line_start: 1,
              line_end: content.split("\n").length,
              extractor_type: "code:file",
              extractor_version: EXTRACTOR_VERSION,
              extracted_at: new Date().toISOString(),
              tokens: fileTokens,
              char_count: content.length,
              has_docstring: false,
              has_tests: false,
              complexity: "medium",
              quality_score: scoreFileQuality(content, fileTokens),
              signal_type: "implementation",
            },
          };
        }
      } else {
        // Instruction mode: file-level summary for small files
        const fileTokens = estimateTokens(content);
        if (fileTokens >= ctx.config.minTokens && fileTokens <= ctx.config.maxTokens && functions.length > 0) {
          const id = createHash("sha256").update(`file:${file.relativePath}`).digest("hex").slice(0, 16);
          yield {
            instruction: `Explain the purpose and structure of this ${file.language} file`,
            input: `// File: ${file.relativePath}\n${content}`,
            output: `This file contains ${functions.length} ${file.language} function(s)/class(es): ${functions.map((f) => f.name).join(", ")}.`,
            metadata: {
              id,
              source: "code",
              repo_name: ctx.repoName,
              file: file.relativePath,
              language: file.language,
              commit_sha: ctx.headSha,
              line_start: 1,
              line_end: content.split("\n").length,
              extractor_type: "code:file",
              extractor_version: EXTRACTOR_VERSION,
              extracted_at: new Date().toISOString(),
              tokens: fileTokens,
              char_count: content.length,
              has_docstring: false,
              has_tests: false,
              complexity: "medium",
              quality_score: 0.4, // file-level summaries are low-signal
              signal_type: "explanation",
            },
          };
        }
      }
    }
  }
}

// ── Quality scoring ──

function scoreFunctionQuality(fn: FunctionChunk, tokens: number): number {
  let score = 0;

  // Token count in sweet spot (50-500)
  if (tokens >= 50 && tokens <= 500) score += 0.3;
  else if (tokens >= 20 && tokens <= 1000) score += 0.15;

  // Has docstring
  if (fn.docstring) score += 0.25;

  // Has meaningful name (not generic)
  if (!isGenericName(fn.name)) score += 0.15;

  // Reasonable complexity (not trivial, not insane)
  const lines = fn.body.split("\n").length;
  if (lines >= 5 && lines <= 100) score += 0.15;

  // Has control flow (branches, loops = non-trivial logic)
  if (/\b(if|else|for|while|switch|match|try|catch)\b/.test(fn.body)) score += 0.15;

  return Math.min(score, 1.0);
}

function scoreFileQuality(content: string, tokens: number): number {
  let score = 0.3; // baseline for whole files

  // Good token range
  if (tokens >= 100 && tokens <= 1000) score += 0.2;

  // Has imports (indicates real module, not config)
  if (/^(import|from|require|use |using )/m.test(content)) score += 0.1;

  // Not mostly comments
  const lines = content.split("\n");
  const commentLines = lines.filter((l) => /^\s*(\/\/|#|--|\/\*|\*)/.test(l)).length;
  if (commentLines / lines.length < 0.5) score += 0.1;

  // Has exports (indicates module boundary)
  if (/\b(export|module\.exports|pub fn|pub struct)\b/.test(content)) score += 0.1;

  return Math.min(score, 1.0);
}

function isGenericName(name: string): boolean {
  const generic = new Set([
    "foo", "bar", "baz", "test", "test1", "test2",
    "handle", "process", "run", "execute", "do", "main",
    "temp", "tmp", "x", "y", "z", "a", "b", "c",
  ]);
  return generic.has(name.toLowerCase());
}

function estimateComplexity(code: string): "low" | "medium" | "high" {
  const branches = (code.match(/\b(if|else if|elif|case|catch|&&|\|\|)\b/g) || []).length;
  if (branches <= 1) return "low";
  if (branches <= 8) return "medium";
  return "high";
}

/** Build a structural summary from a function body when no docstring exists.
 *  Produces a factual description of parameters, return type, branching, error handling, and async usage. */
function generateStructuralSummary(fn: FunctionChunk): string {
  const body = fn.body;
  const parts: string[] = [];

  // Count parameters from the signature (first line)
  const sigMatch = body.match(/\(([^)]*)\)/);
  if (sigMatch) {
    const paramStr = sigMatch[1].trim();
    const paramCount = paramStr ? paramStr.split(",").length : 0;
    parts.push(`takes ${paramCount} parameter${paramCount !== 1 ? "s" : ""}`);
  }

  // Detect return type or return statements
  const returnTypeMatch = body.match(/\)\s*:\s*([\w<>\[\]|&\s]+?)\s*[{=]/);
  const hasReturn = /\breturn\b/.test(body);
  if (returnTypeMatch) {
    const rt = returnTypeMatch[1].trim();
    if (rt === "void") {
      parts.push("returns void");
    } else {
      parts.push(`returns ${rt}`);
    }
  } else if (hasReturn) {
    parts.push("returns a value");
  }

  // Count conditional branches
  const branchKeywords = body.match(/\b(if|else if|elif|else|switch|case|match)\b/g) || [];
  const branchCount = branchKeywords.length;
  if (branchCount > 0) {
    parts.push(`contains ${branchCount} conditional branch${branchCount !== 1 ? "es" : ""}`);
  }

  // Detect try/catch (error handling)
  if (/\b(try|catch|except|finally)\b/.test(body)) {
    parts.push("error handling");
  }

  // Detect async/await
  if (/\b(async|await)\b/.test(body)) {
    parts.push("async/await");
  }

  // Detect loops
  const loopKeywords = body.match(/\b(for|while|loop)\b/g) || [];
  if (loopKeywords.length > 0) {
    parts.push(`${loopKeywords.length} loop${loopKeywords.length !== 1 ? "s" : ""}`);
  }

  if (parts.length === 0) {
    // Absolute fallback — still more informative than the old tautology
    const lineCount = body.split("\n").length;
    return `A ${fn.type} with a ${lineCount}-line body.`;
  }

  // Build sentence: "A function that takes 2 parameters, returns a Promise, contains 3 conditional branches and error handling."
  const head = `A ${fn.type} that ${parts[0]}`;
  if (parts.length === 1) return `${head}.`;

  // Join with commas, last item with "and"
  const middle = parts.slice(1, -1).join(", ");
  const last = parts[parts.length - 1];
  const tail = middle ? `, ${middle} and ${last}` : ` and ${last}`;
  return `${head}${tail}.`;
}

// ── Import extraction ──

function extractImports(content: string, language: string): string {
  const lines = content.split("\n");
  const importLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (isImportLine(trimmed, language)) {
      importLines.push(line);
    } else if (importLines.length > 0 && trimmed === "") {
      // Allow one blank line between imports
      continue;
    } else if (importLines.length > 0) {
      break; // End of import block
    }
  }

  return importLines.join("\n");
}

function isImportLine(line: string, language: string): boolean {
  switch (language) {
    case "typescript":
    case "javascript":
      return /^(import |export .* from )/.test(line);
    case "python":
      return /^(import |from .* import )/.test(line);
    case "rust":
      return /^use /.test(line);
    case "go":
      return /^import /.test(line) || /^\t"/.test(line);
    case "java":
    case "kotlin":
      return /^import /.test(line);
    case "csharp":
      return /^using /.test(line);
    default:
      return /^(import |from |use |using |require)/.test(line);
  }
}

// ── Function extraction ──

interface FunctionChunk {
  name: string;
  type: "function" | "class" | "method";
  body: string;
  docstring?: string;
  startLine: number;
  endLine: number;
}

function extractFunctions(content: string, language: string): FunctionChunk[] {
  const chunks: FunctionChunk[] = [];
  const lines = content.split("\n");
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
          const lineCount = endLine - startLine + 1;
          // Only include functions with meaningful content (>=5 lines)
          if (lineCount >= 5) {
            const docstring = extractDocstring(lines, startLine, language);
            chunks.push({
              name,
              type: pattern.type,
              body,
              docstring,
              startLine: startLine + 1, // 1-indexed
              endLine: endLine + 1,
            });
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
    const baseIndent = getIndent(lines[startLine]);
    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed === "") continue;
      if (getIndent(line) <= baseIndent && i > startLine + 1) {
        // Don't end on decorators or continuation keywords at base indent
        if (trimmed.startsWith("@")) continue;
        if (/^(elif|else|except|finally)\b/.test(trimmed)) continue;
        return i - 1;
      }
    }
    return lines.length - 1;
  }

  // Brace-based languages — strip strings and comments before counting braces
  let braceCount = 0;
  let foundOpen = false;
  let inBlockComment = false;
  for (let i = startLine; i < lines.length; i++) {
    let cleaned = lines[i];
    // Handle block comments that span lines
    if (inBlockComment) {
      const endIdx = cleaned.indexOf("*/");
      if (endIdx === -1) { cleaned = ""; } else { cleaned = cleaned.slice(endIdx + 2); inBlockComment = false; }
    }
    // Remove single-line // comments
    cleaned = cleaned.replace(/\/\/.*$/, "");
    // Remove inline /* ... */ comments and string literals iteratively
    cleaned = cleaned.replace(/\/\*.*?\*\//g, " ");
    // Check for unclosed block comment
    const blockStart = cleaned.indexOf("/*");
    if (blockStart !== -1) { cleaned = cleaned.slice(0, blockStart); inBlockComment = true; }
    // Remove string literals (double-quoted, single-quoted, backtick)
    cleaned = cleaned.replace(/"(?:[^"\\]|\\.)*"/g, " ");
    cleaned = cleaned.replace(/'(?:[^'\\]|\\.)*'/g, " ");
    cleaned = cleaned.replace(/`(?:[^`\\]|\\.)*`/g, " ");
    for (const ch of cleaned) {
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

  return Math.min(startLine + 30, lines.length - 1);
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function extractDocstring(lines: string[], fnLine: number, language: string): string | undefined {
  if (language === "python") {
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
