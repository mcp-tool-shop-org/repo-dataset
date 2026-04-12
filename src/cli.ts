#!/usr/bin/env node

/** repo-dataset CLI — convert repos to LLM training data */

import { readFileSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runPipeline, inspectPipeline } from "./pipeline/runner.js";
import { isGitRepo } from "./discovery/git.js";
import { isValidFormat, getAllFormats } from "./formatters/registry.js";
import { isValidExtractor, getAllExtractorNames } from "./extractors/registry.js";
import { getAutoBalanceConfig } from "./pipeline/balance.js";
import { runValidation } from "./validate/report.js";
import { runVisualPipeline, inspectVisualPipeline } from "./visual/runner.js";
import { isValidVisualFormat, getAllVisualFormats } from "./visual/formatters.js";
import { RepoDatasetError, ErrorCodes } from "./errors.js";
import type { PipelineConfig, OutputFormat, ExtractorName, BalanceConfig, VisualPipelineConfig, VisualOutputFormat, VisualExtractorName } from "./types.js";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const PKG = JSON.parse(readFileSync(join(PKG_ROOT, "package.json"), "utf8"));

// ── Colors ──
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function log(msg: string) { console.log(msg); }
function ok(msg: string) { log(`${GREEN}\u2713${RESET} ${msg}`); }
function warn(msg: string) { log(`${YELLOW}\u26A0${RESET} ${msg}`); }

function fail(code: string, message: string, hint: string): never {
  if (hasFlag(process.argv.slice(2), "json")) {
    console.error(JSON.stringify({ code, message, hint }));
  } else {
    console.error(`${RED}Error [${code}]:${RESET} ${message}`);
    console.error(`${DIM}Hint: ${hint}${RESET}`);
  }
  process.exit(1);
}

// ── Arg parsing ──
function hasFlag(args: string[], flag: string): boolean {
  return args.includes(`--${flag}`);
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const prefix = `--${flag}=`;
  for (const a of args) {
    if (a.startsWith(prefix)) return a.slice(prefix.length);
  }
  const idx = args.indexOf(`--${flag}`);
  if (idx !== -1 && idx + 1 < args.length && !args[idx + 1].startsWith("--")) {
    return args[idx + 1];
  }
  return undefined;
}

function positionalArgs(args: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const hasEquals = args[i].includes("=");
      if (!hasEquals && i + 1 < args.length && !args[i + 1].startsWith("--")) {
        i++;
      }
    } else {
      result.push(args[i]);
    }
  }
  return result;
}

// ── Repo name detection ──
async function detectRepoName(repoPath: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["remote", "get-url", "origin"], { cwd: repoPath });
    const url = stdout.trim();
    // Extract org/name from https or ssh URL
    const match = url.match(/[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
    if (match) return match[1];
  } catch { /* no remote */ }
  return basename(repoPath);
}

// ── Commands ──
async function cmdGenerate(args: string[]): Promise<void> {
  const positional = positionalArgs(args);
  const repoPath = positional[0];

  if (!repoPath) {
    fail(ErrorCodes.REPO_NOT_FOUND, "No repository path provided", "Usage: repo-dataset generate <path> [--format alpaca]");
  }

  const resolved = resolve(repoPath);
  try { await stat(resolved); } catch {
    fail(ErrorCodes.REPO_NOT_FOUND, `Path not found: ${resolved}`, "Provide a valid path to a git repository");
  }

  if (!(await isGitRepo(resolved))) {
    fail(ErrorCodes.NOT_A_GIT_REPO, `Not a git repository: ${resolved}`, "The path must be a git repository");
  }

  const config = await buildConfig(resolved, args);

  if (!config.json) {
    log(`${BOLD}repo-dataset${RESET} v${PKG.version} generating training data...`);
    log(`${DIM}Repository: ${config.repoName}${RESET}`);
    log(`${DIM}Format: ${config.format} | Extractors: ${config.extractors.join(", ")}${RESET}`);
    if (config.balance) log(`${DIM}Balance: ${formatRatios(config.balance.ratios)}${RESET}`);
    log("");
  }

  const result = await runPipeline(config);

  if (config.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    ok(`Files scanned: ${result.totalFiles}`);
    ok(`Pairs extracted: ${result.pairsExtracted}`);
    ok(`After quality filter: ${result.pairsAfterFilter}`);
    ok(`Duplicates removed: ${result.duplicatesRemoved}`);
    if (config.balance) ok(`After balance: ${result.pairsAfterBalance}`);
    ok(`Total tokens: ~${result.totalTokens.toLocaleString()}`);
    ok(`Trainability: ${result.trainability}`);
    log("");

    log(`${CYAN}By extractor:${RESET}`);
    for (const [name, stats] of Object.entries(result.byExtractor)) {
      log(`  ${name.padEnd(10)} ${String(stats.pairs).padStart(4)} pairs  ${String(stats.pct).padStart(3)}%  quality: ${stats.avgQuality}`);
    }

    if (result.warnings.length > 0) {
      log("");
      for (const w of result.warnings) warn(w);
    }

    log("");
    ok(`Output: ${result.outputPath}`);
    if (result.manifestPath) ok(`Manifest: ${result.manifestPath}`);

    if (config.pipeToBackpropagate) {
      log("");
      log(`${YELLOW}Run fine-tuning:${RESET}`);
      log(`  backprop train --data ${result.outputPath} --steps 100`);
    }
  }
}

async function cmdInspect(args: string[]): Promise<void> {
  const positional = positionalArgs(args);
  const repoPath = positional[0];

  if (!repoPath) {
    fail(ErrorCodes.REPO_NOT_FOUND, "No repository path provided", "Usage: repo-dataset inspect <path>");
  }

  const resolved = resolve(repoPath);
  try { await stat(resolved); } catch {
    fail(ErrorCodes.REPO_NOT_FOUND, `Path not found: ${resolved}`, "Provide a valid path");
  }

  if (!(await isGitRepo(resolved))) {
    fail(ErrorCodes.NOT_A_GIT_REPO, `Not a git repository: ${resolved}`, "The path must be a git repository");
  }

  const config = await buildConfig(resolved, args);

  if (!config.json) {
    log(`${BOLD}repo-dataset${RESET} v${PKG.version} inspecting (dry run)...`);
    log("");
  }

  const result = await inspectPipeline(config);

  if (config.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    log(`  ${CYAN}Repository:${RESET} ${config.repoName} (${result.totalFiles} files)`);
    log("");
    log(`  ${CYAN}Signal Distribution:${RESET}`);
    log(`  ${"source".padEnd(10)} ${"pairs".padStart(5)}  ${"tokens".padStart(7)}  ${"share".padStart(5)}  ${"quality".padStart(7)}`);
    log(`  ${"─".repeat(48)}`);
    for (const [name, stats] of Object.entries(result.byExtractor)) {
      log(`  ${name.padEnd(10)} ${String(stats.pairs).padStart(5)}  ${String(stats.tokens).padStart(7)}  ${(stats.pct + "%").padStart(5)}  ${String(stats.avgQuality).padStart(7)}`);
    }
    log(`  ${"─".repeat(48)}`);
    log(`  ${"total".padEnd(10)} ${String(result.pairsAfterBalance).padStart(5)}  ${String(result.totalTokens).padStart(7)}`);
    log("");

    if (result.warnings.length > 0) {
      log(`  ${CYAN}Warnings:${RESET}`);
      for (const w of result.warnings) log(`  ${YELLOW}\u26A0${RESET} ${w}`);
      log("");
    }

    log(`  ${CYAN}Trainability:${RESET} ${result.trainability.toUpperCase()}`);

    if (!config.balance) {
      log("");
      log(`  ${DIM}Tip: use --auto-balance to control signal mix${RESET}`);
    }
  }
}

async function cmdValidate(args: string[]): Promise<void> {
  const positional = positionalArgs(args);
  const jsonlPath = positional[0];

  if (!jsonlPath) {
    fail("MISSING_PATH", "No JSONL file path provided", "Usage: repo-dataset validate <path-to-dataset.jsonl>");
  }

  const resolved = resolve(jsonlPath);
  try { await stat(resolved); } catch {
    fail("FILE_NOT_FOUND", `File not found: ${resolved}`, "Provide a valid path to a .jsonl file");
  }

  if (!resolved.endsWith(".jsonl")) {
    fail("INVALID_FILE", "Expected a .jsonl file", "The validate command reads generated dataset.jsonl files");
  }

  const report = await runValidation(resolved);

  if (hasFlag(args, "json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  log(`${BOLD}DATASET QUALITY REPORT${RESET}`);
  log("═".repeat(52));
  log("");
  log(`  Pairs: ${report.totalPairs}  |  Tokens: ~${report.totalTokens.toLocaleString()}`);
  log("");

  // Structural
  const sIcon = report.structural.pass ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
  log(`${CYAN}STRUCTURAL INTEGRITY${RESET}                      ${sIcon}`);
  log(`  JSONL validity .............. ${report.structural.validLines}/${report.structural.totalLines}`);
  log(`  Empty fields ................ ${report.structural.emptyFields}`);
  log(`  Encoding errors ............. ${report.structural.encodingErrors}`);
  log("");

  // Distribution
  const dIcon = report.distribution.pass ? `${GREEN}PASS${RESET}` : `${YELLOW}WARN${RESET}`;
  log(`${CYAN}DISTRIBUTION HEALTH${RESET}                       ${dIcon}`);
  const ts = report.distribution.tokenStats;
  log(`  Token length (mean/med/std) . ${ts.mean} / ${ts.median} / ${ts.stddev}`);
  log(`  Length CV ................... ${ts.cv}`);
  log(`  Percentiles: P10=${ts.p10}  P50=${ts.p50}  P90=${ts.p90}`);
  log(`  Source entropy .............. ${report.distribution.sourceEntropy} / ${report.distribution.sourceEntropyMax}`);
  if (report.distribution.dominantSource) {
    warn(`Dominant source: ${report.distribution.dominantSource}`);
  }
  log("");

  // Content
  const cIcon = report.content.pass ? `${GREEN}PASS${RESET}` : `${YELLOW}WARN${RESET}`;
  log(`${CYAN}CONTENT QUALITY${RESET}                           ${cIcon}`);
  log(`  Exact duplicates ............ ${report.content.exactDuplicates}`);
  log(`  Near-duplicates (10-gram) ... ${report.content.nearDuplicatePct}%`);
  log(`  Vocabulary richness (TTR) ... ${report.content.vocabularyTTR}`);
  log(`  Instruction diversity ....... ${report.content.instructionDiversityPct}%`);
  log(`  Trivial pairs ............... ${report.content.trivialPairPct}%`);
  log(`  Unique source files ......... ${report.content.uniqueSourceFiles}`);
  log("");

  // Score
  log(`${CYAN}SCORE${RESET}  ${BOLD}${report.scoring.score}/100  Grade: ${report.scoring.grade}${RESET}`);
  log(`  Trainability: ${report.scoring.trainability}`);
}

async function cmdVisualGenerate(args: string[]): Promise<void> {
  const positional = positionalArgs(args);
  const repoPath = positional[0];

  if (!repoPath) {
    fail("MISSING_PATH", "No repository path provided", "Usage: repo-dataset visual generate <path>");
  }

  const resolved = resolve(repoPath);
  try { await stat(resolved); } catch {
    fail(ErrorCodes.REPO_NOT_FOUND, `Path not found: ${resolved}`, "Provide a valid path to a visual repo");
  }

  const config = buildVisualConfig(resolved, args);

  if (!hasFlag(args, "json")) {
    log(`${BOLD}repo-dataset${RESET} v${PKG.version} visual generate...`);
    log(`${DIM}Repository: ${config.repoName} | Format: ${config.format}${RESET}`);
    log("");
  }

  const result = await runVisualPipeline(config);

  if (hasFlag(args, "json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    ok(`Structure: ${result.structureTier}`);
    ok(`Assets found: ${result.totalAssets}`);
    ok(`Records linked: ${result.yield.assetsWithRecords} (${Math.round(result.yield.recordCoverage * 100)}%)`);
    log("");
    log(`${CYAN}Training units:${RESET}`);
    log(`  classification .... ${result.classificationPairs}`);
    log(`  preference ........ ${result.preferencePairs}`);
    log(`  critique .......... ${result.critiquePairs}`);
    log(`  total ............. ${result.totalTrainingUnits}`);
    log("");
    ok(`Trainability: ${result.trainability}`);

    if (result.warnings.length > 0) {
      log("");
      for (const w of result.warnings) warn(w);
    }

    log("");
    ok(`Output: ${result.outputPath}`);
    if (result.manifestPath) ok(`Manifest: ${result.manifestPath}`);
  }
}

async function cmdVisualInspect(args: string[]): Promise<void> {
  const positional = positionalArgs(args);
  const repoPath = positional[0];

  if (!repoPath) {
    fail("MISSING_PATH", "No path provided", "Usage: repo-dataset visual inspect <path>");
  }

  const resolved = resolve(repoPath);
  try { await stat(resolved); } catch {
    fail(ErrorCodes.REPO_NOT_FOUND, `Path not found: ${resolved}`, "Provide a valid path");
  }

  const config = buildVisualConfig(resolved, args);

  if (!hasFlag(args, "json")) {
    log(`${BOLD}repo-dataset${RESET} v${PKG.version} visual inspect (dry run)...`);
    log("");
  }

  const result = await inspectVisualPipeline(config);

  if (hasFlag(args, "json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    log(`  ${CYAN}Repository:${RESET} ${config.repoName} (${result.structureTier})`);
    log("");
    log(`  ${CYAN}Assets:${RESET}`);
    log(`  total found ............. ${result.totalAssets}`);
    log(`  with records ............ ${result.yield.assetsWithRecords}  (${Math.round(result.yield.recordCoverage * 100)}%)`);
    log(`  with status ............. ${result.yield.assetsWithStatus}`);
    log(`  in comparisons .......... ${result.yield.assetsInComparisons}`);
    log(`  with canon links ........ ${result.yield.assetsWithCanonLinks}`);
    log(`  orphan .................. ${result.yield.orphanAssets}  (${Math.round(result.yield.wasteRate * 100)}%)`);
    log("");
    log(`  ${CYAN}Comparisons:${RESET}`);
    log(`  explicit (human) ........ ${result.yield.explicitComparisons}`);
    log(`  synthetic (from status) . ${result.yield.syntheticComparisons}`);
    log("");
    log(`  ${CYAN}Extraction yield:${RESET}`);
    log(`  classification pairs .... ${result.classificationPairs}`);
    log(`  preference pairs ........ ${result.preferencePairs}`);
    log(`  critique pairs .......... ${result.critiquePairs}`);
    log(`  total training units .... ${result.totalTrainingUnits}`);
    log("");
    log(`  ${CYAN}Trainability:${RESET} ${result.trainability.toUpperCase()}`);

    if (result.warnings.length > 0) {
      log("");
      for (const w of result.warnings) warn(w);
    }
  }
}

function buildVisualConfig(repoPath: string, args: string[]): VisualPipelineConfig {
  const format = getFlagValue(args, "format") || "visual_universal";
  if (!isValidVisualFormat(format)) {
    fail("INVALID_FORMAT", `Invalid visual format: ${format}`, `Valid: ${getAllVisualFormats().join(", ")}`);
  }

  const extractorStr = getFlagValue(args, "extractors") || "asset_record,comparison,constitution";
  const extractors = extractorStr.split(",").map((s) => s.trim()) as VisualExtractorName[];

  return {
    repoPath,
    repoName: getFlagValue(args, "repo-name") || basename(repoPath),
    outputDir: getFlagValue(args, "output") || "./dataset-output",
    format: format as VisualOutputFormat,
    extractors,
    generateSyntheticPairs: !hasFlag(args, "no-synthetic"),
    json: hasFlag(args, "json"),
    embed: hasFlag(args, "embed"),
    allowIncomplete: hasFlag(args, "allow-incomplete"),
    copyImages: !hasFlag(args, "no-copy-images"),
  };
}

function cmdInfo(): void {
  log(`${BOLD}repo-dataset${RESET} v${PKG.version}`);
  log("");
  log(`${CYAN}Output formats:${RESET}`);
  log("  alpaca       Instruction/input/output (fine-tuning)");
  log("  sharegpt     Multi-turn conversations");
  log("  openai       OpenAI messages format");
  log("  raw          Text + metadata (pre-training / RAG)");
  log("  completion   Raw code as text (language modeling)");
  log("  fim          Fill-in-the-middle (StarCoder tokens)");
  log("");
  log(`${CYAN}Extractors:${RESET}`);
  log("  code         Function/class extraction with import context");
  log("  commits      Change explanation pairs from git history");
  log("  docs         Section-based pairs from markdown");
  log("  tests        Code-to-test generation pairs");
  log("");
  log(`${CYAN}Balance:${RESET}`);
  log("  --auto-balance             Sensible defaults (code:3,tests:2,commits:1,docs:1)");
  log("  --balance code:3,docs:1    Custom ratios");
  log("  --max-pairs docs:50        Hard cap per source");
  log("");
  log(`${CYAN}Visual formats:${RESET}`);
  log("  visual_universal    Superset (converts to LLaVA/Qwen-VL/InternVL/TRL)");
  log("  visual_dpo          DPO preference pairs (chosen/rejected)");
  log("  visual_kto          KTO unpaired labels (approved=true, rejected=false)");
  log("  visual_contrastive  CLIP-style positive/negative pairs");
  log("  visual_pointwise    Per-asset quality scores");
  log("");
  log(`${CYAN}Visual extractors:${RESET}`);
  log("  asset_record    Image + structured record → classification, critique");
  log("  comparison      A vs B judgments → DPO preference pairs");
  log("  constitution    Asset + rubric → grounded critique with rule citations");
  log("  set_coherence   Grouped assets → coherence judgments");
}

function printHelp(): void {
  log(`${BOLD}repo-dataset${RESET} v${PKG.version}`);
  log("Convert any git repository into LLM training datasets");
  log("");
  log(`${CYAN}Commands:${RESET}`);
  log("  generate <path>          Generate training data from a code repository");
  log("  inspect <path>           Preview extraction without writing (dry run)");
  log("  visual generate <path>   Generate training data from a visual style repo");
  log("  visual inspect <path>    Preview visual extraction (dry run)");
  log("  validate <jsonl>         Quality report on a generated dataset");
  log("  info                     Show supported formats and extractors");
  log("");
  log(`${CYAN}Flags:${RESET}`);
  log("  --format <fmt>              Output: alpaca, sharegpt, openai, raw, completion, fim");
  log("  --output <dir>              Output directory (default: ./dataset-output)");
  log("  --extractors <list>         Comma-separated extractors (default: all)");
  log("  --max-tokens <n>            Max tokens per example (default: 2048)");
  log("  --min-tokens <n>            Min tokens per example (default: 20)");
  log("  --commits <n>               Max commits to process (default: 100)");
  log("  --include <glob>            Include only matching files");
  log("  --exclude <glob>            Exclude matching files");
  log("  --balance <ratios>          Signal balance (e.g., code:3,docs:1,tests:2)");
  log("  --auto-balance              Apply sensible balance defaults");
  log("  --max-pairs <src:n,...>      Hard cap per source");
  log("  --fim-rate <0-1>            FIM transform probability (default: 0.5)");
  log("  --pipe-to-backpropagate     Print backprop command after generation");
  log("  --json                      JSON output for automation");
  log("  --help                      Show this help");
  log("  --version                   Show version");
}

// ── Config ──
async function buildConfig(repoPath: string, args: string[]): Promise<PipelineConfig> {
  const format = getFlagValue(args, "format") || "alpaca";
  if (!isValidFormat(format)) {
    fail(ErrorCodes.INVALID_FORMAT, `Invalid format: ${format}`, `Valid formats: ${getAllFormats().join(", ")}`);
  }

  const extractorStr = getFlagValue(args, "extractors") || "code,commits,docs,tests";
  const extractorNames = extractorStr.split(",").map((s) => s.trim());
  for (const name of extractorNames) {
    if (!isValidExtractor(name)) {
      fail(ErrorCodes.INVALID_EXTRACTOR, `Invalid extractor: ${name}`, `Valid: ${getAllExtractorNames().join(", ")}`);
    }
  }

  // Balance config
  let balance: BalanceConfig | null = null;
  if (hasFlag(args, "auto-balance")) {
    balance = getAutoBalanceConfig();
  }
  const balanceStr = getFlagValue(args, "balance");
  if (balanceStr) {
    balance = parseBalanceRatios(balanceStr);
  }
  const maxPairsStr = getFlagValue(args, "max-pairs");
  if (maxPairsStr && balance) {
    balance.maxPairs = parsePairCounts(maxPairsStr);
  } else if (maxPairsStr) {
    balance = { ratios: {}, maxPairs: parsePairCounts(maxPairsStr), minPairs: {} };
  }

  const repoName = getFlagValue(args, "repo-name") || await detectRepoName(repoPath);

  const includeStr = getFlagValue(args, "include");
  const excludeStr = getFlagValue(args, "exclude");

  return {
    repoPath,
    repoName,
    outputDir: getFlagValue(args, "output") || "./dataset-output",
    format: format as OutputFormat,
    extractors: extractorNames as ExtractorName[],
    maxTokens: parseInt(getFlagValue(args, "max-tokens") || "2048", 10),
    minTokens: parseInt(getFlagValue(args, "min-tokens") || "20", 10),
    maxCommits: parseInt(getFlagValue(args, "commits") || "100", 10),
    include: includeStr ? includeStr.split(",") : [],
    exclude: excludeStr ? excludeStr.split(",") : [],
    pipeToBackpropagate: hasFlag(args, "pipe-to-backpropagate"),
    json: hasFlag(args, "json"),
    balance,
    fimRate: parseFloat(getFlagValue(args, "fim-rate") || "0.5"),
    fimSpmRate: parseFloat(getFlagValue(args, "fim-spm-rate") || "0.5"),
  };
}

function parseBalanceRatios(str: string): BalanceConfig {
  const ratios: Partial<Record<ExtractorName, number>> = {};
  for (const part of str.split(",")) {
    const [name, val] = part.split(":");
    if (name && val) ratios[name.trim() as ExtractorName] = parseInt(val, 10);
  }
  return { ratios, maxPairs: {}, minPairs: {} };
}

function parsePairCounts(str: string): Partial<Record<ExtractorName, number>> {
  const counts: Partial<Record<ExtractorName, number>> = {};
  for (const part of str.split(",")) {
    const [name, val] = part.split(":");
    if (name && val) counts[name.trim() as ExtractorName] = parseInt(val, 10);
  }
  return counts;
}

function formatRatios(ratios: Partial<Record<ExtractorName, number>>): string {
  return Object.entries(ratios).map(([k, v]) => `${k}:${v}`).join(", ");
}

// ── Main ──
const args = process.argv.slice(2);
const command = positionalArgs(args)[0] || "help";
const commandArgs = args.slice(args.indexOf(command) + 1);

if (hasFlag(args, "version") || command === "--version" || command === "-V") {
  log(`repo-dataset ${PKG.version}`);
  process.exit(0);
}

if (hasFlag(args, "help") || command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

try {
  switch (command) {
    case "generate":
      await cmdGenerate(commandArgs);
      break;
    case "inspect":
      await cmdInspect(commandArgs);
      break;
    case "visual": {
      const subCommand = positionalArgs(commandArgs)[0];
      const visualArgs = commandArgs.slice(commandArgs.indexOf(subCommand) + 1);
      if (subCommand === "generate") {
        await cmdVisualGenerate(visualArgs);
      } else if (subCommand === "inspect") {
        await cmdVisualInspect(visualArgs);
      } else {
        fail(ErrorCodes.UNKNOWN_COMMAND, `Unknown visual subcommand: ${subCommand}`, "Usage: repo-dataset visual generate|inspect <path>");
      }
      break;
    }
    case "validate":
      await cmdValidate(commandArgs);
      break;
    case "info":
      cmdInfo();
      break;
    default:
      fail(ErrorCodes.UNKNOWN_COMMAND, `Unknown command: ${command}`, "Run 'repo-dataset help' to see available commands");
  }
} catch (err) {
  if (err instanceof RepoDatasetError) {
    fail(err.code, err.message, err.hint);
  }
  throw err;
}
