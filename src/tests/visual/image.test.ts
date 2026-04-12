import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectFormat, parseImageInfo, validateImage, encodeBase64, toDataUri } from "../../visual/image.js";

// ── Minimal valid PNG: 8-byte sig + IHDR chunk + IEND chunk ──
function makePng(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR: length(13) + "IHDR" + width(4) + height(4) + bitdepth(1) + colortype(1) + compression(1) + filter(1) + interlace(1) + CRC(4)
  const ihdrLen = Buffer.alloc(4);
  ihdrLen.writeUInt32BE(13, 0);
  const ihdrType = Buffer.from("IHDR");
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type (RGB)
  const ihdrCrc = Buffer.alloc(4); // fake CRC
  // IEND: length(0) + "IEND" + CRC(4)
  const iendLen = Buffer.alloc(4);
  const iendType = Buffer.from("IEND");
  const iendCrc = Buffer.alloc(4);

  return Buffer.concat([sig, ihdrLen, ihdrType, ihdrData, ihdrCrc, iendLen, iendType, iendCrc]);
}

// Minimal valid JPEG: SOI + SOF0 + EOI
function makeJpeg(width: number, height: number): Buffer {
  const soi = Buffer.from([0xff, 0xd8]); // SOI
  // SOF0 marker
  const sof = Buffer.alloc(19);
  sof[0] = 0xff;
  sof[1] = 0xc0; // SOF0
  sof.writeUInt16BE(17, 2); // length = 17
  sof[4] = 8; // precision
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 3; // components
  // Component data (3 components x 3 bytes = 9 bytes)
  sof[10] = 1; sof[11] = 0x11; sof[12] = 0;
  sof[13] = 2; sof[14] = 0x11; sof[15] = 0;
  sof[16] = 3; sof[17] = 0x11; sof[18] = 0;
  const eoi = Buffer.from([0xff, 0xd9]); // EOI
  return Buffer.concat([soi, sof, eoi]);
}

describe("detectFormat", () => {
  it("detects PNG", () => {
    const buf = makePng(64, 64);
    assert.equal(detectFormat(buf), "png");
  });

  it("detects JPEG", () => {
    const buf = makeJpeg(128, 96);
    assert.equal(detectFormat(buf), "jpeg");
  });

  it("detects WebP", () => {
    const buf = Buffer.alloc(30);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(22, 4); // file size
    buf.write("WEBP", 8);
    buf.write("VP8 ", 12);
    assert.equal(detectFormat(buf), "webp");
  });

  it("returns null for unknown format", () => {
    assert.equal(detectFormat(Buffer.from("not an image")), null);
  });

  it("returns null for buffer too small", () => {
    assert.equal(detectFormat(Buffer.alloc(4)), null);
  });
});

describe("parseImageInfo — PNG", () => {
  it("extracts dimensions from valid PNG", () => {
    const info = parseImageInfo(makePng(256, 128));
    assert.ok(info);
    assert.equal(info.format, "png");
    assert.equal(info.width, 256);
    assert.equal(info.height, 128);
    assert.equal(info.valid, true);
  });

  it("detects truncated PNG (no IEND)", () => {
    const full = makePng(64, 64);
    const truncated = full.subarray(0, full.length - 12); // strip IEND
    const info = parseImageInfo(truncated);
    assert.ok(info);
    assert.equal(info.valid, false);
    assert.ok(info.reason?.includes("truncated"));
  });

  it("handles 1x1 PNG", () => {
    const info = parseImageInfo(makePng(1, 1));
    assert.ok(info);
    assert.equal(info.width, 1);
    assert.equal(info.height, 1);
    assert.equal(info.valid, true);
  });
});

describe("parseImageInfo — JPEG", () => {
  it("extracts dimensions from valid JPEG", () => {
    const info = parseImageInfo(makeJpeg(640, 480));
    assert.ok(info);
    assert.equal(info.format, "jpeg");
    assert.equal(info.width, 640);
    assert.equal(info.height, 480);
    assert.equal(info.valid, true);
  });

  it("detects truncated JPEG (no EOI)", () => {
    const full = makeJpeg(100, 100);
    const truncated = full.subarray(0, full.length - 2); // strip EOI
    const info = parseImageInfo(truncated);
    assert.ok(info);
    assert.equal(info.valid, false);
  });
});

describe("validateImage", () => {
  it("valid PNG passes", () => {
    const result = validateImage(makePng(64, 64));
    assert.equal(result.valid, true);
  });

  it("valid JPEG passes", () => {
    const result = validateImage(makeJpeg(128, 96));
    assert.equal(result.valid, true);
  });

  it("empty buffer fails", () => {
    const result = validateImage(Buffer.alloc(0));
    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("empty"));
  });

  it("random bytes fail", () => {
    const result = validateImage(Buffer.from("random garbage content here"));
    assert.equal(result.valid, false);
  });

  it("too-large file fails", () => {
    // Create a buffer that claims to be > 50MB
    const result = validateImage(Buffer.alloc(51 * 1024 * 1024));
    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("too large"));
  });
});

describe("encodeBase64", () => {
  it("encodes buffer to base64 string", () => {
    const buf = Buffer.from("hello");
    const b64 = encodeBase64(buf);
    assert.equal(b64, "aGVsbG8=");
    assert.equal(Buffer.from(b64, "base64").toString(), "hello");
  });

  it("PNG round-trips through base64", () => {
    const png = makePng(32, 32);
    const b64 = encodeBase64(png);
    const decoded = Buffer.from(b64, "base64");
    assert.deepEqual(decoded, png);
  });
});

describe("toDataUri", () => {
  it("produces valid PNG data URI", () => {
    const buf = makePng(16, 16);
    const uri = toDataUri(buf, "png");
    assert.ok(uri.startsWith("data:image/png;base64,"));
    // Verify the base64 part is valid
    const b64Part = uri.split(",")[1];
    const decoded = Buffer.from(b64Part, "base64");
    assert.equal(decoded[0], 0x89); // PNG signature
  });

  it("produces valid JPEG data URI", () => {
    const buf = makeJpeg(16, 16);
    const uri = toDataUri(buf, "jpeg");
    assert.ok(uri.startsWith("data:image/jpeg;base64,"));
  });
});
