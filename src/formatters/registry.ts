/** Formatter registry — maps format names to instances */

import { AlpacaFormatter } from "./alpaca.js";
import { ShareGPTFormatter } from "./sharegpt.js";
import { OpenAIFormatter } from "./openai.js";
import { RawFormatter } from "./raw.js";
import type { Formatter, OutputFormat } from "../types.js";

const FORMATTERS: Record<OutputFormat, () => Formatter> = {
  alpaca: () => new AlpacaFormatter(),
  sharegpt: () => new ShareGPTFormatter(),
  openai: () => new OpenAIFormatter(),
  raw: () => new RawFormatter(),
};

export function getFormatter(format: OutputFormat): Formatter {
  return FORMATTERS[format]();
}

export function isValidFormat(format: string): format is OutputFormat {
  return format in FORMATTERS;
}

export function getAllFormats(): OutputFormat[] {
  return Object.keys(FORMATTERS) as OutputFormat[];
}
