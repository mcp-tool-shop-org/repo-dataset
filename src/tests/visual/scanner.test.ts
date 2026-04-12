import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { scanVisualRepo } from "../../visual/scanner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VISUAL_FIXTURE = resolve(__dirname, "..", "..", "..", "src", "tests", "fixtures", "visual-corpus");

describe("scanVisualRepo — fixture", () => {
  it("finds all image assets", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    assert.equal(info.assets.length, 6);
  });

  it("detects PNG files", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    for (const asset of info.assets) {
      assert.ok(asset.asset_path.endsWith(".png"), `${asset.id} should be PNG`);
    }
  });

  it("infers status from folder name", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    const approved = info.assets.filter((a) => a.status === "approved");
    const rejected = info.assets.filter((a) => a.status === "rejected");
    const borderline = info.assets.filter((a) => a.status === "borderline");
    assert.ok(approved.length >= 2, "Should have approved assets");
    assert.ok(rejected.length >= 1, "Should have rejected assets");
    assert.ok(borderline.length >= 1, "Should have borderline assets");
  });

  it("sets status_source to folder for folder-inferred", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    const priest = info.assets.find((a) => a.id === "keth_priest_front_01");
    assert.ok(priest);
    assert.equal(priest.status_source, "folder");
  });

  it("infers view from filename", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    const front = info.assets.find((a) => a.id === "keth_soldier_front_01");
    assert.ok(front);
    assert.equal(front.view, "front");
    const side = info.assets.find((a) => a.id === "keth_soldier_side_01");
    assert.ok(side);
    assert.equal(side.view, "side");
    const back = info.assets.find((a) => a.id === "keth_scout_back_01");
    assert.ok(back);
    assert.equal(back.view, "back");
  });

  it("loads record JSONs and sets record_path", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    const withRecords = info.assets.filter((a) => a.record_path !== null);
    assert.equal(withRecords.length, 2, "Two assets should have records");
  });

  it("merges record data into asset", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    const soldier = info.assets.find((a) => a.id === "keth_soldier_front_01");
    assert.ok(soldier);
    assert.equal(soldier.faction, "keth_communion");
    assert.ok(Object.keys(soldier.tags).length > 0, "Tags should be populated from record");
  });

  it("record overrides folder status", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    const rej = info.assets.find((a) => a.id === "keth_soldier_front_02");
    assert.ok(rej);
    assert.equal(rej.status, "rejected");
    assert.equal(rej.status_source, "record");
  });

  it("loads comparisons", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    assert.equal(info.comparisons.length, 1);
  });

  it("comparison has correct chosen", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    assert.equal(info.comparisons[0].chosen, "a");
  });

  it("comparison has reasoning", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    assert.ok(info.comparisons[0].reasoning, "Should have reasoning text");
  });

  it("finds canon docs", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    assert.ok(info.canonDocs.length >= 1);
  });

  it("finds rubric docs", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    assert.ok(info.rubricDocs.length >= 1);
  });

  it("detects structure tier perfect", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    assert.equal(info.structureTier, "perfect");
  });

  it("computes yield correctly", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    assert.equal(info.yield.totalAssets, 6);
    assert.equal(info.yield.assetsWithRecords, 2);
  });

  it("record coverage is correct", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    assert.ok(Math.abs(info.yield.recordCoverage - 2 / 6) < 0.01);
  });

  it("skips non-image files as assets", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    const jsonAssets = info.assets.filter((a) => a.asset_path.endsWith(".json"));
    assert.equal(jsonAssets.length, 0, "JSON files should not be assets");
  });

  it("asset id is filename without extension", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    const soldier = info.assets.find((a) => a.id === "keth_soldier_front_01");
    assert.ok(soldier, "ID should be filename without .png");
  });

  it("metadata_confidence higher for record-backed", async () => {
    const info = await scanVisualRepo(VISUAL_FIXTURE);
    const withRecord = info.assets.find((a) => a.record_path !== null);
    const withoutRecord = info.assets.find((a) => a.record_path === null);
    assert.ok(withRecord && withoutRecord);
    assert.ok(withRecord.metadata_confidence >= 0.8);
    assert.ok(withoutRecord.metadata_confidence <= 0.6);
  });
});

describe("scanVisualRepo — edge cases", () => {
  it("empty repo (no assets)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "visual-empty-"));
    const info = await scanVisualRepo(dir);
    assert.equal(info.assets.length, 0);
    assert.equal(info.structureTier, "messy");
    await rm(dir, { recursive: true, force: true });
  });

  it("structure partial when only status folders", async () => {
    const dir = await mkdtemp(join(tmpdir(), "visual-partial-"));
    await mkdir(join(dir, "assets", "approved"), { recursive: true });
    await writeFile(join(dir, "assets", "approved", "test.png"), Buffer.from([0x89, 0x50]));
    const info = await scanVisualRepo(dir);
    assert.equal(info.structureTier, "partial");
    await rm(dir, { recursive: true, force: true });
  });

  it("malformed JSON in records is skipped", async () => {
    const dir = await mkdtemp(join(tmpdir(), "visual-badjson-"));
    await mkdir(join(dir, "assets", "approved"), { recursive: true });
    await mkdir(join(dir, "records"), { recursive: true });
    await writeFile(join(dir, "assets", "approved", "test.png"), Buffer.from([0x89]));
    await writeFile(join(dir, "records", "test.json"), "not valid json!!!");
    const info = await scanVisualRepo(dir);
    assert.equal(info.assets.length, 1, "Asset should still be found");
    assert.equal(info.assets[0].record_path, null, "Malformed record not merged");
    await rm(dir, { recursive: true, force: true });
  });

  it("malformed comparison JSON is skipped", async () => {
    const dir = await mkdtemp(join(tmpdir(), "visual-badcmp-"));
    await mkdir(join(dir, "comparisons"), { recursive: true });
    await writeFile(join(dir, "comparisons", "bad.json"), "{{{");
    const info = await scanVisualRepo(dir);
    assert.equal(info.comparisons.length, 0);
    await rm(dir, { recursive: true, force: true });
  });
});
