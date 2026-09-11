import assert from "node:assert/strict";
import test from "node:test";
import {
  VIDEO_REMIX_LIMITS,
  VIDEO_REMIX_VIDEO_MODELS,
  invalidateShotAfterPromptEdit,
  normalizeVideoRemixSettings,
  publicVideoRemixProject,
  recomputeVideoRemixStatus,
  validateVideoRemixDraft,
} from "../shared/videoRemixModels.mjs";

test("normalizes a remix to explicit supported project-wide settings", () => {
  assert.deepEqual(normalizeVideoRemixSettings({
    aspectRatio: "9:16",
    imageModelId: "gpt-image-2.5-sunburst",
    videoModelId: "seedance-2-fast-image-to-video",
  }), {
    aspectRatio: "9:16",
    imageModelId: "gpt-image-2.5-sunburst",
    videoModelId: "seedance-2-fast-image-to-video",
    clipDuration: 5,
  });
});

test("rejects unsupported video model, ratio, and non-five-second output", () => {
  const errors = validateVideoRemixDraft({
    aspectRatio: "4:3",
    imageModelId: "gpt-image-2.5-sunburst",
    videoModelId: "kling-3-std-motion-control",
    clipDuration: 10,
  });

  assert.match(errors.join(" "), /画面比例/);
  assert.match(errors.join(" "), /仅支持 Kling 或 Seedance 图生视频/);
  assert.match(errors.join(" "), /固定为 5 秒/);
});

test("validates shot count, timing, and required prompts", () => {
  const errors = validateVideoRemixDraft({
    aspectRatio: "9:16",
    imageModelId: "gpt-image-2.5-sunburst",
    videoModelId: "kling-3-pro-image-to-video",
    clipDuration: 5,
    shots: [
      { id: "shot-1", startSeconds: 4, endSeconds: 2, imagePrompt: "", videoPrompt: "" },
    ],
  });

  assert.match(errors.join(" "), /3–8/);
  assert.match(errors.join(" "), /结束时间必须晚于开始时间/);
  assert.match(errors.join(" "), /图像提示词不能为空/);
  assert.match(errors.join(" "), /视频提示词不能为空/);
});

test("summarizes shot progress without leaving terminal failures as queued", () => {
  assert.equal(recomputeVideoRemixStatus([]), "draft");
  assert.equal(recomputeVideoRemixStatus([
    { imageStatus: "approved", videoStatus: "idle" },
    { imageStatus: "error", videoStatus: "idle" },
  ]), "partial");
  assert.equal(recomputeVideoRemixStatus([
    { imageStatus: "approved", videoStatus: "done" },
    { imageStatus: "approved", videoStatus: "done" },
  ]), "done");
  assert.equal(recomputeVideoRemixStatus([
    { imageStatus: "queued", videoStatus: "idle" },
  ]), "running");
});

test("prompt edits invalidate only the affected downstream clip", () => {
  const updated = invalidateShotAfterPromptEdit({
    id: "shot-2",
    imageResultUrl: "https://cdn.test/shot-2.png",
    imageStatus: "approved",
    imageApprovedAt: "2026-09-12T00:00:00.000Z",
    videoStatus: "done",
    videoTaskId: "task-video-2",
    videoResultUrl: "https://cdn.test/shot-2.mp4",
    videoError: "",
  });

  assert.equal(updated.imageStatus, "ready");
  assert.equal(updated.imageApprovedAt, null);
  assert.equal(updated.videoStatus, "idle");
  assert.equal(updated.videoTaskId, "");
  assert.equal(updated.videoResultUrl, "");
});

test("public project serialization removes private paths, tokens, and provider internals", () => {
  const result = publicVideoRemixProject({
    id: "remix-1",
    owner: "alice",
    accountId: "account-a",
    sourceVideo: { stagedPath: "remix-1/source.mp4", uploadToken: "secret", mediaId: "source-1" },
    openAiResponse: { id: "resp-secret", output: [] },
    productImages: [{ id: "product-1", stagedPath: "remix-1/product.png", mediaId: "product-1" }],
    shots: [{ id: "shot-1", sourceFrame: { stagedPath: "remix-1/frame.jpg", mediaId: "frame-1" } }],
  });

  assert.equal(result.owner, undefined);
  assert.equal(result.accountId, undefined);
  assert.equal(result.sourceVideo.stagedPath, undefined);
  assert.equal(result.sourceVideo.uploadToken, undefined);
  assert.equal(result.openAiResponse, undefined);
  assert.equal(result.productImages[0].stagedPath, undefined);
  assert.equal(result.shots[0].sourceFrame.stagedPath, undefined);
  assert.equal(result.sourceVideo.mediaId, "source-1");
});

test("declares only the supported fixed-duration video models", () => {
  assert.equal(VIDEO_REMIX_LIMITS.maxDurationSeconds, 20);
  assert.equal(VIDEO_REMIX_LIMITS.clipDuration, 5);
  assert.equal(VIDEO_REMIX_VIDEO_MODELS.has("kling-3-std-motion-control"), false);
  assert.equal(VIDEO_REMIX_VIDEO_MODELS.has("kling-3-pro-image-to-video"), true);
});
