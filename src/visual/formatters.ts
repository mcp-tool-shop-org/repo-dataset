/** Visual output formatters — universal, DPO, KTO, contrastive, pointwise */

import type { VisualOutputFormat } from "../types.js";
import type { VisualTrainingUnit } from "./extractors.js";

export interface VisualFormatter {
  name: string;
  formatUnit(unit: VisualTrainingUnit): string | null;
}

// ── Universal format (superset — converts to all downstream) ──

class UniversalFormatter implements VisualFormatter {
  name = "visual_universal";

  formatUnit(unit: VisualTrainingUnit): string {
    return JSON.stringify({
      id: unit.id,
      task: unit.task,
      images: unit.images,
      messages: unit.messages,
      metadata: unit.metadata,
      ...(unit.preferred_index !== undefined && { preferred_index: unit.preferred_index }),
      ...(unit.label !== undefined && { label: unit.label }),
      ...(unit.scores && { scores: unit.scores }),
    });
  }
}

// ── DPO format ({prompt, chosen, rejected, images}) ──

class DPOFormatter implements VisualFormatter {
  name = "visual_dpo";

  formatUnit(unit: VisualTrainingUnit): string | null {
    if (unit.task !== "preference" || !unit.chosen || !unit.rejected) return null;

    // Build prompt from user messages
    const userMsg = unit.messages.find((m) => m.role === "user");
    const systemMsg = unit.messages.find((m) => m.role === "system");

    const promptParts: Array<{ role: string; content: unknown }> = [];
    if (systemMsg) promptParts.push({ role: "system", content: systemMsg.content });
    if (userMsg) promptParts.push({ role: "user", content: userMsg.content });

    return JSON.stringify({
      images: unit.images,
      prompt: promptParts,
      chosen: [{ role: "assistant", content: [{ type: "text", text: unit.chosen }] }],
      rejected: [{ role: "assistant", content: [{ type: "text", text: unit.rejected }] }],
      metadata: unit.metadata,
    });
  }
}

// ── KTO format ({image, prompt, completion, label}) ──

class KTOFormatter implements VisualFormatter {
  name = "visual_kto";

  formatUnit(unit: VisualTrainingUnit): string | null {
    if (unit.task !== "classify" || unit.label === undefined) return null;

    const assistantMsg = unit.messages.find((m) => m.role === "assistant");
    const userMsg = unit.messages.find((m) => m.role === "user");
    if (!assistantMsg) return null;

    const prompt = typeof userMsg?.content === "string"
      ? userMsg.content
      : Array.isArray(userMsg?.content)
        ? userMsg.content.filter((p): p is { type: "text"; text: string } => (p as { type: string }).type === "text").map((p) => p.text).join(" ")
        : "";

    const completion = typeof assistantMsg.content === "string"
      ? assistantMsg.content
      : "";

    return JSON.stringify({
      image: unit.images[0],
      prompt,
      completion,
      label: unit.label,
      metadata: unit.metadata,
    });
  }
}

// ── Contrastive format ({positive_image, negative_image, anchor_text, margin}) ──

class ContrastiveFormatter implements VisualFormatter {
  name = "visual_contrastive";

  formatUnit(unit: VisualTrainingUnit): string | null {
    if (unit.task !== "contrastive" || unit.images.length < 2) return null;

    return JSON.stringify({
      positive_image: unit.images[0],
      negative_image: unit.images[1],
      margin: unit.margin || 0.8,
      metadata: unit.metadata,
    });
  }
}

// ── Pointwise format ({image, scores, status}) ──

class PointwiseFormatter implements VisualFormatter {
  name = "visual_pointwise";

  formatUnit(unit: VisualTrainingUnit): string | null {
    if (!unit.scores) return null;

    return JSON.stringify({
      image: unit.images[0],
      scores: unit.scores,
      status: unit.metadata.status,
      metadata: unit.metadata,
    });
  }
}

// ── Registry ──

const VISUAL_FORMATTERS: Record<VisualOutputFormat, () => VisualFormatter> = {
  visual_universal: () => new UniversalFormatter(),
  visual_dpo: () => new DPOFormatter(),
  visual_kto: () => new KTOFormatter(),
  visual_contrastive: () => new ContrastiveFormatter(),
  visual_pointwise: () => new PointwiseFormatter(),
};

export function getVisualFormatter(format: VisualOutputFormat): VisualFormatter {
  return VISUAL_FORMATTERS[format]();
}

export function isValidVisualFormat(format: string): format is VisualOutputFormat {
  return format in VISUAL_FORMATTERS;
}

export function getAllVisualFormats(): VisualOutputFormat[] {
  return Object.keys(VISUAL_FORMATTERS) as VisualOutputFormat[];
}
