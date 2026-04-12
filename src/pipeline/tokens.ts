/** Token estimation — 4 chars per token approximation */

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
