import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveProjectMediaDirectory, validateUploadMetadata, validateProbedVideo } from "./videoRemixUploads.mjs";

test("rejects unsupported video MIME types and oversized files", () => {
  assert.throws(() => validateUploadMetadata({ mimeType: "image/png", size: 20 }), /MP4、WebM 或 MOV/);
  assert.throws(() => validateUploadMetadata({ mimeType: "video/mp4", size: 100 * 1024 * 1024 + 1 }), /100MB/);
  assert.deepEqual(validateUploadMetadata({ mimeType: "video/mp4", size: 1024 }), { mimeType: "video/mp4", size: 1024 });
});

test("rejects a probed source video longer than twenty seconds", () => {
  assert.throws(() => validateProbedVideo({ durationSeconds: 20.01, width: 1080, height: 1920 }), /20 秒以内/);
  assert.throws(() => validateProbedVideo({ durationSeconds: 0, width: 1080, height: 1920 }), /无法读取/);
  assert.deepEqual(validateProbedVideo({ durationSeconds: 20, width: 1080, height: 1920 }), { durationSeconds: 20, width: 1080, height: 1920 });
});

test("cleanup cannot escape the configured remix media root", async () => {
  const root = await mkdtemp(join(tmpdir(), "video-remix-media-root-"));
  try {
    assert.throws(() => resolveProjectMediaDirectory("../outside", { root }), /无效的项目目录/);
    const projectRoot = resolveProjectMediaDirectory("remix-1", { root });
    await writeFile(join(projectRoot, "marker.txt"), "ok").catch(async () => {
      await rm(projectRoot, { recursive: true, force: true });
    });
    assert.match(projectRoot, /remix-1$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
