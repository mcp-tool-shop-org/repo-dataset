/** ShareGPT JSONL formatter — conversations array */

import type { Formatter, ExtractedPair } from "../types.js";

export class ShareGPTFormatter implements Formatter {
  name = "sharegpt";

  formatPair(pair: ExtractedPair): string {
    const conversations = [
      { from: "human", value: pair.input ? `${pair.instruction}\n\n${pair.input}` : pair.instruction },
      { from: "gpt", value: pair.output },
    ];
    return JSON.stringify({ conversations });
  }
}
