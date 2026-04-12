/** Extension → language mapping */

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".kt": "kotlin",
  ".cs": "csharp",
  ".fs": "fsharp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".cc": "cpp",
  ".lua": "lua",
  ".zig": "zig",
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",
  ".hs": "haskell",
  ".ml": "ocaml",
  ".scala": "scala",
  ".dart": "dart",
  ".r": "r",
  ".R": "r",
  ".jl": "julia",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".ps1": "powershell",
  ".sql": "sql",
  ".vue": "vue",
  ".svelte": "svelte",
  ".astro": "astro",
  ".md": "markdown",
  ".mdx": "markdown",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".json": "json",
  ".xml": "xml",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".less": "less",
  ".gdscript": "gdscript",
  ".gd": "gdscript",
};

export function detectLanguage(ext: string): string {
  return LANGUAGE_MAP[ext] || "unknown";
}

export function isSourceFile(ext: string): boolean {
  const lang = LANGUAGE_MAP[ext];
  if (!lang) return false;
  // Exclude config/data formats from "source" classification
  return !["markdown", "yaml", "toml", "json", "xml", "html", "css", "scss", "sass", "less"].includes(lang);
}

export function isDocFile(ext: string): boolean {
  return [".md", ".mdx", ".rst", ".txt"].includes(ext);
}

export { LANGUAGE_MAP };
