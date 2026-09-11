import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ffmpegPath from "ffmpeg-static";
import ffprobePackage from "ffprobe-static";
import { extractAnalysisFrames, probeVideo } from "./videoProbe.mjs";

const execFileAsync = promisify(execFile);
const ffprobePath = ffprobePackage.path;

test("probes a short fixture and extracts timestamped JPEG analysis frames", async () => {
  const root = await mkdtemp(join(tmpdir(), "video-remix-probe-"));
  const input = join(root, "fixture.mp4");
  const frames = join(root, "frames");
  try {
    await execFileAsync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=640x360:r=12", "-t", "2", "-pix_fmt", "yuv420p", input]);
    const metadata = await probeVideo(input, { ffprobePath });
    assert.ok(metadata.durationSeconds > 1.9 && metadata.durationSeconds <= 2.1);
    assert.equal(metadata.width, 640);
    assert.equal(metadata.height, 360);

    const extracted = await extractAnalysisFrames(input, { outputDir: frames, durationSeconds: metadata.durationSeconds, maxFrames: 4, ffmpegPath });
    assert.equal(extracted.length, 4);
    for (const frame of extracted) {
      assert.match(frame.mimeType, /^image\/jpeg$/);
      assert.ok(frame.timestampSeconds > 0 && frame.timestampSeconds < metadata.durationSeconds);
      assert.ok((await readFile(join(frames, frame.fileName))).length > 100);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
