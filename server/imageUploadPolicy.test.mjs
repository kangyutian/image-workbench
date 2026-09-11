import assert from "node:assert/strict";
import test from "node:test";
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_TARGET_BYTES, needsImageCompression } from "../shared/imageUploadPolicy.mjs";

test("uses a strict ten-megabyte provider limit and an eight-megabyte compression target", () => {
  assert.equal(IMAGE_UPLOAD_MAX_BYTES, 10 * 1024 * 1024);
  assert.equal(IMAGE_UPLOAD_TARGET_BYTES, 8 * 1024 * 1024);
  assert.equal(needsImageCompression(IMAGE_UPLOAD_MAX_BYTES - 1), false);
  assert.equal(needsImageCompression(IMAGE_UPLOAD_MAX_BYTES), true);
  assert.equal(needsImageCompression(IMAGE_UPLOAD_MAX_BYTES + 1), true);
});
