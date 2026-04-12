/** Docs extractor — generates explanation pairs from markdown documentation */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { estimateTokens } from "../pipeline/tokens.js";
import type { Extractor, ExtractedPair, ExtractionContext } from "../types.js";

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

        yield {
          instruction,
          input: `From: ${file.relativePath}`,
          output: section.body,
          metadata: {
            source: "docs",
            file: file.relativePath,
            language: "markdown",
            tokens,
          },
        };
      }
    }
  }
}

interface Section {
  heading: string;
  body: string;
}

function splitByHeadings(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split("\n");
  let currentHeading = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      // Save previous section
      if (currentBody.length > 0) {
        const body = currentBody.join("\n").trim();
        if (body) sections.push({ heading: currentHeading, body });
      }
      currentHeading = headingMatch[1];
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  // Save last section
  if (currentBody.length > 0) {
    const body = currentBody.join("\n").trim();
    if (body) sections.push({ heading: currentHeading, body });
  }

  return sections;
}
