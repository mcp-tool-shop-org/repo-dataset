/** Zero-dependency image validation, dimension parsing, and base64 encoding */

import { readFile } from "node:fs/promises";

export interface ImageInfo {
  format: "png" | "jpeg" | "webp";
  width: number;
  height: number;
  bytes: number;
  valid: boolean;
  reason?: string;
}

export interface EmbeddedImage extends ImageInfo {
  base64: string;
  dataUri: string;
}

const MIME: Record<ImageInfo["format"], string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB sanity cap
const MAX_DIMENSION = 16384;

// ── Format detection ──

export function detectFormat(buf: Buffer): ImageInfo["format"] | null {
  if (buf.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "png";

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";

  // WebP: RIFF....WEBP
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "webp";

  return null;
}

// ── PNG parsing ──

function parsePng(buf: Buffer): { width: number; height: number; truncated: boolean } | null {
  // Minimum PNG: 8 (sig) + 25 (IHDR chunk) = 33 bytes
  if (buf.length < 33) return null;

  // IHDR must be first chunk — chunk type at bytes 12-15
  if (buf.slice(12, 16).toString("ascii") !== "IHDR") return null;

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);

  // Check for IEND marker (last 12 bytes should contain IEND chunk)
  const truncated = buf.length < 12 || buf.slice(-8, -4).toString("ascii") !== "IEND";

  return { width, height, truncated };
}

// ── JPEG parsing ──

function parseJpeg(buf: Buffer): { width: number; height: number; truncated: boolean } | null {
  if (buf.length < 4) return null;
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < buf.length - 9) {
    // Find next marker
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = buf[offset + 1];

    // SOF markers — dimensions here (covers SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15; excludes DHT 0xC4, JPG 0xC8)
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      const hasEOI = buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
      return { width, height, truncated: !hasEOI };
    }

    // EOI — end of image, no SOF found
    if (marker === 0xd9) return null;

    // SOS — start of scan, no SOF found before image data
    if (marker === 0xda) return null;

    // Skip marker segment
    if (offset + 3 >= buf.length) return null;
    const segLen = buf.readUInt16BE(offset + 2);
    if (segLen < 2) return null;
    offset += 2 + segLen;
  }

  return null;
}

// ── WebP parsing ──

function parseWebp(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30) return null;

  const chunkType = buf.slice(12, 16).toString("ascii");

  if (chunkType === "VP8 " && buf.length >= 30) {
    // Lossy VP8: dimensions at bytes 26-29
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }

  if (chunkType === "VP8L" && buf.length >= 25) {
    // Lossless: packed into 4 bytes at offset 21
    const bits = buf.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }

  if (chunkType === "VP8X" && buf.length >= 30) {
    // Extended format: canvas size at bytes 24-29
    const width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
    const height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
    return { width, height };
  }

  return null;
}

// ── Public API ──

export function parseImageInfo(buf: Buffer): ImageInfo | null {
  const format = detectFormat(buf);
  if (!format) return null;

  let width = 0;
  let height = 0;
  let truncated = false;

  if (format === "png") {
    const result = parsePng(buf);
    if (!result) return null;
    width = result.width;
    height = result.height;
    truncated = result.truncated;
  } else if (format === "jpeg") {
    const result = parseJpeg(buf);
    if (!result) return null;
    width = result.width;
    height = result.height;
    truncated = result.truncated;
  } else if (format === "webp") {
    const result = parseWebp(buf);
    if (!result) return null;
    width = result.width;
    height = result.height;
  }

  const valid = width > 0 && height > 0 && width <= MAX_DIMENSION && height <= MAX_DIMENSION && !truncated;

  return {
    format,
    width,
    height,
    bytes: buf.length,
    valid,
    ...(!valid && { reason: truncated ? "truncated" : `invalid dimensions ${width}x${height}` }),
  };
}

export function validateImage(buf: Buffer): { valid: boolean; reason?: string } {
  if (buf.length === 0) return { valid: false, reason: "empty file" };
  if (buf.length > MAX_IMAGE_SIZE) return { valid: false, reason: `file too large: ${buf.length} bytes` };

  const info = parseImageInfo(buf);
  if (!info) return { valid: false, reason: "unrecognized image format" };
  if (!info.valid) return { valid: false, reason: info.reason || "invalid image" };

  return { valid: true };
}

export function encodeBase64(buf: Buffer): string {
  return buf.toString("base64");
}

export function toDataUri(buf: Buffer, format: ImageInfo["format"]): string {
  return `data:${MIME[format]};base64,${buf.toString("base64")}`;
}

/** Load image from disk, validate, and optionally embed */
export async function loadImage(filePath: string, embed: boolean = false): Promise<(ImageInfo | EmbeddedImage) & { error?: string } | null> {
  let buf: Buffer;
  try {
    buf = await readFile(filePath);
  } catch {
    return null;
  }

  const validation = validateImage(buf);
  if (!validation.valid) {
    const format = detectFormat(buf);
    return {
      format: format || "png",
      width: 0,
      height: 0,
      bytes: buf.length,
      valid: false,
      reason: validation.reason,
      error: validation.reason,
    } as ImageInfo & { error: string };
  }

  const info = parseImageInfo(buf)!;

  if (embed) {
    return {
      ...info,
      base64: encodeBase64(buf),
      dataUri: toDataUri(buf, info.format),
    } as EmbeddedImage;
  }

  return info;
}

/** Resolve image reference — validates on disk, optionally embeds */
export async function resolveImageRef(
  repoPath: string,
  relativePath: string,
  embed: boolean = false,
): Promise<ImageReference> {
  const { join } = await import("node:path");
  const fullPath = join(repoPath, relativePath);
  const result = await loadImage(fullPath, embed);

  if (!result) {
    return {
      path: relativePath,
      format: guessFormatFromExtension(relativePath),
      width: 0,
      height: 0,
      bytes: 0,
      valid: false,
      error: "file not found",
    };
  }

  const ref: ImageReference = {
    path: relativePath,
    format: result.format,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    valid: result.valid,
  };

  if (result.reason) ref.error = result.reason;
  if ("base64" in result) ref.base64 = result.base64;

  return ref;
}

export interface ImageReference {
  path: string;
  format: "png" | "jpeg" | "webp";
  width: number;
  height: number;
  bytes: number;
  valid: boolean;
  error?: string;
  base64?: string;
}

function guessFormatFromExtension(path: string): ImageInfo["format"] {
  const ext = path.toLowerCase().split(".").pop();
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  if (ext === "webp") return "webp";
  return "png";
}
