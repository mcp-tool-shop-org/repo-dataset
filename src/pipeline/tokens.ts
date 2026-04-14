/** Token estimation — language-aware character-to-token ratio */

/**
 * Language-specific chars-per-token ratios.
 * Derived from empirical measurements against GPT-family tokenizers.
 * Lower ratio = fewer chars per token = more tokens per character.
 */
const TOKEN_RATIOS: Record<string, number> = {
  python: 3.2,       // whitespace-heavy, natural language in docstrings
  javascript: 3.8,   // camelCase, moderate verbosity
  typescript: 3.8,
  rust: 4.1,         // verbose syntax, snake_case identifiers
  go: 3.5,           // minimal syntax, short identifiers
  java: 4.0,         // verbose OOP, long class names
  cpp: 4.0,          // templates, namespaces, verbose
  c: 3.8,            // short keywords, pointers
  "c++": 4.0,
  "c#": 4.0,
  csharp: 4.0,
  ruby: 3.3,         // natural language-like syntax
  shell: 3.0,        // short tokens, pipes, flags
  bash: 3.0,
  sh: 3.0,
  zsh: 3.0,
  markdown: 4.5,     // lots of natural language
  html: 3.5,         // tags are short repeated tokens
  css: 3.5,
  json: 3.2,         // structural characters, short keys
  yaml: 3.8,
  toml: 3.8,
  sql: 3.5,          // keywords, short identifiers
  php: 3.8,
  swift: 3.8,
  kotlin: 3.8,
  scala: 3.8,
  lua: 3.3,
  perl: 3.2,
  r: 3.5,
  dart: 3.8,
  elixir: 3.5,
  haskell: 3.8,
  ocaml: 3.8,
  zig: 3.8,
  gdscript: 3.5,     // Godot scripting, Python-like
  default: 3.8,
};

/**
 * Estimate token count from text length, optionally adjusting for language.
 * Falls back to a generic 3.8 chars/token ratio when language is unknown.
 */
export function estimateTokens(text: string, language?: string): number {
  if (text.length === 0) return 0;
  const key = language?.toLowerCase() ?? "default";
  const ratio = TOKEN_RATIOS[key] ?? TOKEN_RATIOS.default;
  return Math.ceil(text.length / ratio);
}
