import assert from "node:assert/strict";
import test from "node:test";
import {
  envKeyForModelRequest,
  klingImageModelInfo,
  klingImagePayloadFor,
  requiresDedicatedKlingImageKey,
  validateKlingImageInput,
} from "./klingImageModels.mjs";

test("registers the three Kling image endpoints", () => {
  assert.equal(klingImageModelInfo("kling-image-v3-edit").endpoint, "kwaivgi/kling-image-v3/edit");
  assert.equal(klingImageModelInfo("kling-image-o3-edit").endpoint, "kwaivgi/kling-image-o3/edit");
  assert.equal(klingImageModelInfo("kling-image-o1").endpoint, "kwaivgi/kling-image-o1");
});

test("V3 Edit accepts exactly one reference image and uses image", () => {
  assert.deepEqual(
    validateKlingImageInput({ nanoModel: "kling-image-v3-edit", prompt: "Change the background" }, ["one"]),
    [],
  );
  assert.deepEqual(
    validateKlingImageInput({ nanoModel: "kling-image-v3-edit", prompt: "Change the background" }, ["one", "two"]),
    ["Kling Image V3 Edit 只支持 1 张参考图。"],
  );
  assert.deepEqual(
    klingImagePayloadFor(
      { nanoModel: "kling-image-v3-edit", prompt: "Change the background", aspectRatio: "16:9", resolution: "2k", count: 2 },
      ["one"],
    ),
    { prompt: "Change the background", image: "one", aspect_ratio: "16:9", resolution: "2k", num_images: 2, output_format: "png" },
  );
});

test("O3 Edit accepts multiple references and sends images", () => {
  assert.deepEqual(validateKlingImageInput({ nanoModel: "kling-image-o3-edit", prompt: "Combine the references" }, ["one", "two"]), []);
  assert.deepEqual(
    klingImagePayloadFor(
      { nanoModel: "kling-image-o3-edit", prompt: "Combine the references", aspectRatio: "1:1", resolution: "1k", count: 1 },
      ["one", "two"],
    ),
    { prompt: "Combine the references", images: ["one", "two"], aspect_ratio: "1:1", resolution: "1k", num_images: 1, output_format: "png" },
  );
});

test("O1 supports one to ten reference images", () => {
  assert.deepEqual(validateKlingImageInput({ nanoModel: "kling-image-o1", prompt: "Create a consistent product scene" }, []), []);
  assert.deepEqual(validateKlingImageInput({ nanoModel: "kling-image-o1", prompt: "Create a consistent product scene" }, Array(11).fill("image")), ["Kling Image O1 最多支持 10 张参考图。"]);
});

test("uses dedicated credentials for Kling image models", () => {
  assert.equal(envKeyForModelRequest({ provider: "nanobanana", nanoModel: "kling-image-v3-edit" }), "WAVESPEED_KLING_IMAGE_V3_EDIT_KEY");
  assert.equal(envKeyForModelRequest({ provider: "nanobanana", nanoModel: "kling-image-o3-edit" }), "WAVESPEED_KLING_IMAGE_O3_EDIT_KEY");
  assert.equal(envKeyForModelRequest({ provider: "nanobanana", nanoModel: "kling-image-o1" }), "WAVESPEED_KLING_IMAGE_O1_KEY");
});

test("requires a dedicated credential for known Kling image models", () => {
  assert.equal(requiresDedicatedKlingImageKey({ provider: "kling", nanoModel: "kling-image-v3-edit" }), true);
  assert.equal(requiresDedicatedKlingImageKey({ provider: "kling", nanoModel: "unknown-kling-model" }), false);
  assert.equal(requiresDedicatedKlingImageKey({ provider: "grok", nanoModel: "grok-2-image" }), false);
});
