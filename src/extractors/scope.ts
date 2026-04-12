/** Scope detection — strip strings/comments, build scope map, classify */

// ── String/Comment Stripping ──

interface StripState {
  inBlockComment: boolean;
}

/**
 * Strip string literals and comments from a line, replacing content with spaces.
 * This makes brace-counting safe — braces inside strings/comments are neutralized.
 */
export function stripStringsAndComments(line: string, state: StripState): string {
  const result: string[] = [];
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    const next = line[i + 1];

    // Block comment end
    if (state.inBlockComment) {
      if (ch === "*" && next === "/") {
        state.inBlockComment = false;
        result.push(" ", " ");
        i += 2;
      } else {
        result.push(" ");
        i++;
      }
      continue;
    }

    // Single-line comment (//)
    if (ch === "/" && next === "/") {
      while (i < line.length) { result.push(" "); i++; }
      break;
    }

    // Hash comment (Python, Ruby, Shell)
    if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      while (i < line.length) { result.push(" "); i++; }
      break;
    }

    // Block comment start
    if (ch === "/" && next === "*") {
      state.inBlockComment = true;
      result.push(" ", " ");
      i += 2;
      continue;
    }

    // String literals (single, double, backtick)
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      result.push(" ");
      i++;
      while (i < line.length) {
        if (line[i] === "\\" && i + 1 < line.length) {
          result.push(" ", " ");
          i += 2;
        } else if (line[i] === quote) {
          result.push(" ");
          i++;
          break;
        } else {
          result.push(" ");
          i++;
        }
      }
      continue;
    }

    result.push(ch);
    i++;
  }

  return result.join("");
}

// ── Scope Map ──

export interface Scope {
  startLine: number;
  endLine: number;
  depth: number;
  headerLines: number[]; // lines that precede/include the opening brace
}

/**
 * Build a scope map for brace-based languages.
 * Returns all matched brace pairs with their line ranges.
 */
export function buildBraceScopeMap(lines: string[]): Scope[] {
  const scopes: Scope[] = [];
  const stack: { line: number; depth: number }[] = [];
  const state: StripState = { inBlockComment: false };
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const stripped = stripStringsAndComments(lines[i], state);

    for (const ch of stripped) {
      if (ch === "{") {
        depth++;
        stack.push({ line: i, depth });
      } else if (ch === "}") {
        if (stack.length > 0) {
          const opened = stack.pop()!;
          scopes.push({
            startLine: opened.line,
            endLine: i,
            depth: opened.depth,
            headerLines: findHeaderLines(lines, opened.line),
          });
        }
        depth--;
      }
    }
  }

  return scopes;
}

/**
 * Find the header lines for a scope (the line with `{` and preceding lines
 * that are part of the signature — multi-line function declarations, decorators, etc.)
 */
function findHeaderLines(lines: string[], braceLine: number): number[] {
  const result = [braceLine];

  // If the brace line itself has a function/class keyword, that's the header
  if (looksLikeDefinitionStart(lines[braceLine])) return result;

  // Otherwise scan backward for the definition start
  // (handles `function foo(\n  x,\n  y\n) {` patterns)
  for (let i = braceLine - 1; i >= Math.max(0, braceLine - 10); i--) {
    const line = lines[i].trim();
    if (line === "") continue;
    result.unshift(i);
    if (looksLikeDefinitionStart(lines[i])) break;
    // Stop if we hit something that's clearly not part of a signature
    if (line.endsWith(";") || line.endsWith("}")) {
      result.shift();
      break;
    }
  }

  return result;
}

function looksLikeDefinitionStart(line: string): boolean {
  const t = line.trim();
  return /(?:^|\s)(?:export|pub|public|private|protected|internal|static|abstract|async|unsafe|const|default|override|virtual|suspend)\s/.test(t) ||
    /^\s*(?:function|class|interface|type|def |fn |func |impl |trait |struct |enum |mod )/.test(t) ||
    /^\s*(?:const|let|var)\s+\w+\s*[=:]/.test(t) ||
    /^\s*@\w/.test(t) || // decorator
    /^\s*#\[/.test(t);   // Rust attribute
}

// ── Scope Classification ──

export interface ClassifiedScope extends Scope {
  kind: "function" | "class" | "method" | "control" | "other";
  name: string | null;
  language: string;
}

export function classifyScope(scope: Scope, lines: string[], language: string): ClassifiedScope {
  // Combine all header lines into one string for pattern matching
  const header = scope.headerLines.map((i) => lines[i].trim()).join(" ");

  const patterns = getClassificationPatterns(language);
  for (const p of patterns) {
    const match = header.match(p.regex);
    if (match) {
      return { ...scope, kind: p.type, name: match[p.captureGroup || 1] || null, language };
    }
  }

  // Control flow
  if (/\b(if|else|elif|for|while|do|switch|match|loop|try|catch|finally)\b/.test(header)) {
    return { ...scope, kind: "control", name: null, language };
  }

  return { ...scope, kind: "other", name: null, language };
}

interface ClassPattern {
  regex: RegExp;
  type: "function" | "class" | "method";
  captureGroup?: number;
}

function getClassificationPatterns(language: string): ClassPattern[] {
  switch (language) {
    case "typescript":
    case "javascript":
      return [
        { regex: /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/, type: "function" },
        { regex: /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/, type: "class" },
        { regex: /(?:export\s+)?(?:interface|type)\s+(\w+)/, type: "class" },
        { regex: /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*\S+\s*)?=\s*(?:async\s+)?(?:\(|[a-zA-Z_])/, type: "function" },
        { regex: /(?:public|private|protected|static|abstract|override|readonly|\s)*(?:async\s+)?(?:get\s+|set\s+)?(?:#)?(\w+)\s*(?:<[^>]*>)?\s*\(/, type: "method" },
      ];
    case "python":
      return [
        { regex: /(?:async\s+)?def\s+(\w+)/, type: "function" },
        { regex: /class\s+(\w+)/, type: "class" },
      ];
    case "rust":
      return [
        { regex: /(?:pub(?:\([^)]*\))?\s+)?(?:default\s+)?(?:async\s+)?(?:unsafe\s+)?(?:const\s+)?fn\s+(\w+)/, type: "function" },
        { regex: /(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait)\s+(\w+)/, type: "class" },
        { regex: /(?:unsafe\s+)?impl(?:<[^>]*>)?\s+(?:\w+\s+for\s+)?(\w+)/, type: "class" },
        { regex: /macro_rules!\s+(\w+)/, type: "function" },
      ];
    case "go":
      return [
        { regex: /func\s+\(\s*\w+\s+\*?(\w+)\)\s+(\w+)\s*(?:\[.*?\])?\s*\(/, type: "method", captureGroup: 2 },
        { regex: /func\s+(\w+)\s*(?:\[.*?\])?\s*\(/, type: "function" },
        { regex: /type\s+(\w+)\s+(?:struct|interface)/, type: "class" },
      ];
    case "java":
    case "kotlin":
    case "csharp":
      return [
        { regex: /(?:public|private|protected|internal)?\s*(?:static\s+)?(?:final\s+)?(?:abstract\s+)?(?:sealed\s+)?(?:data\s+)?(?:class|interface|enum|record|struct)\s+(\w+)/, type: "class" },
        { regex: /(?:public|private|protected|internal)?\s*(?:static\s+)?(?:final\s+)?(?:abstract\s+)?(?:override\s+)?(?:virtual\s+)?(?:async\s+)?(?:suspend\s+)?(?:<[^>]+>\s+)?(?:\w+(?:<[^>]*>)?(?:\[\])*)\s+(\w+)\s*\(/, type: "method" },
      ];
    default:
      return [
        { regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/, type: "function" },
        { regex: /(?:def|fn|func)\s+(\w+)/, type: "function" },
        { regex: /class\s+(\w+)/, type: "class" },
      ];
  }
}

// ── Python Scope Detection (indentation-based) ──

export interface PythonScope {
  startLine: number; // first decorator or def/class line
  endLine: number;
  kind: "function" | "class";
  name: string;
  indent: number;
}

export function buildPythonScopeMap(lines: string[]): PythonScope[] {
  const scopes: PythonScope[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/) ||
                  line.match(/^(\s*)class\s+(\w+)/);
    if (!match) continue;

    const indent = match[1].length;
    const name = match[2];
    const kind = line.trim().startsWith("class") ? "class" as const : "function" as const;

    // Collect decorators above
    let startLine = i;
    for (let j = i - 1; j >= 0; j--) {
      const above = lines[j].trim();
      if (above.startsWith("@")) {
        startLine = j;
      } else if (above === "" || above.startsWith("#")) {
        continue;
      } else {
        break;
      }
    }

    // Find end: indentation drops back to this level
    const endLine = findPythonBlockEnd(lines, i, indent);

    scopes.push({ startLine, endLine, kind, name, indent });
    // Don't skip to endLine — nested defs will be found on their own
  }

  return scopes;
}

function findPythonBlockEnd(lines: string[], defLine: number, baseIndent: number): number {
  // Handle multi-line signature
  let sigEnd = defLine;
  let parenDepth = 0;
  for (let i = defLine; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "(") parenDepth++;
      if (ch === ")") parenDepth--;
    }
    if (parenDepth <= 0) { sigEnd = i; break; }
  }

  let lastContent = sigEnd;
  for (let i = sigEnd + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") continue;

    const lineIndent = line.length - line.trimStart().length;
    if (lineIndent > baseIndent) {
      lastContent = i;
    } else if (trimmed.startsWith("elif ") || trimmed.startsWith("else:") ||
               trimmed.startsWith("except") || trimmed.startsWith("finally:")) {
      lastContent = i;
    } else {
      break;
    }
  }

  return lastContent;
}
