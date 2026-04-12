#!/usr/bin/env node

/** repo-dataset CLI — convert repos to LLM training data */

import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from "node:fs/promises";
import { runPipeline, inspectPipeline } from "./pipeline/runner.js";
import { isGitRepo } from "./discovery/git.js";
import { isValidFormat, getAllFormats } from "./formatters/registry.js";
import { isValidExtractor, getAllExtractorNames } from "./extractors/registry.js";
import { RepoDatasetError, ErrorCodes } from "./errors.js";
import type { PipelineConfig, OutputFormat, ExtractorName } from "./types.js";

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

function fail(code: string, message: string, hint: string): never {
  if (hasFlag(process.argv.slice(2), "json")) {
    console.error(JSON.stringify({ code, message, hint }));
  } else {
    console.error(`${RED}Error [${code}]:${RESET} ${message}`);
    console.error(`${DIM}Hint: ${hint}${RESET}`);
  }
  process.exit(1);
}

// ── Arg parsing helpers ──
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
      // Skip flag values
      const hasEquals = args[i].includes("=");
      if (!hasEquals && i + 1 < args.length && !args[i + 1].startsWith("--")) {
        i++; // skip next arg (it's the value)
      }
    } else {
      result.push(args[i]);
    }
  }
  return result;
}

// ── Commands ──
async function cmdGenerate(args: string[]): Promise<void> {
  const positional = positionalArgs(args);
  const repoPath = positional[0];

  if (!repoPath) {
    fail(ErrorCodes.REPO_NOT_FOUND, "No repository path provided", "Usage: repo-dataset generate <path> [--format alpaca]");
  }

  const resolved = resolve(repoPath);

  // Validate path exists
  try {
    await stat(resolved);
  } catch {
    fail(ErrorCodes.REPO_NOT_FOUND, `Path not found: ${resolved}`, "Provide a valid path to a git repository");
  }

  // Validate it's a git repo
  if (!(await isGitRepo(resolved))) {
    fail(ErrorCodes.NOT_A_GIT_REPO, `Not a git repository: ${resolved}`, "The path must be a git repository with a .git directory");
  }

  // Parse config from flags
  const config = buildConfig(resolved, args);

  if (!hasFlag(args, "json")) {
    log(`${BOLD}repo-dataset${RESET} generating training data...`);
    log(`${DIM}Repository: ${resolved}${RESET}`);
    log(`${DIM}Format: ${config.format} | Extractors: ${config.extractors.join(", ")}${RESET}`);
    log("");
  }

  const result = await runPipeline(config);

  if (hasFlag(args, "json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    ok(`Files scanned: ${result.totalFiles}`);
    ok(`Pairs extracted: ${result.pairsExtracted}`);
    ok(`After quality filter: ${result.pairsAfterFilter}`);
    ok(`Duplicates removed: ${result.duplicatesRemoved}`);
    ok(`Total tokens: ~${result.totalTokens.toLocaleString()}`);
    log("");
    log(`${CYAN}By extractor:${RESET}`);
    for (const [name, count] of Object.entries(result.byExtractor)) {
      log(`  ${name}: ${count} pairs`);
    }
    log("");
    ok(`Output: ${result.outputPath}`);

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

  try {
    await stat(resolved);
  } catch {
    fail(ErrorCodes.REPO_NOT_FOUND, `Path not found: ${resolved}`, "Provide a valid path to a git repository");
  }

  if (!(await isGitRepo(resolved))) {
    fail(ErrorCodes.NOT_A_GIT_REPO, `Not a git repository: ${resolved}`, "The path must be a git repository");
  }

  const config = buildConfig(resolved, args);

  if (!hasFlag(args, "json")) {
    log(`${BOLD}repo-dataset${RESET} inspecting (dry run)...`);
    log("");
  }

  const result = await inspectPipeline(config);

  if (hasFlag(args, "json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    ok(`Files found: ${result.totalFiles}`);
    ok(`Pairs that would be extracted: ${result.pairsExtracted}`);
    ok(`After quality filter: ${result.pairsAfterFilter}`);
    ok(`Duplicates that would be removed: ${result.duplicatesRemoved}`);
    ok(`Estimated tokens: ~${result.totalTokens.toLocaleString()}`);
    log("");
    log(`${CYAN}By extractor:${RESET}`);
    for (const [name, count] of Object.entries(result.byExtractor)) {
      log(`  ${name}: ${count} pairs`);
    }
  }
}

function cmdInfo(): void {
  log(`${BOLD}repo-dataset${RESET} v${PKG.version}`);
  log("");
  log(`${CYAN}Output formats:${RESET}`);
  for (const f of getAllFormats()) {
    log(`  ${f}`);
  }
  log("");
  log(`${CYAN}Extractors:${RESET}`);
  log("  code     — Function explanations, docstring pairs from source files");
  log("  commits  — Change explanations from git history");
  log("  docs     — Instruction/explanation pairs from markdown");
  log("  tests    — Code-to-test generation pairs");
  log("");
  log(`${CYAN}Prerequisites:${RESET}`);
  log("  git (must be on PATH)");
}

function printHelp(): void {
  log(`${BOLD}repo-dataset${RESET} v${PKG.version}`);
  log("Convert any git repository into LLM training datasets");
  log("");
  log(`${CYAN}Commands:${RESET}`);
  log("  generate <path>    Generate training data from a repository");
  log("  inspect <path>     Preview extraction without writing (dry run)");
  log("  info               Show supported formats and extractors");
  log("");
  log(`${CYAN}Flags:${RESET}`);
  log("  --format <fmt>           Output format: alpaca, sharegpt, openai, raw (default: alpaca)");
  log("  --output <dir>           Output directory (default: ./dataset-output)");
  log("  --extractors <list>      Comma-separated extractors (default: all)");
  log("  --max-tokens <n>         Max tokens per example (default: 2048)");
  log("  --min-tokens <n>         Min tokens per example (default: 20)");
  log("  --commits <n>            Max commits to process (default: 100)");
  log("  --include <glob>         Include only matching files");
  log("  --exclude <glob>         Exclude matching files");
  log("  --pipe-to-backpropagate  Print backprop command after generation");
  log("  --json                   JSON output for automation");
  log("  --help                   Show this help");
  log("  --version                Show version");
}

// ── Config builder ──
function buildConfig(repoPath: string, args: string[]): PipelineConfig {
  const format = getFlagValue(args, "format") || "alpaca";
  if (!isValidFormat(format)) {
    fail(ErrorCodes.INVALID_FORMAT, `Invalid format: ${format}`, `Valid formats: ${getAllFormats().join(", ")}`);
  }

  const extractorStr = getFlagValue(args, "extractors") || "code,commits,docs,tests";
  const extractorNames = extractorStr.split(",").map((s) => s.trim());
  for (const name of extractorNames) {
    if (!isValidExtractor(name)) {
      fail(ErrorCodes.INVALID_EXTRACTOR, `Invalid extractor: ${name}`, `Valid extractors: ${getAllExtractorNames().join(", ")}`);
    }
  }

  const includeStr = getFlagValue(args, "include");
  const excludeStr = getFlagValue(args, "exclude");

  return {
    repoPath,
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
  };
}

// ── Main dispatch ──
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
