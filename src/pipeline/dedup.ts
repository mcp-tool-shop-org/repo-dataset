/** Deduplication — SHA-256 exact content hash + MinHash near-dedup with LSH */

import { createHash } from "node:crypto";
import type { ExtractedPair } from "../types.js";

// ── MinHash internals (zero deps) ──

const NUM_HASHES = 64;
const NUM_BANDS = 8;
const ROWS_PER_BAND = NUM_HASHES / NUM_BANDS; // 8

/** Large prime for polynomial hashing */
const PRIME = 2_147_483_647; // 2^31 - 1 (Mersenne prime)

/**
 * Polynomial hash with a given seed.
 * Produces a 32-bit unsigned integer from a string.
 */
function polyHash(str: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  }
  // Force unsigned
  return h >>> 0;
}

/** 64 distinct prime seeds for the hash family */
const SEEDS: number[] = (() => {
  const primes: number[] = [];
  let candidate = 1000003;
  while (primes.length < NUM_HASHES) {
    let isPrime = true;
    const limit = Math.sqrt(candidate);
    for (let i = 2; i <= limit; i++) {
      if (candidate % i === 0) { isPrime = false; break; }
    }
    if (isPrime) primes.push(candidate);
    candidate += 2;
  }
  return primes;
})();

/** Extract whitespace-split character 3-grams (shingles) from text */
function shingleize(text: string): Set<string> {
  const tokens = text.split(/\s+/).filter(t => t.length > 0);
  const shingles = new Set<string>();
  for (let i = 0; i <= tokens.length - 3; i++) {
    shingles.add(tokens[i] + " " + tokens[i + 1] + " " + tokens[i + 2]);
  }
  // Fallback: if text is too short for 3-grams, use individual tokens
  if (shingles.size === 0) {
    for (const t of tokens) shingles.add(t);
  }
  return shingles;
}

/** Compute MinHash signature (array of NUM_HASHES minimum hash values) */
function computeSignature(shingles: Set<string>): Uint32Array {
  const sig = new Uint32Array(NUM_HASHES);
  sig.fill(0xFFFFFFFF); // initialize to max

  for (const shingle of shingles) {
    for (let i = 0; i < NUM_HASHES; i++) {
      const h = polyHash(shingle, SEEDS[i]);
      if (h < sig[i]) sig[i] = h;
    }
  }
  return sig;
}

/** Estimate Jaccard similarity from two MinHash signatures */
function signatureSimilarity(a: Uint32Array, b: Uint32Array): number {
  let matches = 0;
  for (let i = 0; i < NUM_HASHES; i++) {
    if (a[i] === b[i]) matches++;
  }
  return matches / NUM_HASHES;
}

/** Hash a band (sub-slice of signature) into a bucket key */
function bandKey(sig: Uint32Array, bandIndex: number): string {
  const start = bandIndex * ROWS_PER_BAND;
  let key = "";
  for (let i = start; i < start + ROWS_PER_BAND; i++) {
    key += sig[i].toString(36) + "|";
  }
  return key;
}

// ── Public API ──

export class Deduplicator {
  private seen = new Set<string>();
  private threshold: number;

  // MinHash state
  private signatures: Uint32Array[] = [];
  private lshBuckets: Map<string, number[]>[] = [];

  private exactCount = 0;
  private nearCount = 0;

  constructor(threshold = 0.8) {
    this.threshold = threshold;
    // Initialize one bucket map per band
    for (let b = 0; b < NUM_BANDS; b++) {
      this.lshBuckets.push(new Map());
    }
  }

  /**
   * Check if a pair is a duplicate (exact or near-duplicate).
   * Returns true if duplicate, false if unique.
   */
  isDuplicate(pair: ExtractedPair): boolean {
    // --- Pass 1: exact SHA-256 dedup ---
    const key = pair.metadata.id || createHash("sha256")
      .update(`${pair.instruction}\x00${pair.input}\x00${pair.output}`)
      .digest("hex");

    if (this.seen.has(key)) {
      this.exactCount++;
      return true;
    }
    this.seen.add(key);

    // --- Pass 2: MinHash near-dedup ---
    const content = `${pair.instruction} ${pair.input} ${pair.output}`;
    const shingles = shingleize(content);

    // Very short content can't meaningfully be near-deduped
    if (shingles.size < 3) {
      this.indexSignature(computeSignature(shingles));
      return false;
    }

    const sig = computeSignature(shingles);

    // LSH: check candidate pairs from band buckets
    const candidateIndices = new Set<number>();
    for (let b = 0; b < NUM_BANDS; b++) {
      const bk = bandKey(sig, b);
      const bucket = this.lshBuckets[b].get(bk);
      if (bucket) {
        for (const idx of bucket) candidateIndices.add(idx);
      }
    }

    // Check candidates against threshold
    for (const idx of candidateIndices) {
      const sim = signatureSimilarity(sig, this.signatures[idx]);
      if (sim >= this.threshold) {
        this.nearCount++;
        return true;
      }
    }

    // Not a duplicate — index this signature
    this.indexSignature(sig);
    return false;
  }

  /** Add a signature to the LSH index */
  private indexSignature(sig: Uint32Array): void {
    const idx = this.signatures.length;
    this.signatures.push(sig);
    for (let b = 0; b < NUM_BANDS; b++) {
      const bk = bandKey(sig, b);
      const bucket = this.lshBuckets[b].get(bk);
      if (bucket) {
        bucket.push(idx);
      } else {
        this.lshBuckets[b].set(bk, [idx]);
      }
    }
  }

  get count(): number {
    return this.seen.size;
  }

  getStats(): { exact: number; near: number } {
    return { exact: this.exactCount, near: this.nearCount };
  }
}
