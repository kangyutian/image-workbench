import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { validateProbedVideo } from "./videoRemixUploads.mjs";

const execFileAsync = promisify(execFile);

export async function probeVideo(filePath, { ffprobePath } = {}) {
  if (!ffprobePath) throw new Error("服务器未配置 ffprobe。");
  const { stdout } = await execFileAsync(ffprobePath, [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,width,height",
    "-of", "json",
    filePath,
  ], { maxBuffer: 1024 * 1024 });
  const parsed = JSON.parse(stdout);
  const videoStream = Array.isArray(parsed.streams) ? parsed.streams.find((stream) => stream.codec_type === "video") : null;
  return validateProbedVideo({
    durationSeconds: Number(parsed.format?.duration),
    width: Number(videoStream?.width),
    height: Number(videoStream?.height),
  });
}

export async function extractAnalysisFrames(filePath, { outputDir, durationSeconds, maxFrames = 12, ffmpegPath } = {}) {
  if (!ffmpegPath) throw new Error("服务器未配置 ffmpeg。");
  const duration = Number(durationSeconds);
  const frameCount = Math.max(1, Math.min(12, Number(maxFrames) || 12));
  await mkdir(outputDir, { recursive: true });
  const frames = [];

  for (let index = 0; index < frameCount; index += 1) {
    const timestampSeconds = Math.min(Math.max(0.01, ((index + 0.5) / frameCount) * duration), Math.max(0.01, duration - 0.01));
    const fileName = `frame-${String(index + 1).padStart(3, "0")}.jpg`;
    const outputPath = join(outputDir, fileName);
    await execFileAsync(ffmpegPath, [
      "-hide_banner", "-loglevel", "error",
      "-ss", timestampSeconds.toFixed(3),
      "-i", filePath,
      "-frames:v", "1",
      "-vf", "scale=1024:1024:force_original_aspect_ratio=decrease",
      "-q:v", "2",
      "-y", outputPath,
    ], { maxBuffer: 1024 * 1024 });
    frames.push({ index, fileName, timestampSeconds, mimeType: "image/jpeg", absolutePath: outputPath });
  }

  return frames;
}

export async function frameDataUrl(filePath) {
  const encoded = (await readFile(filePath)).toString("base64");
  return `data:image/jpeg;base64,${encoded}`;
}

export function frameRelativePath(frame, root) {
  return basename(frame.absolutePath).startsWith("frame-") ? frame.absolutePath.replace(`${root}/`, "").replace(`${root}\\`, "") : frame.absolutePath;
}
