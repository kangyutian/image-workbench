import assert from "node:assert/strict";
import test from "node:test";
import { validateVideoInput, videoModelInfo, videoPayloadFor } from "./videoModels.mjs";

test("serializes Seedance Mini with only supported image-to-video fields", () => {
  const payload = videoPayloadFor({
    kind: "video",
    modelId: "seedance-2-mini-image-to-video",
    prompt: "人物回头微笑",
    referenceImages: [{ url: "https://cdn.example/start.png" }],
    aspectRatio: "9:16",
    resolution: "1080p",
    duration: 5,
    generateAudio: true,
  });

  assert.deepEqual(payload, {
    prompt: "人物回头微笑",
    image: "https://cdn.example/start.png",
    aspect_ratio: "9:16",
    resolution: "1080p",
    duration: 5,
    generate_audio: true,
    enable_web_search: false,
  });
});

test("requires an action reference video for Kling motion control", () => {
  assert.deepEqual(
    validateVideoInput({
      kind: "video",
      modelId: "kling-3-std-motion-control",
      referenceImages: [{ url: "https://cdn.example/character.png" }],
      prompt: "",
      characterOrientation: "video",
    }),
    ["请上传动作参考视频。"],
  );
});

test("serializes new image-to-video models with model-specific fields", () => {
  assert.equal(videoModelInfo("seedance-2-fast-image-to-video").endpoint, "bytedance/seedance-2.0-fast/image-to-video");
  assert.equal(videoModelInfo("kling-3-pro-image-to-video").endpoint, "kwaivgi/kling-v3.0-pro/image-to-video");
  assert.equal(videoModelInfo("grok-imagine-video-v1.5-image-to-video").endpoint, "x-ai/grok-imagine-video-v1.5/image-to-video");

  assert.deepEqual(
    videoPayloadFor({
      modelId: "kling-3-pro-image-to-video",
      prompt: "Slow camera pan across the product",
      referenceImages: [{ url: "https://cdn.example/start.png" }],
      duration: 5,
    }),
    {
      image: "https://cdn.example/start.png",
      prompt: "Slow camera pan across the product",
      duration: 5,
    },
  );

  assert.deepEqual(
    videoPayloadFor({
      modelId: "grok-imagine-video-v1.5-image-to-video",
      prompt: "The subject turns toward the camera",
      referenceImages: [{ url: "https://cdn.example/start.png" }],
      duration: 6,
      resolution: "720p",
      aspectRatio: "9:16",
      generateAudio: true,
    }),
    {
      prompt: "The subject turns toward the camera",
      image: "https://cdn.example/start.png",
      duration: 6,
      resolution: "720p",
    },
  );
});
