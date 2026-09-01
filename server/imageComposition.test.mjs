import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { composeSubjectOnFixedBackground, normalizeBackgroundToFixedCanvas } from "./imageComposition.mjs";

test("normalizes a custom background to the fixed 4:5 suite canvas without transparent bars", async () => {
  const source = await sharp({
    create: { width: 8, height: 4, channels: 3, background: { r: 224, g: 228, b: 232 } },
  }).png().toBuffer();

  const normalized = await normalizeBackgroundToFixedCanvas(source, { width: 40, height: 50 });
  const metadata = await sharp(normalized).metadata();

  assert.deepEqual({ width: metadata.width, height: metadata.height, format: metadata.format }, { width: 40, height: 50, format: "png" });
});

test("composites the cutout subject over the supplied background and keeps background pixels intact", async () => {
  const background = await sharp({
    create: { width: 40, height: 50, channels: 4, background: { r: 224, g: 228, b: 232, alpha: 1 } },
  }).png().toBuffer();
  const subject = await sharp({
    create: { width: 16, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: await sharp({ create: { width: 6, height: 8, channels: 4, background: { r: 20, g: 130, b: 180, alpha: 1 } } }).png().toBuffer(), left: 5, top: 6 }]).png().toBuffer();

  const output = await composeSubjectOnFixedBackground(background, subject, { width: 40, height: 50 });
  const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  assert.deepEqual({ width: info.width, height: info.height, channels: info.channels }, { width: 40, height: 50, channels: 4 });
  assert.deepEqual([...data.subarray(0, 4)], [224, 228, 232, 255]);
});
