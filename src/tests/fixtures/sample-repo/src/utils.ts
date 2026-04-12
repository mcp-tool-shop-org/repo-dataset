/**
 * Adds two numbers together.
 * @param a First number
 * @param b Second number
 * @returns The sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Multiplies two numbers.
 * @param a First number
 * @param b Second number
 * @returns The product of a and b
 */
export function multiply(a: number, b: number): number {
  return a * b;
}

/**
 * Calculates the factorial of a non-negative integer.
 * Uses iterative approach for better performance.
 * @param n Non-negative integer
 * @returns n factorial
 */
export function factorial(n: number): number {
  if (n < 0) throw new Error("Cannot compute factorial of negative number");
  if (n <= 1) return 1;

  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

/**
 * Checks if a string is a valid palindrome.
 * Ignores case and non-alphanumeric characters.
 */
export function isPalindrome(str: string): boolean {
  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, "");
  const reversed = cleaned.split("").reverse().join("");
  return cleaned === reversed;
}

export class MathHelper {
  private history: number[] = [];

  /**
   * Performs addition and records the result.
   */
  addWithHistory(a: number, b: number): number {
    const result = a + b;
    this.history.push(result);
    return result;
  }

  /**
   * Returns all computed results.
   */
  getHistory(): number[] {
    return [...this.history];
  }

  /**
   * Clears computation history.
   */
  clear(): void {
    this.history = [];
  }
}
