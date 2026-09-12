import assert from "node:assert/strict";
import test from "node:test";
import { VideoRemixStore } from "./videoRemixStore.mjs";
import {
  allStoryboardShotsApproved,
  imageRequestForShot,
  remixTaskMetadata,
  syncRemixTaskResult,
  videoRequestForShot,
} from "./videoRemixOrchestrator.mjs";

function project() {
  return {
    id: "remix-1",
    aspectRatio: "9:16",
    imageModelId: "gpt-image-2.5-sunburst",
    videoModelId: "kling-3-pro-image-to-video",
    productImages: [{ mediaId: "product-1", fileName: "bottle.png", stagedPath: "product-1.png", mimeType: "image/png" }],
    shots: [
      { id: "shot-01", imageStatus: "ready", imageResultUrl: "", imageTaskId: "", videoStatus: "idle", videoResultUrl: "" },
      { id: "shot-02", imageStatus: "approved", imageResultUrl: "https://cdn.test/shot-2.png", imageTaskId: "task-image-2", videoStatus: "idle", videoResultUrl: "" },
    ],
  };
}

test("builds an image task with the source frame first and product identity lock", () => {
  const request = imageRequestForShot(project(), {
    ...project().shots[0],
    imagePrompt: "户外岩石上的保温杯产品特写",
    sourceFrame: { mediaId: "frame-1", fileName: "frame.jpg", stagedPath: "frame.jpg", mimeType: "image/jpeg" },
  }, [{ mediaId: "frame-1" }, { mediaId: "product-1" }]);

  assert.equal(request.provider, "image2");
  assert.equal(request.nanoModel, "gpt-image-2.5-sunburst");
  assert.equal(request.images[0].mediaId, "frame-1");
  assert.equal(request.images[1].mediaId, "product-1");
  assert.match(request.prompt, /uploaded product references|上传的产品参考图/);
  assert.match(request.prompt, /Do not add accessories|不要增加配件/);
});

test("builds a fixed five-second silent video task from one storyboard result", () => {
  const request = videoRequestForShot(project(), {
    ...project().shots[1],
    videoPrompt: "镜头缓慢推进，产品轻微转动",
  });

  assert.equal(request.kind, "video");
  assert.equal(request.modelId, "kling-3-pro-image-to-video");
  assert.equal(request.duration, 5);
  assert.equal(request.generateAudio, false);
  assert.deepEqual(request.referenceImages, [{ url: "https://cdn.test/shot-2.png" }]);
});

test("marks remix tasks for the dedicated video credential scope", () => {
  assert.deepEqual(remixTaskMetadata("remix-1", "shot-01", "storyboard"), {
    remixProjectId: "remix-1",
    remixShotId: "shot-01",
    remixStage: "storyboard",
    credentialScope: "video-remix",
  });
});

test("syncs one child task result back to exactly one remix shot", () => {
  const store = {
    patchShot(projectId, shotId, changes) {
      assert.equal(projectId, "remix-1");
      assert.equal(shotId, "shot-01");
      assert.deepEqual(changes, { imageStatus: "ready", imageTaskId: "task-image-1", imageResultUrl: "https://cdn.test/shot-1.png", imageError: "" });
      return { id: projectId };
    },
  };

  syncRemixTaskResult({
    projectStore: store,
    task: { remixProjectId: "remix-1", remixShotId: "shot-01", remixStage: "storyboard", id: "task-image-1", status: "done", results: [{ url: "https://cdn.test/shot-1.png" }], error: "" },
  });
});

test("requires every shot to be approved before video generation", () => {
  assert.equal(allStoryboardShotsApproved(project().shots), false);
  assert.equal(allStoryboardShotsApproved(project().shots.map((shot) => ({ ...shot, imageStatus: "approved" }))), true);
});
