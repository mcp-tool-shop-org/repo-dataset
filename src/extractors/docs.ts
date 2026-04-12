/** Docs extractor — generates explanation pairs from markdown documentation */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { estimateTokens } from "../pipeline/tokens.js";
import type { Extractor, ExtractedPair, ExtractionContext, PairMetadata } from "../types.js";

const EXTRACTOR_VERSION = "0.2.0";

export class DocsExtractor implements Extractor {
  name = "docs" as const;
  description = "Extracts instruction/explanation pairs from documentation files";

  async *extract(ctx: ExtractionContext): AsyncIterable<ExtractedPair> {
    for (const file of ctx.repoInfo.docFiles) {
      let content: string;
      try {
        content = await readFile(file.path, "utf-8");
      } catch {
        continue;
      }

      if (!content.trim()) continue;

      const sections = splitByHeadings(content);

      for (const section of sections) {
        const tokens = estimateTokens(section.body);
        if (tokens < ctx.config.minTokens || tokens > ctx.config.maxTokens) continue;

        const docName = basename(file.relativePath, ".md");
        const instruction = section.heading
          ? `Explain: ${section.heading}`
          : `Explain the content of the ${docName} documentation`;

        const id = createHash("sha256")
          .update(`${file.relativePath}:${section.heading}`)
          .digest("hex").slice(0, 16);

        const meta: PairMetadata = {
          id,
          source: "docs",
          repo_name: ctx.repoName,
          file: file.relativePath,
          language: "markdown",
          commit_sha: ctx.headSha,
          line_start: section.lineStart,
          line_end: section.lineEnd,
          extractor_type: "docs:section",
          extractor_version: EXTRACTOR_VERSION,
          extracted_at: new Date().toISOString(),
          tokens,
          char_count: section.body.length,
          has_docstring: false,
          has_tests: false,
          complexity: "low",
          quality_score: scoreDocSection(section),
          signal_type: "documentation",
        };

        yield {
          instruction,
          input: `From: ${file.relativePath}`,
          output: section.body,
          metadata: meta,
        };
      }
    }
  }
}

function scoreDocSection(section: Section): number {
  let score = 0.3;

  // Has code blocks (more useful than plain text)
  if (section.body.includes("```")) score += 0.25;

  // Not a boilerplate heading
  if (!isBoilerplateHeading(section.heading)) score += 0.15;

  // Reasonable length (not too short, not a wall of text)
  const lines = section.body.split("\n").length;
  if (lines >= 3 && lines <= 50) score += 0.15;

  // Has some structure (lists, multiple paragraphs)
  if (section.body.includes("\n- ") || section.body.includes("\n* ")) score += 0.1;

  return Math.min(score, 1.0);
}

function isBoilerplateHeading(heading: string): boolean {
  const boilerplate = new Set([
    "license", "licence", "contributing", "contributors",
    "changelog", "change log", "credits", "acknowledgements",
    "table of contents", "toc",
  ]);
  return boilerplate.has(heading.toLowerCase().trim());
}

interface Section {
  heading: string;
  body: string;
  lineStart: number;
  lineEnd: number;
}

function splitByHeadings(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split("\n");
  let currentHeading = "";
  let currentBody: string[] = [];
  let sectionStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentBody.length > 0) {
        const body = currentBody.join("\n").trim();
        if (body) {
          sections.push({
            heading: currentHeading,
            body,
            lineStart: sectionStart,
            lineEnd: i,
          });
        }
      }
      currentHeading = headingMatch[1];
      currentBody = [];
      sectionStart = i + 1;
    } else {
      currentBody.push(lines[i]);
    }
  }

  if (currentBody.length > 0) {
    const body = currentBody.join("\n").trim();
    if (body) {
      sections.push({
        heading: currentHeading,
        body,
        lineStart: sectionStart,
        lineEnd: lines.length,
      });
    }
  }

  return sections;
}
