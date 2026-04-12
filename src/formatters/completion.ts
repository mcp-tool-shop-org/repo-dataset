/** Completion formatter — raw text for language modeling, no instruction wrapping */

import type { Formatter, ExtractedPair } from "../types.js";

export class CompletionFormatter implements Formatter {
  name = "completion";

  formatPair(pair: ExtractedPair): string {
    // For completion format, the "output" IS the training text when it's code
    // For non-code sources, concatenate instruction context + output
    const text = pair.metadata.signal_type === "implementation" ||
                 pair.metadata.signal_type === "completion"
      ? pair.input || pair.output
      : [pair.instruction, pair.input, pair.output].filter(Boolean).join("\n\n");

    return JSON.stringify({ text, metadata: pair.metadata });
  }
}
