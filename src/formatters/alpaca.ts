/** Alpaca JSONL formatter — instruction/input/output */

import type { Formatter, ExtractedPair } from "../types.js";

export class AlpacaFormatter implements Formatter {
  name = "alpaca";
  includeMetadata = false;

  formatPair(pair: ExtractedPair): string {
    const obj: Record<string, unknown> = {
      instruction: pair.instruction,
      input: pair.input,
      output: pair.output,
    };
    if (this.includeMetadata) {
      obj.metadata = pair.metadata;
    }
    return JSON.stringify(obj);
  }
}
