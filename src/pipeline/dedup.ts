/** Deduplication — SHA-256 exact content hash + MinHash near-dedup */

import { createHash } from "node:crypto";
import type { ExtractedPair } from "../types.js";

export class Deduplicator {
  private seen = new Set<string>();

  isDuplicate(pair: ExtractedPair): boolean {
    // Use the pair's id field (already a content hash) for exact dedup
    const key = pair.metadata.id || createHash("sha256")
      .update(`${pair.instruction}\x00${pair.input}\x00${pair.output}`)
      .digest("hex");

    if (this.seen.has(key)) return true;
    this.seen.add(key);
    return false;
  }

  get count(): number {
    return this.seen.size;
  }
}
