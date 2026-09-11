import assert from "node:assert/strict";
import test from "node:test";
import { maxVideoReferenceImages } from "../shared/videoFramePolicy.mjs";

test("only documented image-to-video models support an end frame", () => {
  for (const id of [
    "seedance-2-mini-image-to-video",
    "seedance-2-image-to-video",
    "seedance-2-fast-image-to-video",
    "kling-3-std-image-to-video",
    "kling-3-pro-image-to-video",
  ]) assert.equal(maxVideoReferenceImages(id), 2);
  assert.equal(maxVideoReferenceImages("grok-imagine-video-v1.5-image-to-video"), 1);
  assert.equal(maxVideoReferenceImages("kling-3-std-motion-control"), 1);
});
