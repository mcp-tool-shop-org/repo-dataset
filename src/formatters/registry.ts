/** Formatter registry — maps format names to instances */

import { AlpacaFormatter } from "./alpaca.js";
import { ShareGPTFormatter } from "./sharegpt.js";
import { OpenAIFormatter } from "./openai.js";
import { RawFormatter } from "./raw.js";
import { CompletionFormatter } from "./completion.js";
import { FimFormatter } from "./fim.js";
import type { Formatter, OutputFormat } from "../types.js";

export function getFormatter(format: OutputFormat, fimRate = 0.5, fimSpmRate = 0.5): Formatter {
  switch (format) {
    case "alpaca": return new AlpacaFormatter();
    case "sharegpt": return new ShareGPTFormatter();
    case "openai": return new OpenAIFormatter();
    case "raw": return new RawFormatter();
    case "completion": return new CompletionFormatter();
    case "fim": return new FimFormatter(fimRate, fimSpmRate, 42);
  }
}

export function isValidFormat(format: string): format is OutputFormat {
  return ["alpaca", "sharegpt", "openai", "raw", "completion", "fim"].includes(format);
}

export function getAllFormats(): OutputFormat[] {
  return ["alpaca", "sharegpt", "openai", "raw", "completion", "fim"];
}
