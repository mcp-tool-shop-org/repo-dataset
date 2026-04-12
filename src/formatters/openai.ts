/** OpenAI messages JSONL formatter */

import type { Formatter, ExtractedPair } from "../types.js";

export class OpenAIFormatter implements Formatter {
  name = "openai";

  formatPair(pair: ExtractedPair): string {
    const messages = [
      { role: "user", content: pair.input ? `${pair.instruction}\n\n${pair.input}` : pair.instruction },
      { role: "assistant", content: pair.output },
    ];
    return JSON.stringify({ messages });
  }
}
