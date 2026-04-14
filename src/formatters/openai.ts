/** OpenAI messages JSONL formatter */

import type { Formatter, ExtractedPair } from "../types.js";

export class OpenAIFormatter implements Formatter {
  name = "openai";
  includeMetadata = false;

  formatPair(pair: ExtractedPair): string {
    const messages = [
      { role: "user", content: pair.input ? `${pair.instruction}\n\n${pair.input}` : pair.instruction },
      { role: "assistant", content: pair.output },
    ];
    const obj: Record<string, unknown> = { messages };
    if (this.includeMetadata) {
      obj.metadata = pair.metadata;
    }
    return JSON.stringify(obj);
  }
}
