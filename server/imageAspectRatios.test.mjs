import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMON_ASPECT_RATIOS,
  EDIT_MULTI_ASPECT_RATIOS,
  IMAGE2_ASPECT_RATIOS,
  aspectRatiosFor,
  normalizeAspectRatio,
} from "./imageAspectRatios.mjs";

const expectedImage2Ratios = ["1:1", "1:2", "2:1", "1:3", "3:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "9:21", "21:9"];

test("Image 2 exposes all WaveSpeed-supported aspect-ratio presets", () => {
  assert.deepEqual(IMAGE2_ASPECT_RATIOS, expectedImage2Ratios);
  assert.deepEqual(aspectRatiosFor({ provider: "image2" }), expectedImage2Ratios);
});

test("Image 2 preserves valid ratios and normalizes unsupported ratios", () => {
  const valid = { provider: "image2", aspectRatio: "21:9" };
  assert.equal(normalizeAspectRatio(valid).aspectRatio, "21:9");

  const invalid = { provider: "image2", aspectRatio: "7:5" };
  assert.equal(normalizeAspectRatio(invalid).aspectRatio, "1:1");
});

test("non-Image-2 ratio collections remain unchanged", () => {
  assert.deepEqual(aspectRatiosFor({ provider: "nanobanana", nanoModel: "nano-banana-2" }), COMMON_ASPECT_RATIOS);
  assert.deepEqual(aspectRatiosFor({ provider: "nanobanana", nanoModel: "nano-banana-pro-edit-multi" }), EDIT_MULTI_ASPECT_RATIOS);
});
