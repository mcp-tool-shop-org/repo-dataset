/** Contamination validation — secrets, PII, and benchmark leakage detection */

import type { ParsedPair } from "./distribution.js";

// ── Secret patterns ──

const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub Token (ghp)", regex: /ghp_[A-Za-z0-9_]{36,}/ },
  { name: "GitHub Token (gho)", regex: /gho_[A-Za-z0-9_]{36,}/ },
  { name: "GitHub Token (ghs)", regex: /ghs_[A-Za-z0-9_]{36,}/ },
  { name: "Generic API Key", regex: /api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/ },
  { name: "RSA Private Key", regex: /-----BEGIN RSA PRIVATE KEY-----/ },
];

// ── PII patterns ──

const PII_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "Email Address", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/ },
  { name: "IPv4 Address", regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/ },
];

// ── HumanEval benchmark function signatures ──
// These are well-known function signatures from the HumanEval benchmark.
// If training data contains them, it contaminates evaluation results.

const BENCHMARK_SIGNATURES: string[] = [
  "has_close_elements",
  "separate_paren_groups",
  "truncate_number",
  "below_zero",
  "mean_absolute_deviation",
  "intersperse",
  "parse_nested_parens",
  "filter_by_substring",
  "sum_product",
  "rolling_max",
  "make_palindrome",
  "string_xor",
  "longest",
  "greatest_common_divisor",
  "all_prefixes",
];

// ── Types ──

export interface ContaminationFinding {
  type: "secret" | "pii" | "benchmark";
  name: string;
  line: string;
  pairIndex: number;
}

export interface ContaminationResult {
  pass: boolean;
  secretCount: number;
  piiCount: number;
  benchmarkCount: number;
  totalFindings: number;
  findings: ContaminationFinding[];
  /** Score penalty to apply (negative number) */
  scorePenalty: number;
}

// ── Scanner functions ──

export function secretScan(text: string): Array<{ name: string }> {
  const hits: Array<{ name: string }> = [];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(text)) {
      hits.push({ name: pattern.name });
    }
  }
  return hits;
}

export function piiScan(text: string): Array<{ name: string }> {
  const hits: Array<{ name: string }> = [];
  for (const pattern of PII_PATTERNS) {
    if (pattern.regex.test(text)) {
      hits.push({ name: pattern.name });
    }
  }
  return hits;
}

export function benchmarkSignatures(text: string): Array<{ name: string }> {
  const hits: Array<{ name: string }> = [];
  const lower = text.toLowerCase();
  for (const sig of BENCHMARK_SIGNATURES) {
    // Look for the function signature as a definition (def/function/fn) or standalone identifier
    if (lower.includes(sig)) {
      hits.push({ name: `HumanEval: ${sig}` });
    }
  }
  return hits;
}

// ── Main validation entry point ──

export function validateContamination(pairs: ParsedPair[]): ContaminationResult {
  const findings: ContaminationFinding[] = [];
  // Cap sample findings to avoid huge reports
  const MAX_FINDINGS = 50;

  for (let i = 0; i < pairs.length; i++) {
    const text = pairs[i].text || pairs[i].instruction || "";
    if (!text) continue;

    // Secrets
    const secrets = secretScan(text);
    for (const s of secrets) {
      if (findings.length < MAX_FINDINGS) {
        const preview = text.slice(0, 120).replace(/\n/g, " ");
        findings.push({ type: "secret", name: s.name, line: preview, pairIndex: i });
      }
    }

    // PII
    const pii = piiScan(text);
    for (const p of pii) {
      if (findings.length < MAX_FINDINGS) {
        const preview = text.slice(0, 120).replace(/\n/g, " ");
        findings.push({ type: "pii", name: p.name, line: preview, pairIndex: i });
      }
    }

    // Benchmark signatures
    const benchmarks = benchmarkSignatures(text);
    for (const b of benchmarks) {
      if (findings.length < MAX_FINDINGS) {
        const preview = text.slice(0, 120).replace(/\n/g, " ");
        findings.push({ type: "benchmark", name: b.name, line: preview, pairIndex: i });
      }
    }
  }

  const secretCount = findings.filter((f) => f.type === "secret").length;
  const piiCount = findings.filter((f) => f.type === "pii").length;
  const benchmarkCount = findings.filter((f) => f.type === "benchmark").length;
  const totalFindings = findings.length;

  // Hard penalties: -10 per secret, -5 per PII, -15 per benchmark leak
  const scorePenalty = -(secretCount * 10 + piiCount * 5 + benchmarkCount * 15);

  // Pass only if zero findings
  const pass = totalFindings === 0;

  return {
    pass,
    secretCount,
    piiCount,
    benchmarkCount,
    totalFindings,
    findings,
    scorePenalty,
  };
}
