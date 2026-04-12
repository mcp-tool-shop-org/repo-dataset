/** Deduplication — SHA-256 exact content hash */

import { createHash } from "node:crypto";
import type { ExtractedPair } from "../types.js";

export class Deduplicator {
  private seen = new Set<string>();

  isDuplicate(pair: ExtractedPair): boolean {
    const hash = createHash("sha256")
      .update(`${pair.instruction}\x00${pair.input}\x00${pair.output}`)
      .digest("hex");

    if (this.seen.has(hash)) return true;
    this.seen.add(hash);
    return false;
  }

  get count(): number {
    return this.seen.size;
  }
}
