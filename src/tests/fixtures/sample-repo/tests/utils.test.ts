import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { add, multiply, factorial, isPalindrome } from "../src/utils.js";

describe("add", () => {
  it("adds two positive numbers", () => {
    assert.equal(add(2, 3), 5);
  });

  it("handles negative numbers", () => {
    assert.equal(add(-1, 1), 0);
  });
});

describe("multiply", () => {
  it("multiplies two numbers", () => {
    assert.equal(multiply(3, 4), 12);
  });

  it("handles zero", () => {
    assert.equal(multiply(5, 0), 0);
  });
});

describe("factorial", () => {
  it("computes factorial of 5", () => {
    assert.equal(factorial(5), 120);
  });

  it("returns 1 for 0", () => {
    assert.equal(factorial(0), 1);
  });

  it("throws for negative input", () => {
    assert.throws(() => factorial(-1));
  });
});

describe("isPalindrome", () => {
  it("detects palindromes", () => {
    assert.equal(isPalindrome("racecar"), true);
  });

  it("ignores case", () => {
    assert.equal(isPalindrome("RaceCar"), true);
  });

  it("rejects non-palindromes", () => {
    assert.equal(isPalindrome("hello"), false);
  });
});
