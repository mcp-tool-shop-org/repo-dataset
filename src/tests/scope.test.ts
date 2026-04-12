import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripStringsAndComments, buildBraceScopeMap, classifyScope, buildPythonScopeMap } from "../extractors/scope.js";

describe("stripStringsAndComments", () => {
  it("preserves normal code", () => {
    const state = { inBlockComment: false };
    assert.equal(stripStringsAndComments("const x = 1;", state), "const x = 1;");
  });

  it("replaces double-quoted strings with spaces", () => {
    const state = { inBlockComment: false };
    const result = stripStringsAndComments('const s = "hello{}"', state);
    assert.ok(!result.includes("{"), "Braces inside strings should become spaces");
    assert.ok(result.startsWith("const s = "), "Code before string should be preserved");
  });

  it("replaces single-quoted strings", () => {
    const state = { inBlockComment: false };
    const result = stripStringsAndComments("const s = '{'", state);
    assert.ok(!result.includes("{"), "Brace inside single-quoted string should become space");
  });

  it("replaces backtick strings", () => {
    const state = { inBlockComment: false };
    const result = stripStringsAndComments("const t = `${x}`", state);
    // The backtick content should be replaced with spaces
    assert.ok(result.startsWith("const t = "));
  });

  it("handles escaped quotes", () => {
    const state = { inBlockComment: false };
    const result = stripStringsAndComments('const s = "he said \\"hi\\""', state);
    assert.ok(result.startsWith("const s = "), "Should handle escaped quotes correctly");
    assert.equal(state.inBlockComment, false);
  });

  it("replaces // comments", () => {
    const state = { inBlockComment: false };
    const result = stripStringsAndComments("code // comment {", state);
    assert.ok(result.startsWith("code "), "Code before comment preserved");
    assert.ok(!result.includes("{"), "Brace in comment should become space");
  });

  it("replaces # comments", () => {
    const state = { inBlockComment: false };
    const result = stripStringsAndComments("x = 1 # comment {", state);
    assert.ok(!result.includes("{"), "Brace in hash comment should become space");
  });

  it("handles block comment start", () => {
    const state = { inBlockComment: false };
    stripStringsAndComments("code /* start", state);
    assert.equal(state.inBlockComment, true, "State should track block comment");
  });

  it("handles block comment end", () => {
    const state = { inBlockComment: true };
    const result = stripStringsAndComments("end */ code {", state);
    assert.equal(state.inBlockComment, false, "State should clear after */");
    assert.ok(result.includes("{"), "Code after block comment end should be preserved");
  });

  it("multi-line block comment state persists", () => {
    const state = { inBlockComment: false };
    stripStringsAndComments("/* start", state);
    assert.equal(state.inBlockComment, true);
    const result = stripStringsAndComments("end */", state);
    assert.equal(state.inBlockComment, false);
  });
});

describe("buildBraceScopeMap", () => {
  it("empty file returns empty array", () => {
    assert.deepEqual(buildBraceScopeMap([]), []);
  });

  it("single function", () => {
    const lines = ["function foo() {", "  return 1;", "}"];
    const scopes = buildBraceScopeMap(lines);
    assert.equal(scopes.length, 1);
    assert.equal(scopes[0].startLine, 0);
    assert.equal(scopes[0].endLine, 2);
  });

  it("nested braces", () => {
    const lines = ["function foo() {", "  if (x) {", "    return 1;", "  }", "}"];
    const scopes = buildBraceScopeMap(lines);
    assert.equal(scopes.length, 2, "Should have outer function + inner if scope");
  });

  it("ignores braces in strings", () => {
    const lines = ['const x = "{"', "const y = 1;"];
    const scopes = buildBraceScopeMap(lines);
    assert.equal(scopes.length, 0, "Brace in string should not create scope");
  });

  it("ignores braces in comments", () => {
    const lines = ["// {", "function foo() {", "  return 1;", "}"];
    const scopes = buildBraceScopeMap(lines);
    assert.equal(scopes.length, 1, "Only the function scope, not the comment brace");
    assert.equal(scopes[0].startLine, 1);
  });
});

describe("classifyScope", () => {
  it("identifies function", () => {
    const lines = ["function foo() {", "  return 1;", "}"];
    const scopes = buildBraceScopeMap(lines);
    const classified = classifyScope(scopes[0], lines, "typescript");
    assert.equal(classified.kind, "function");
    assert.equal(classified.name, "foo");
  });

  it("identifies class", () => {
    const lines = ["class Bar {", "  x = 1;", "}"];
    const scopes = buildBraceScopeMap(lines);
    const classified = classifyScope(scopes[0], lines, "typescript");
    assert.equal(classified.kind, "class");
    assert.equal(classified.name, "Bar");
  });

  it("identifies method", () => {
    const lines = ["class X {", "  async handle() {", "    return 1;", "  }", "}"];
    const scopes = buildBraceScopeMap(lines);
    // Find the inner scope (the method)
    const methodScope = scopes.find((s) => s.startLine === 1);
    assert.ok(methodScope);
    const classified = classifyScope(methodScope, lines, "typescript");
    assert.equal(classified.kind, "method");
    assert.equal(classified.name, "handle");
  });

  it("identifies control flow", () => {
    // else block — no parens so it won't match function/method patterns
    const lines = ["else {", "  console.log(x);", "  return x;", "}"];
    const scopes = buildBraceScopeMap(lines);
    assert.equal(scopes.length, 1);
    const classified = classifyScope(scopes[0], lines, "typescript");
    assert.equal(classified.kind, "control");
  });

  it("TS arrow function", () => {
    const lines = ["export const foo = () => {", "  return 1;", "}"];
    const scopes = buildBraceScopeMap(lines);
    const classified = classifyScope(scopes[0], lines, "typescript");
    assert.equal(classified.kind, "function");
    assert.equal(classified.name, "foo");
  });

  it("Rust fn", () => {
    const lines = ["pub async fn process() {", "  todo!()", "}"];
    const scopes = buildBraceScopeMap(lines);
    const classified = classifyScope(scopes[0], lines, "rust");
    assert.equal(classified.kind, "function");
    assert.equal(classified.name, "process");
  });

  it("Go method", () => {
    const lines = ["func (s *Server) Handle() {", "  return", "}"];
    const scopes = buildBraceScopeMap(lines);
    const classified = classifyScope(scopes[0], lines, "go");
    assert.equal(classified.kind, "method");
    assert.equal(classified.name, "Handle");
  });
});

describe("buildPythonScopeMap", () => {
  it("finds def", () => {
    const lines = ["def foo():", "  return 1", ""];
    const scopes = buildPythonScopeMap(lines);
    assert.equal(scopes.length, 1);
    assert.equal(scopes[0].kind, "function");
    assert.equal(scopes[0].name, "foo");
  });

  it("finds class", () => {
    const lines = ["class Bar:", "  pass", ""];
    const scopes = buildPythonScopeMap(lines);
    assert.equal(scopes.length, 1);
    assert.equal(scopes[0].kind, "class");
    assert.equal(scopes[0].name, "Bar");
  });

  it("handles decorators", () => {
    const lines = ["@decorator", "def foo():", "  pass"];
    const scopes = buildPythonScopeMap(lines);
    assert.equal(scopes[0].startLine, 0, "Should include decorator line");
  });

  it("multi-line signature", () => {
    const lines = ["def foo(", "  x,", "  y", "):", "  return x"];
    const scopes = buildPythonScopeMap(lines);
    assert.equal(scopes.length, 1);
    assert.ok(scopes[0].endLine >= 4, "Should find end after multi-line signature");
  });

  it("nested functions", () => {
    const lines = ["def outer():", "  def inner():", "    pass", "  return inner"];
    const scopes = buildPythonScopeMap(lines);
    assert.equal(scopes.length, 2, "Should find both outer and inner");
  });

  it("elif/else continuation", () => {
    const lines = ["def foo():", "  if x:", "    pass", "  else:", "    pass"];
    const scopes = buildPythonScopeMap(lines);
    assert.ok(scopes[0].endLine >= 4, "endLine should include else block");
  });
});
