import assert from "node:assert/strict";
import test from "node:test";
import { orderedVideoReferences } from "../shared/videoFramePolicy.mjs";

test("keeps a single start frame valid", () => {
  assert.deepEqual(orderedVideoReferences("start", "", "seedance-2-image-to-video"), [{ url: "start" }]);
});

test("includes the end frame only for supported models", () => {
  assert.deepEqual(orderedVideoReferences("start", "end", "kling-3-std-image-to-video"), [{ url: "start" }, { url: "end" }]);
  assert.deepEqual(orderedVideoReferences("start", "end", "grok-imagine-video-v1.5-image-to-video"), [{ url: "start" }]);
});
