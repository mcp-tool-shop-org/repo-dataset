# Ollama Intern MCP — Seams Found During repo-dataset Marketing Swarm (2026-04-17)

Real usage finding during the repo-dataset marketing swarm. Filing as additive signal to `memory/ollama-intern-adoption-pass-2026-04-16.md` — no product changes made here, just observations.

## SEAM #3 — `ollama_research` rejects array-param shape

**Observed:** Two sequential calls to `ollama_research` with `source_paths: ["F:/AI/repo-dataset/docs/research-inputs/competitors.md"]` both returned:

```
MCP error -32602: Input validation error
code: "invalid_type"
expected: "array"
received: "string"
path: ["source_paths"]
```

The error occurred at MCP input validation, not at Ollama runtime. It reproduces with Ollama running. Same error shape whether the array has one element or could have multiple.

**Suspected root cause:** Somewhere between the tool-use schema and the MCP server, the array argument is being serialized to its JSON string form before the validator sees it. `source_paths: ["/path"]` reaches the validator as `"[\"/path\"]"` (string), which fails the `array` type check.

**Workaround tried:** `ollama_draft` with a single `prompt: string` parameter worked fine (see below). Single-scalar tools are unaffected.

**Impact:** The tool with the strongest *research synthesis* thesis — multi-file compare, structured claim extraction — is blocked for any caller passing a path array. This is a first-call failure, which is worse than a timeout because users won't know what to tweak.

**Fix shape suggestion (for future intern work):** audit every tool with an array or object param. If the MCP transport is JSON-stringifying nested shapes, either (a) fix the transport serializer, or (b) accept `source_paths` as `string | string[]` at the schema and parse at entry.

## Signal #4 — `ollama_draft` for marketing prose confirms adoption-pass verdict

Same pass also ran `ollama_draft` (style: "doc") asking for 6 README hero variants under 12 words with a falsifiable claim, given competitor taglines to avoid and the locked thesis.

**Output:** 6 variants returned cleanly on workhorse (qwen2.5-coder:7b, 15s, in_vram, no eviction). Shape was perfect. Content was generic — "ensuring purity", "integrity for training success", "train smarter with clean, validated data." Of the 6, 2 had *some* specificity (mentioning leaks+secrets, or the image-text-judgment triangle); the rest were brochure language.

**Matches adoption-pass finding verbatim:** "Draft for doc prose = shape-correct but content-generic. Saves typing, not thinking. For long-form prose (CHANGELOG, release notes), it times out or produces marketing sludge."

**Net value for this swarm:** Tone calibration only. None of the 6 shipped. Claude did the real positioning synthesis from the user's locked thesis.

## Positive calibration

- `ollama_draft` envelope returned the useful telemetry (`tier_used: workhorse`, `elapsed_ms: 15185`, `in_vram: true`, `evicted: false`) — the Deep-tier residency discipline from the adoption pass still holds on a fresh day's work
- `hardware_profile: "dev-rtx5080"` tag on every envelope keeps dev numbers filterable from publishable benchmarks — good discipline continues
