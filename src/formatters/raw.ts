/** Raw text chunks formatter — text + metadata */

import type { Formatter, ExtractedPair } from "../types.js";

export class RawFormatter implements Formatter {
  name = "raw";

  formatPair(pair: ExtractedPair): string {
    const text = [pair.instruction, pair.input, pair.output]
      .filter(Boolean)
      .join("\n\n");
    return JSON.stringify({
      text,
      metadata: pair.metadata,
    });
  }
}
