/** Formatter registry — maps format names to instances */

import { AlpacaFormatter } from "./alpaca.js";
import { ShareGPTFormatter } from "./sharegpt.js";
import { OpenAIFormatter } from "./openai.js";
import { ChatMLFormatter } from "./chatml.js";
import { RawFormatter } from "./raw.js";
import { CompletionFormatter } from "./completion.js";
import { FimFormatter } from "./fim.js";
import { OUTPUT_FORMATS } from "../types.js";
import type { Formatter, OutputFormat } from "../types.js";

export interface FormatterOptions {
  fimRate?: number;
  fimSpmRate?: number;
  includeMetadata?: boolean;
}

export function getFormatter(format: OutputFormat, fimRate = 0.5, fimSpmRate = 0.5, opts?: FormatterOptions): Formatter {
  const includeMetadata = opts?.includeMetadata ?? false;

  let formatter: Formatter;
  switch (format) {
    case "alpaca": formatter = new AlpacaFormatter(); break;
    case "sharegpt": formatter = new ShareGPTFormatter(); break;
    case "openai": formatter = new OpenAIFormatter(); break;
    case "chatml": formatter = new ChatMLFormatter(); break;
    case "raw": formatter = new RawFormatter(); break;
    case "completion": formatter = new CompletionFormatter(); break;
    case "fim": formatter = new FimFormatter(fimRate, fimSpmRate, 42); break;
  }

  if (includeMetadata) {
    formatter.includeMetadata = true;
  }

  return formatter;
}

export function isValidFormat(format: string): format is OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(format);
}

export function getAllFormats(): OutputFormat[] {
  return [...OUTPUT_FORMATS];
}
