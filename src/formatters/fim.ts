/** FIM (fill-in-the-middle) formatter — StarCoder sentinel tokens */

import type { Formatter, ExtractedPair } from "../types.js";

const FIM_PREFIX = "<fim_prefix>";
const FIM_SUFFIX = "<fim_suffix>";
const FIM_MIDDLE = "<fim_middle>";

export class FimFormatter implements Formatter {
  name = "fim";
  private fimRate: number;
  private spmRate: number;
  private rng: () => number;

  constructor(fimRate = 0.5, spmRate = 0.5, seed?: number) {
    this.fimRate = fimRate;
    this.spmRate = spmRate;
    // Simple seeded PRNG for reproducibility
    this.rng = seed !== undefined ? seededRandom(seed) : Math.random;
  }

  formatPair(pair: ExtractedPair): string {
    // Get the code text
    const code = pair.metadata.signal_type === "implementation" ||
                 pair.metadata.signal_type === "completion"
      ? (pair.input || pair.output)
      : [pair.instruction, pair.input, pair.output].filter(Boolean).join("\n\n");

    // Apply FIM transform with configured probability
    const text = this.rng() < this.fimRate
      ? this.applyFim(code)
      : code;

    return JSON.stringify({ text, metadata: pair.metadata });
  }

  private applyFim(code: string): string {
    const lines = code.split("\n");
    if (lines.length < 3) return code; // Too short for meaningful FIM

    // Pick two random split points (at line boundaries for readability)
    const point1 = Math.floor(this.rng() * (lines.length - 2)) + 1;
    const point2 = Math.floor(this.rng() * (lines.length - point1 - 1)) + point1 + 1;

    const prefix = lines.slice(0, point1).join("\n");
    const middle = lines.slice(point1, point2).join("\n");
    const suffix = lines.slice(point2).join("\n");

    // SPM (suffix-prefix-middle) or PSM (prefix-suffix-middle)
    if (this.rng() < this.spmRate) {
      // SPM ordering
      return `${FIM_PREFIX}${FIM_SUFFIX}${suffix}\n${FIM_MIDDLE}${prefix}\n${middle}`;
    } else {
      // PSM ordering (standard)
      return `${FIM_PREFIX}${prefix}\n${FIM_SUFFIX}${suffix}\n${FIM_MIDDLE}${middle}`;
    }
  }
}

/** Simple mulberry32 seeded PRNG */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
