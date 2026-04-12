/** Structural validation — JSONL parsing, schema, encoding checks */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export interface StructuralResult {
  pass: boolean;
  totalLines: number;
  validLines: number;
  emptyFields: number;
  encodingErrors: number;
  truncatedLines: number;
  oversizedLines: number;
}

export async function validateStructural(jsonlPath: string): Promise<StructuralResult> {
  const rl = createInterface({ input: createReadStream(jsonlPath, "utf-8") });

  let totalLines = 0;
  let validLines = 0;
  let emptyFields = 0;
  let encodingErrors = 0;
  let truncatedLines = 0;
  let oversizedLines = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    totalLines++;

    // Check for encoding issues (null bytes, control chars)
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(line)) {
      encodingErrors++;
      continue;
    }

    // Check for oversized lines (>500KB = likely a file that wasn't chunked)
    if (line.length > 500_000) {
      oversizedLines++;
      continue;
    }

    // Parse JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
      validLines++;
    } catch {
      continue;
    }

    // Check for required fields based on format
    if ("instruction" in parsed) {
      // Alpaca/instruction format
      if (!parsed.instruction && !parsed.input) emptyFields++;
      if (!parsed.output && !parsed.input) emptyFields++;
    } else if ("text" in parsed) {
      // Completion/raw format
      if (!parsed.text || (parsed.text as string).trim() === "") emptyFields++;
    } else if ("messages" in parsed) {
      // OpenAI format
      if (!Array.isArray(parsed.messages) || (parsed.messages as unknown[]).length === 0) emptyFields++;
    } else if ("conversations" in parsed) {
      // ShareGPT format
      if (!Array.isArray(parsed.conversations) || (parsed.conversations as unknown[]).length === 0) emptyFields++;
    }

    // Truncation detection (ends mid-word without punctuation)
    const textContent = (parsed.text || parsed.output || "") as string;
    if (textContent.length > 50 && /\w$/.test(textContent) && !/[.!?;:}\])"'`]$/.test(textContent)) {
      truncatedLines++;
    }
  }

  const emptyPct = totalLines > 0 ? emptyFields / totalLines : 0;
  const pass = validLines === totalLines && emptyPct < 0.05 && encodingErrors === 0;

  return { pass, totalLines, validLines, emptyFields, encodingErrors, truncatedLines, oversizedLines };
}
