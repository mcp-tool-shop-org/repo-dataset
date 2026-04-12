/** Alpaca JSONL formatter — instruction/input/output */

import type { Formatter, ExtractedPair } from "../types.js";

export class AlpacaFormatter implements Formatter {
  name = "alpaca";

  formatPair(pair: ExtractedPair): string {
    return JSON.stringify({
      instruction: pair.instruction,
      input: pair.input,
      output: pair.output,
    });
  }
}
