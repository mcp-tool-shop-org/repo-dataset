/** Visual output formatters — legacy + framework-native (Phase 3) */

import type { VisualOutputFormat } from "../types.js";
import type { VisualTrainingUnit, ImageRef, Message, ContentPart } from "./extractors.js";

export interface VisualFormatter {
  name: string;
  formatUnit(unit: VisualTrainingUnit): string | null;
}

// ── Helpers ──

/** Get the image value for a ref: base64 string if embedded, path otherwise */
function imgVal(ref: ImageRef): string {
  return ref.base64 || ref.path;
}

/** Extract plain text from a message's content */
function textOf(msg: Message | undefined): string {
  if (!msg) return "";
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .filter((p): p is { type: "text"; text: string } => (p as { type: string }).type === "text")
    .map((p) => p.text)
    .join(" ");
}

/** Build content-array style content with image placeholders for base64/path */
function contentArrayMessages(unit: VisualTrainingUnit): unknown[] {
  return unit.messages.map((msg) => {
    if (typeof msg.content === "string") {
      return { role: msg.role, content: [{ type: "text", text: msg.content }] };
    }
    // Replace { type: "image" } entries with proper refs
    let imgIdx = 0;
    const content = msg.content.map((part) => {
      if ((part as { type: string }).type === "image") {
        const ref = unit.imageRefs[imgIdx++];
        if (ref?.base64) {
          return { type: "image_url", image_url: { url: `data:image/${ref.format};base64,${ref.base64}` } };
        }
        return { type: "image" };
      }
      return part;
    });
    return { role: msg.role, content };
  });
}

/** Build inline-token text: replace image placeholders with <image> tags */
function inlineTokenText(msg: Message | undefined): string {
  if (!msg) return "";
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .map((p) => (p as { type: string }).type === "image" ? "<image>" : (p as { type: "text"; text: string }).text)
    .join("\n");
}

// ══════════════════════════════════════════════
// LEGACY FORMATS (backward-compatible)
// ══════════════════════════════════════════════

class UniversalFormatter implements VisualFormatter {
  name = "visual_universal";

  formatUnit(unit: VisualTrainingUnit): string {
    return JSON.stringify({
      id: unit.id,
      task: unit.task,
      images: unit.imageRefs.map(imgVal),
      messages: contentArrayMessages(unit),
      metadata: unit.metadata,
      binding: unit.binding,
      ...(unit.preferred_index !== undefined && { preferred_index: unit.preferred_index }),
      ...(unit.label !== undefined && { label: unit.label }),
      ...(unit.scores && { scores: unit.scores }),
    });
  }
}

class DPOFormatter implements VisualFormatter {
  name = "visual_dpo";

  formatUnit(unit: VisualTrainingUnit): string | null {
    if (unit.task !== "preference" || !unit.chosen || !unit.rejected) return null;

    const userMsg = unit.messages.find((m) => m.role === "user");
    const systemMsg = unit.messages.find((m) => m.role === "system");

    const promptParts: unknown[] = [];
    if (systemMsg) promptParts.push({ role: "system", content: [{ type: "text", text: textOf(systemMsg) }] });
    if (userMsg) {
      let imgIdx = 0;
      const content = typeof userMsg.content === "string"
        ? [{ type: "text" as const, text: userMsg.content }]
        : userMsg.content.map((p) => {
            if ((p as { type: string }).type === "image") {
              const ref = unit.imageRefs[imgIdx++];
              if (ref?.base64) return { type: "image_url", image_url: { url: `data:image/${ref.format};base64,${ref.base64}` } };
              return { type: "image" };
            }
            return p;
          });
      promptParts.push({ role: "user", content });
    }

    return JSON.stringify({
      images: unit.imageRefs.map(imgVal),
      prompt: promptParts,
      chosen: [{ role: "assistant", content: [{ type: "text", text: unit.chosen }] }],
      rejected: [{ role: "assistant", content: [{ type: "text", text: unit.rejected }] }],
      metadata: unit.metadata,
    });
  }
}

class KTOFormatter implements VisualFormatter {
  name = "visual_kto";

  formatUnit(unit: VisualTrainingUnit): string | null {
    if (unit.task !== "classify" || unit.label === undefined) return null;
    const assistantMsg = unit.messages.find((m) => m.role === "assistant");
    if (!assistantMsg) return null;

    return JSON.stringify({
      image: imgVal(unit.imageRefs[0]),
      prompt: textOf(unit.messages.find((m) => m.role === "user")),
      completion: textOf(assistantMsg),
      label: unit.label,
      metadata: unit.metadata,
    });
  }
}

class ContrastiveFormatter implements VisualFormatter {
  name = "visual_contrastive";

  formatUnit(unit: VisualTrainingUnit): string | null {
    if (unit.task !== "contrastive" || unit.imageRefs.length < 2) return null;
    return JSON.stringify({
      positive_image: imgVal(unit.imageRefs[0]),
      negative_image: imgVal(unit.imageRefs[1]),
      margin: unit.margin || 0.8,
      metadata: unit.metadata,
    });
  }
}

class PointwiseFormatter implements VisualFormatter {
  name = "visual_pointwise";

  formatUnit(unit: VisualTrainingUnit): string | null {
    if (!unit.scores) return null;
    return JSON.stringify({
      image: imgVal(unit.imageRefs[0]),
      scores: unit.scores,
      status: unit.metadata.status,
      metadata: unit.metadata,
    });
  }
}

// ══════════════════════════════════════════════
// FRAMEWORK-NATIVE FORMATS (Phase 3)
// ══════════════════════════════════════════════

// ── Content-Array Paradigm ──

/** TRL format — SFT + DPO for HuggingFace TRL, Unsloth */
class TrlFormatter implements VisualFormatter {
  name = "trl";

  formatUnit(unit: VisualTrainingUnit): string | null {
    if (unit.task === "preference") {
      if (!unit.chosen || !unit.rejected) return null;
      const userMsg = unit.messages.find((m) => m.role === "user");
      const systemMsg = unit.messages.find((m) => m.role === "system");

      const prompt: unknown[] = [];
      if (systemMsg) prompt.push({ role: "system", content: [{ type: "text", text: textOf(systemMsg) }] });
      if (userMsg) prompt.push({ role: "user", content: buildTrlContent(userMsg, unit.imageRefs) });

      return JSON.stringify({
        prompt,
        chosen: [{ role: "assistant", content: [{ type: "text", text: unit.chosen }] }],
        rejected: [{ role: "assistant", content: [{ type: "text", text: unit.rejected }] }],
        images: unit.imageRefs.map(imgVal),
      });
    }

    // SFT: full conversation
    return JSON.stringify({
      messages: unit.messages.map((msg) => ({
        role: msg.role,
        content: buildTrlContent(msg, unit.imageRefs),
      })),
      images: unit.imageRefs.map(imgVal),
    });
  }
}

function buildTrlContent(msg: Message, refs: ImageRef[]): unknown[] {
  if (typeof msg.content === "string") {
    return [{ type: "text", text: msg.content }];
  }
  let imgIdx = 0;
  return msg.content.map((part) => {
    if ((part as { type: string }).type === "image") {
      // TRL uses { type: "image" } placeholder — framework loads from images column
      return { type: "image" };
    }
    return part;
  });
}

/** Axolotl format — content-array with url/path/base64 in image objects */
class AxolotlFormatter implements VisualFormatter {
  name = "axolotl";

  formatUnit(unit: VisualTrainingUnit): string | null {
    if (unit.task === "contrastive") return null; // axolotl doesn't support contrastive

    const messages = unit.messages.map((msg) => {
      if (typeof msg.content === "string") {
        return { role: msg.role, content: [{ type: "text", text: msg.content }] };
      }
      let imgIdx = 0;
      const content = msg.content.map((part) => {
        if ((part as { type: string }).type === "image") {
          const ref = unit.imageRefs[imgIdx++];
          if (ref?.base64) {
            return { type: "image", base64: ref.base64 };
          }
          return { type: "image", path: ref?.path || "" };
        }
        return part;
      });
      return { role: msg.role, content };
    });

    return JSON.stringify({ messages });
  }
}

// ── Inline-Token Paradigm ──

/** LLaVA format — conversations with <image> tokens, single image field */
class LlavaFormatter implements VisualFormatter {
  name = "llava";

  formatUnit(unit: VisualTrainingUnit): string | null {
    // LLaVA doesn't natively support DPO
    if (unit.task === "preference" || unit.task === "contrastive") return null;

    const conversations: Array<{ from: string; value: string }> = [];

    for (const msg of unit.messages) {
      if (msg.role === "system") continue; // LLaVA bakes system into first human turn
      const from = msg.role === "user" ? "human" : "gpt";
      let value = inlineTokenText(msg);

      // Prepend system prompt to first human message
      if (from === "human" && conversations.length === 0) {
        const sys = unit.messages.find((m) => m.role === "system");
        if (sys) value = textOf(sys) + "\n" + value;
      }

      conversations.push({ from, value });
    }

    return JSON.stringify({
      id: unit.id,
      image: imgVal(unit.imageRefs[0]),
      conversations,
    });
  }
}

/** LLaMA-Factory format — sharegpt conversations + DPO support */
class LlamaFactoryFormatter implements VisualFormatter {
  name = "llama_factory";

  formatUnit(unit: VisualTrainingUnit): string | null {
    if (unit.task === "contrastive") return null;

    if (unit.task === "preference" && unit.chosen && unit.rejected) {
      // DPO: conversations + chosen/rejected
      const conversations: Array<{ from: string; value: string }> = [];

      for (const msg of unit.messages) {
        if (msg.role === "assistant") continue; // chosen/rejected replace assistant
        const from = msg.role === "user" ? "human" : msg.role === "system" ? "system" : "gpt";
        conversations.push({ from, value: inlineTokenText(msg) });
      }

      return JSON.stringify({
        images: unit.imageRefs.map(imgVal),
        conversations,
        chosen: { from: "gpt", value: unit.chosen },
        rejected: { from: "gpt", value: unit.rejected },
      });
    }

    // SFT
    const conversations: Array<{ from: string; value: string }> = [];
    for (const msg of unit.messages) {
      if (msg.role === "system") continue;
      const from = msg.role === "user" ? "human" : "gpt";
      let value = inlineTokenText(msg);
      if (from === "human" && conversations.length === 0) {
        const sys = unit.messages.find((m) => m.role === "system");
        if (sys) value = textOf(sys) + "\n" + value;
      }
      conversations.push({ from, value });
    }

    return JSON.stringify({
      images: unit.imageRefs.map(imgVal),
      conversations,
    });
  }
}

/** Qwen2-VL / MS-Swift format — query/response/history with <image> tokens */
class Qwen2VlFormatter implements VisualFormatter {
  name = "qwen2vl";

  formatUnit(unit: VisualTrainingUnit): string | null {
    if (unit.task === "contrastive") return null;

    const userMsg = unit.messages.find((m) => m.role === "user");
    const assistantMsg = unit.messages.find((m) => m.role === "assistant");
    const systemMsg = unit.messages.find((m) => m.role === "system");

    let query = inlineTokenText(userMsg);
    if (systemMsg) query = textOf(systemMsg) + "\n" + query;

    const response = textOf(assistantMsg);

    const result: Record<string, unknown> = {
      query,
      response,
      images: unit.imageRefs.map(imgVal),
    };

    // For DPO, add chosen/rejected
    if (unit.task === "preference" && unit.chosen && unit.rejected) {
      result.response = unit.chosen;
      result.rejected_response = unit.rejected;
    }

    return JSON.stringify(result);
  }
}

// ── Registry ──

const VISUAL_FORMATTERS: Record<VisualOutputFormat, () => VisualFormatter> = {
  // Legacy
  visual_universal: () => new UniversalFormatter(),
  visual_dpo: () => new DPOFormatter(),
  visual_kto: () => new KTOFormatter(),
  visual_contrastive: () => new ContrastiveFormatter(),
  visual_pointwise: () => new PointwiseFormatter(),
  // Framework-native (Phase 3)
  trl: () => new TrlFormatter(),
  axolotl: () => new AxolotlFormatter(),
  llava: () => new LlavaFormatter(),
  llama_factory: () => new LlamaFactoryFormatter(),
  qwen2vl: () => new Qwen2VlFormatter(),
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
