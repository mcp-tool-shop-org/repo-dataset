import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFileImports, matchImportsToSources } from "../extractors/imports.js";
import type { FileEntry } from "../types.js";

describe("parseFileImports — TypeScript/JavaScript", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "imports-test-"));
    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src", "main.ts"), [
      "import { foo } from './bar';",
      "import './styles.css';",
      "const x = require('./utils');",
      "import fs from 'node:fs';",
      "import express from 'express';",
    ].join("\n"));
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("parses ES import (from)", async () => {
    const imports = await parseFileImports(join(tempDir, "src", "main.ts"), "typescript", tempDir);
    const barImport = imports.find((i) => i.raw === "./bar");
    assert.ok(barImport, "Should find ./bar import");
    assert.equal(barImport.isProjectInternal, true);
    assert.ok(barImport.resolved, "Should have resolved path");
  });

  it("parses ES import (bare)", async () => {
    const imports = await parseFileImports(join(tempDir, "src", "main.ts"), "typescript", tempDir);
    const cssImport = imports.find((i) => i.raw === "./styles.css");
    assert.ok(cssImport, "Should find bare import");
  });

  it("parses require()", async () => {
    const imports = await parseFileImports(join(tempDir, "src", "main.ts"), "typescript", tempDir);
    const utilsImport = imports.find((i) => i.raw === "./utils");
    assert.ok(utilsImport, "Should find require import");
    assert.equal(utilsImport.isProjectInternal, true);
  });

  it("filters node: as external", async () => {
    const imports = await parseFileImports(join(tempDir, "src", "main.ts"), "typescript", tempDir);
    const fsImport = imports.find((i) => i.raw === "node:fs");
    assert.ok(fsImport);
    assert.equal(fsImport.isProjectInternal, false);
  });

  it("filters npm packages as external", async () => {
    const imports = await parseFileImports(join(tempDir, "src", "main.ts"), "typescript", tempDir);
    const expressImport = imports.find((i) => i.raw === "express");
    assert.ok(expressImport);
    assert.equal(expressImport.isProjectInternal, false);
  });
});

describe("parseFileImports — Python", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "imports-py-"));
    await writeFile(join(tempDir, "main.py"), [
      "from package.module import X",
      "import os.path",
      "import json",
    ].join("\n"));
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("parses Python from...import", async () => {
    const imports = await parseFileImports(join(tempDir, "main.py"), "python", tempDir);
    const pkgImport = imports.find((i) => i.raw === "package.module");
    assert.ok(pkgImport, "Should find from...import");
    assert.equal(pkgImport.isProjectInternal, true);
    assert.equal(pkgImport.resolved, "package/module");
  });

  it("filters Python stdlib", async () => {
    const imports = await parseFileImports(join(tempDir, "main.py"), "python", tempDir);
    const jsonImport = imports.find((i) => i.raw === "json");
    assert.ok(jsonImport);
    assert.equal(jsonImport.isProjectInternal, false);
  });
});

describe("parseFileImports — Rust", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "imports-rs-"));
    await writeFile(join(tempDir, "main.rs"), [
      "use crate::utils::helper;",
      "use serde::Serialize;",
    ].join("\n"));
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("parses Rust use crate::", async () => {
    const imports = await parseFileImports(join(tempDir, "main.rs"), "rust", tempDir);
    const crateImport = imports.find((i) => i.raw.includes("crate::utils"));
    assert.ok(crateImport);
    assert.equal(crateImport.isProjectInternal, true);
    assert.ok(crateImport.resolved?.includes("src/utils/helper"));
  });

  it("filters Rust external crates", async () => {
    const imports = await parseFileImports(join(tempDir, "main.rs"), "rust", tempDir);
    const serdeImport = imports.find((i) => i.raw.includes("serde"));
    assert.ok(serdeImport);
    assert.equal(serdeImport.isProjectInternal, false);
  });
});

describe("parseFileImports — Go", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "imports-go-"));
    await writeFile(join(tempDir, "main.go"), [
      'import "myproject.com/pkg/utils"',
      'import "fmt"',
    ].join("\n"));
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("parses Go imports", async () => {
    const imports = await parseFileImports(join(tempDir, "main.go"), "go", tempDir);
    const pkgImport = imports.find((i) => i.raw.includes("myproject"));
    assert.ok(pkgImport);
    assert.equal(pkgImport.isProjectInternal, true);
  });

  it("filters Go stdlib", async () => {
    const imports = await parseFileImports(join(tempDir, "main.go"), "go", tempDir);
    const fmtImport = imports.find((i) => i.raw === "fmt");
    assert.ok(fmtImport);
    assert.equal(fmtImport.isProjectInternal, false);
  });
});

describe("parseFileImports — Java", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "imports-java-"));
    await writeFile(join(tempDir, "Main.java"), "import com.foo.Bar;\n");
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("parses Java imports", async () => {
    const imports = await parseFileImports(join(tempDir, "Main.java"), "java", tempDir);
    const barImport = imports.find((i) => i.raw === "com.foo.Bar");
    assert.ok(barImport);
    assert.equal(barImport.resolved, "com/foo/Bar");
    assert.equal(barImport.isProjectInternal, true);
  });
});

describe("parseFileImports — Ruby", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "imports-rb-"));
    await writeFile(join(tempDir, "main.rb"), "require_relative '../lib/foo'\n");
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("parses Ruby require_relative", async () => {
    const imports = await parseFileImports(join(tempDir, "main.rb"), "ruby", tempDir);
    assert.ok(imports.length > 0);
    assert.ok(imports[0].resolved?.includes("lib/foo") || imports[0].raw.includes("lib/foo"));
  });
});

describe("matchImportsToSources", () => {
  const sourceFiles: FileEntry[] = [
    { path: "/p/src/utils.ts", relativePath: "src/utils.ts", language: "typescript", size: 100 },
    { path: "/p/src/foo.ts", relativePath: "src/foo.ts", language: "typescript", size: 100 },
    { path: "/p/src/lib/index.ts", relativePath: "src/lib/index.ts", language: "typescript", size: 100 },
  ];

  it("finds exact match", () => {
    const imports = [{ raw: "./utils", resolved: "src/utils", isProjectInternal: true }];
    const matched = matchImportsToSources(imports, sourceFiles);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].relativePath, "src/utils.ts");
  });

  it("tries extensions", () => {
    const imports = [{ raw: "./foo", resolved: "src/foo", isProjectInternal: true }];
    const matched = matchImportsToSources(imports, sourceFiles);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].relativePath, "src/foo.ts");
  });

  it("tries index", () => {
    const imports = [{ raw: "./lib", resolved: "src/lib", isProjectInternal: true }];
    const matched = matchImportsToSources(imports, sourceFiles);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].relativePath, "src/lib/index.ts");
  });

  it("returns empty for no match", () => {
    const imports = [{ raw: "./nonexistent", resolved: "src/nonexistent", isProjectInternal: true }];
    const matched = matchImportsToSources(imports, sourceFiles);
    assert.equal(matched.length, 0);
  });
});
