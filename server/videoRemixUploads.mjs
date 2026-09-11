import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { once } from "node:events";
import { VIDEO_REMIX_LIMITS } from "../shared/videoRemixModels.mjs";

const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function assertWithinRoot(target, root) {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const relativeTarget = relative(resolvedRoot, resolvedTarget);
  if (!relativeTarget || relativeTarget.startsWith(`..${sep}`) || relativeTarget === ".." || relativeTarget.includes(`..${sep}`)) {
    throw new Error("无效的项目目录。");
  }
  return resolvedTarget;
}

export function validateUploadMetadata({ mimeType, size } = {}) {
  if (!VIDEO_MIME_TYPES.has(String(mimeType || "").toLowerCase())) throw new Error("视频仅支持 MP4、WebM 或 MOV 文件。");
  const normalizedSize = Number(size);
  if (!Number.isFinite(normalizedSize) || normalizedSize <= 0) throw new Error("视频文件不能为空。");
  if (normalizedSize > VIDEO_REMIX_LIMITS.maxVideoBytes) throw new Error("视频文件不能超过 100MB。");
  return { mimeType: String(mimeType).toLowerCase(), size: normalizedSize };
}

export function validateProbedVideo({ durationSeconds, width, height } = {}) {
  const duration = Number(durationSeconds);
  const normalizedWidth = Number(width);
  const normalizedHeight = Number(height);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(normalizedWidth) || normalizedWidth <= 0 || !Number.isFinite(normalizedHeight) || normalizedHeight <= 0) {
    throw new Error("无法读取视频时长或尺寸。");
  }
  if (duration > VIDEO_REMIX_LIMITS.maxDurationSeconds + 0.0001) throw new Error("视频时长必须在 20 秒以内。");
  return { durationSeconds: duration, width: normalizedWidth, height: normalizedHeight };
}

export function resolveProjectMediaDirectory(projectId, { root }) {
  const normalizedId = String(projectId || "");
  if (!/^[a-zA-Z0-9_-]+$/.test(normalizedId)) throw new Error("无效的项目目录。");
  return assertWithinRoot(resolve(root, normalizedId), root);
}

export function resolveProjectMediaPath(projectId, mediaName, { root }) {
  const projectDirectory = resolveProjectMediaDirectory(projectId, { root });
  const normalizedName = String(mediaName || "");
  if (!normalizedName || normalizedName.includes("\\") || normalizedName.split("/").some((segment) => segment === "..")) throw new Error("无效的媒体路径。");
  return assertWithinRoot(resolve(projectDirectory, normalizedName), projectDirectory);
}

export async function receiveVideoUpload(req, { root, projectId, fileName, mimeType, size } = {}) {
  const declaredSize = size || req.headers?.["content-length"];
  const metadata = declaredSize ? validateUploadMetadata({ mimeType, size: declaredSize }) : (() => {
    if (!VIDEO_MIME_TYPES.has(String(mimeType || "").toLowerCase())) throw new Error("视频仅支持 MP4、WebM 或 MOV 文件。");
    return { mimeType: String(mimeType).toLowerCase() };
  })();
  const projectDirectory = resolveProjectMediaDirectory(projectId, { root });
  const sourceDirectory = resolve(projectDirectory, "source");
  await mkdir(sourceDirectory, { recursive: true });
  const safeName = String(fileName || "source-video").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "source-video";
  const targetPath = resolve(sourceDirectory, `${Date.now()}-${safeName}`);
  const temporaryPath = `${targetPath}.part`;
  const output = createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 });
  let received = 0;
  try {
    for await (const chunk of req) {
      received += chunk.length;
      if (received > VIDEO_REMIX_LIMITS.maxVideoBytes) throw new Error("视频文件不能超过 100MB。");
      if (!output.write(chunk)) await once(output, "drain");
    }
    output.end();
    await once(output, "close");
    if (received === 0) throw new Error("视频文件不能为空。");
    if (size && received !== Number(size)) throw new Error("视频上传不完整，请重试。");
    const finalPath = resolveProjectMediaPath(projectId, `source/${targetPath.split(sep).pop()}`, { root });
    const { rename } = await import("node:fs/promises");
    await rename(temporaryPath, finalPath);
    return { fileName: safeName, mimeType: metadata.mimeType, size: received, stagedPath: `source/${finalPath.split(sep).pop()}` };
  } catch (error) {
    output.destroy();
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function removeVideoRemixDirectory(projectId, { root }) {
  const projectDirectory = resolveProjectMediaDirectory(projectId, { root });
  await rm(projectDirectory, { recursive: true, force: true });
}

export function mediaAbsolutePath(projectId, stagedPath, { root }) {
  return resolveProjectMediaPath(projectId, stagedPath, { root });
}
