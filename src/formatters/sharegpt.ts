/** ShareGPT JSONL formatter — conversations array */

import type { Formatter, ExtractedPair } from "../types.js";

export class ShareGPTFormatter implements Formatter {
  name = "sharegpt";
  includeMetadata = false;

  formatPair(pair: ExtractedPair): string {
    const conversations = [
      { from: "human", value: pair.input ? `${pair.instruction}\n\n${pair.input}` : pair.instruction },
      { from: "gpt", value: pair.output },
    ];
    const obj: Record<string, unknown> = { conversations };
    if (this.includeMetadata) {
      obj.metadata = pair.metadata;
    }
    return JSON.stringify(obj);
  }
}
