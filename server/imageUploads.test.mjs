import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  claimStagedUploadReferences,
  cleanupStagedImageFiles,
  cleanupStagedImages,
  fileForStagedImage,
  publicTask,
  purgeExpiredStagedUploads,
  stageImagesLocally,
  uploadImagesInParallel,
  validateReferenceImageCount,
} from "./imageUploads.mjs";
import { TaskStore } from "./taskStore.mjs";

test("starts every dual-image upload before either upload finishes", async () => {
  const started = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pending = uploadImagesInParallel([{ id: "first" }, { id: "second" }], async (image) => {
    started.push(image.id);
    await gate;
    return `${image.id}-url`;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["first", "second"]);
  release();
  assert.deepEqual(await pending, ["first-url", "second-url"]);
});

test("limits background image uploads to two at a time", async () => {
  const started = [];
  const releases = new Map();
  const pending = uploadImagesInParallel([{ id: "first" }, { id: "second" }, { id: "third" }], async (image) => {
    started.push(image.id);
    await new Promise((resolve) => releases.set(image.id, resolve));
    return `${image.id}-url`;
  }, 2);

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["first", "second"]);
  releases.get("first")();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["first", "second", "third"]);
  releases.get("second")();
  releases.get("third")();
  assert.deepEqual(await pending, ["first-url", "second-url", "third-url"]);
});

test("rejects more than ten reference images in one task", () => {
  assert.throws(
    () => validateReferenceImageCount(Array.from({ length: 11 }, (_, index) => ({ id: String(index) })), 10),
    /最多.*10/,
  );
  assert.equal(validateReferenceImageCount(Array.from({ length: 10 }, (_, index) => ({ id: String(index) })), 10), 10);
});

test("stages image bytes locally without retaining base64 in the task", () => {
  const root = mkdtempSync(join(tmpdir(), "image-workbench-stage-"));
  try {
    const staged = stageImagesLocally([
      { id: "first", fileName: "first.png", mimeType: "image/png", size: 3, dataUrl: "data:image/png;base64,AQID" },
      { id: "second", fileName: "second.jpg", mimeType: "image/jpeg", size: 2, dataUrl: "data:image/jpeg;base64,BAU=" },
    ], { taskId: "task-123", root, maxBytes: 1024 });

    assert.equal(staged.length, 2);
    assert.equal("dataUrl" in staged[0], false);
    assert.equal("dataUrl" in staged[1], false);
    assert.deepEqual(fileForStagedImage(staged[0], { root }).buffer, Buffer.from([1, 2, 3]));
    assert.deepEqual(fileForStagedImage(staged[1], { root }).buffer, Buffer.from([4, 5]));
    assert.deepEqual(readFileSync(join(root, "task-123", "0.png")), Buffer.from([1, 2, 3]));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps existing public image URLs without writing a staged file", () => {
  const root = mkdtempSync(join(tmpdir(), "image-workbench-stage-"));
  try {
    const staged = stageImagesLocally([
      { id: "remote", fileName: "remote.png", mimeType: "image/png", size: 12, dataUrl: "https://media.example/remote.png" },
    ], { taskId: "task-remote", root, maxBytes: 1024 });

    assert.deepEqual(staged, [
      { id: "remote", fileName: "remote.png", mimeType: "image/png", size: 12, dataUrl: "https://media.example/remote.png" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("public task responses hide local paths and inline image bytes", () => {
  const task = publicTask({
    id: "task-123",
    input: {
      prompt: "merge",
      images: [
        { id: "first", fileName: "first.png", mimeType: "image/png", size: 3, stagedPath: "task-123/0.png", dataUrl: "data:image/png;base64,AQID" },
        { id: "remote", fileName: "remote.png", mimeType: "image/png", size: 12, dataUrl: "https://media.example/remote.png" },
      ],
    },
  });

  assert.deepEqual(task.input.images, [
    { id: "first", fileName: "first.png", mimeType: "image/png", size: 3 },
    { id: "remote", fileName: "remote.png", mimeType: "image/png", size: 12, dataUrl: "https://media.example/remote.png" },
  ]);
  assert.equal(JSON.stringify(task).includes("stagedPath"), false);
  assert.equal(JSON.stringify(task).includes("base64"), false);
});

test("cleanup removes only the selected task staging directory", () => {
  const root = mkdtempSync(join(tmpdir(), "image-workbench-stage-"));
  try {
    const staged = stageImagesLocally([
      { id: "first", fileName: "first.png", mimeType: "image/png", size: 3, dataUrl: "data:image/png;base64,AQID" },
    ], { taskId: "task-clean", root, maxBytes: 1024 });
    stageImagesLocally([
      { id: "other", fileName: "other.png", mimeType: "image/png", size: 2, dataUrl: "data:image/png;base64,BAU=" },
    ], { taskId: "task-keep", root, maxBytes: 1024 });

    cleanupStagedImages("task-clean", { root });
    assert.throws(() => fileForStagedImage(staged[0], { root }));
    assert.deepEqual(readFileSync(join(root, "task-keep", "0.png")), Buffer.from([4, 5]));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("claims owner-matched staged uploads once and returns internal file metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "image-workbench-claim-"));
  try {
    const store = new TaskStore({ file: join(root, "uploads.json") });
    store.create({
      id: "upload-one",
      owner: "alice",
      image: { id: "first", fileName: "first.png", mimeType: "image/png", size: 3, stagedPath: "upload-one/0.png" },
      claimedBy: null,
    });

    assert.deepEqual(claimStagedUploadReferences([
      { id: "first", fileName: "first.png", mimeType: "image/png", size: 3, stagedUploadId: "upload-one" },
    ], { owner: "alice", taskId: "task-one", store }), [
      { id: "first", fileName: "first.png", mimeType: "image/png", size: 3, stagedPath: "upload-one/0.png" },
    ]);
    assert.equal(store.get("upload-one").claimedBy, "task-one");
    assert.throws(
      () => claimStagedUploadReferences([{ stagedUploadId: "upload-one" }], { owner: "alice", taskId: "task-two", store }),
      /不可用|使用/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleans every unique upload directory referenced by a completed task", () => {
  const root = mkdtempSync(join(tmpdir(), "image-workbench-clean-inputs-"));
  try {
    stageImagesLocally([
      { id: "first", fileName: "first.png", mimeType: "image/png", size: 3, dataUrl: "data:image/png;base64,AQID" },
    ], { taskId: "upload-one", root, maxBytes: 1024 });
    stageImagesLocally([
      { id: "second", fileName: "second.png", mimeType: "image/png", size: 2, dataUrl: "data:image/png;base64,BAU=" },
    ], { taskId: "upload-two", root, maxBytes: 1024 });

    cleanupStagedImageFiles([
      { stagedPath: "upload-one/0.png" },
      { stagedPath: "upload-two/0.png" },
      { stagedPath: "upload-one/0.png" },
    ], { root });
    assert.throws(() => readFileSync(join(root, "upload-one", "0.png")));
    assert.throws(() => readFileSync(join(root, "upload-two", "0.png")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("purges abandoned uploads while retaining the retry window for claimed files", () => {
  const root = mkdtempSync(join(tmpdir(), "image-workbench-purge-"));
  try {
    const store = new TaskStore({ file: join(root, "uploads.json") });
    const imagesRoot = join(root, "images");
    const dataUrl = "data:image/png;base64,AQID";
    for (const id of ["old-unclaimed", "recent-claimed", "old-claimed", "consumed"]) {
      const image = stageImagesLocally([{ id, fileName: `${id}.png`, mimeType: "image/png", dataUrl }], { taskId: id, root: imagesRoot, maxBytes: 1024 })[0];
      store.create({
        id,
        owner: "alice",
        image,
        claimedBy: id.includes("claimed") ? "task-1" : null,
        consumedAt: id === "consumed" ? "2026-01-10T00:00:00.000Z" : null,
        createdAt: id === "recent-claimed" ? "2026-01-09T00:00:00.000Z" : "2026-01-01T00:00:00.000Z",
      });
    }

    const removed = purgeExpiredStagedUploads({
      store,
      root: imagesRoot,
      now: new Date("2026-01-10T12:00:00.000Z"),
      unclaimedTtlMs: 24 * 60 * 60 * 1000,
      claimedTtlMs: 7 * 24 * 60 * 60 * 1000,
    });

    assert.deepEqual(removed.sort(), ["consumed", "old-claimed", "old-unclaimed"]);
    assert.equal(store.get("recent-claimed")?.claimedBy, "task-1");
    assert.deepEqual(readFileSync(join(imagesRoot, "recent-claimed", "0.png")), Buffer.from([1, 2, 3]));
    assert.throws(() => readFileSync(join(imagesRoot, "old-unclaimed", "0.png")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
