import assert from "node:assert/strict";
import test from "node:test";
import { envKeyForModelRequest, grokImageModelInfo, grokPayloadFor, validateGrokImageInput } from "./grokModels.mjs";

test("returns documented endpoint and fields for Grok image models", () => {
  assert.equal(grokImageModelInfo("grok-2-image").endpoint, "x-ai/grok-2-image");
  assert.equal(grokImageModelInfo("grok-imagine-image-quality").endpoint, "x-ai/grok-imagine-image-quality/text-to-image");

  assert.deepEqual(
    grokPayloadFor(
      {
        nanoModel: "grok-imagine-image-quality",
        prompt: "A polished studio product photograph",
        aspectRatio: "16:9",
        resolution: "2k",
        count: 3,
      },
      [],
    ),
    {
      prompt: "A polished studio product photograph",
      aspect_ratio: "16:9",
      resolution: "2k",
      num_images: 3,
      output_format: "png",
    },
  );
});

test("requires exactly one source image for Grok image edit", () => {
  assert.deepEqual(
    validateGrokImageInput({ nanoModel: "grok-imagine-image-edit", prompt: "Replace the background" }, []),
    ["Grok Imagine Image Edit 需要恰好一张参考图。"],
  );
  assert.deepEqual(
    grokPayloadFor(
      { nanoModel: "grok-imagine-image-edit", prompt: "Replace the background" },
      ["https://cdn.example/source.png"],
    ),
    { prompt: "Replace the background", image: "https://cdn.example/source.png" },
  );
});

test("uses a dedicated credential name for every added Grok model", () => {
  assert.equal(envKeyForModelRequest({ provider: "grok", nanoModel: "grok-2-image" }), "WAVESPEED_GROK_2_IMAGE_KEY");
  assert.equal(envKeyForModelRequest({ provider: "grok", nanoModel: "grok-imagine-image-edit" }), "WAVESPEED_GROK_IMAGINE_IMAGE_EDIT_KEY");
  assert.equal(envKeyForModelRequest({ provider: "grok", nanoModel: "grok-imagine-image-quality" }), "WAVESPEED_GROK_IMAGINE_IMAGE_QUALITY_KEY");
  assert.equal(envKeyForModelRequest({ kind: "video", modelId: "grok-imagine-video-v1.5-image-to-video" }), "WAVESPEED_GROK_IMAGINE_VIDEO_V15_I2V_KEY");
  assert.equal(envKeyForModelRequest({ kind: "video", modelId: "seedance-2-fast-image-to-video" }), "WAVESPEED_SEEDANCE_2_FAST_KEY");
  assert.equal(envKeyForModelRequest({ kind: "video", modelId: "kling-3-pro-image-to-video" }), "WAVESPEED_KLING_3_PRO_I2V_KEY");
});
