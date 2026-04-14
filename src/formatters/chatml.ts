/** ChatML JSONL formatter — <|im_start|>/<|im_end|> delimited turns */

import type { Formatter, ExtractedPair } from "../types.js";

export class ChatMLFormatter implements Formatter {
  name = "chatml";
  includeMetadata = false;

  formatPair(pair: ExtractedPair): string {
    const userContent = pair.input
      ? `${pair.instruction}\n${pair.input}`
      : pair.instruction;

    const text = [
      "<|im_start|>system",
      "You are a coding assistant.",
      "<|im_end|>",
      "<|im_start|>user",
      userContent,
      "<|im_end|>",
      "<|im_start|>assistant",
      pair.output,
      "<|im_end|>"
    ].join("\n");

    const obj: Record<string, unknown> = { text };
    if (this.includeMetadata) {
      obj.metadata = pair.metadata;
    }
    return JSON.stringify(obj);
  }
}
