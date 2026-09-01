import { mkdirSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const extensionByMime = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const WAVESPEED_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function validateWaveSpeedImageSize(size, maxBytes = WAVESPEED_MAX_IMAGE_BYTES) {
  if (Number(size) >= maxBytes) {
    throw Object.assign(new Error("图片超过 WaveSpeedAI 的 10MB 限制，请压缩后再试。"), { statusCode: 413 });
  }
  return Number(size);
}

function safeTaskDirectory(taskId, root) {
  const id = String(taskId || "");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid image task ID.");
  return resolve(root, id);
}

function safeStagedPath(stagedPath, root) {
  const base = resolve(root);
  const target = resolve(base, String(stagedPath || ""));
  const fromBase = relative(base, target);
  if (!fromBase || fromBase.startsWith(`..${sep}`) || fromBase === ".." || resolve(target) === base) {
    throw new Error("Invalid staged image path.");
  }
  return target;
}

function publicImageMetadata(image) {
  const result = {};
  for (const key of ["id", "fileName", "mimeType", "size"]) {
    if (image?.[key] !== undefined) result[key] = image[key];
  }
  if (typeof image?.dataUrl === "string" && /^https?:\/\//i.test(image.dataUrl)) result.dataUrl = image.dataUrl;
  if (typeof image?.url === "string" && /^https?:\/\//i.test(image.url)) result.url = image.url;
  return result;
}

export async function uploadImagesInParallel(images, upload, maxConcurrent = 2) {
  const results = new Array(images.length);
  let cursor = 0;
  const workerCount = Math.min(images.length, Math.max(1, Number(maxConcurrent) || 2));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < images.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await upload(images[index]);
    }
  }));
  return results;
}

export function validateReferenceImageCount(images, maxImages = 10) {
  if (images.length > maxImages) {
    throw Object.assign(new Error(`每个任务最多只能上传 ${maxImages} 张参考图。`), { statusCode: 400 });
  }
  return images.length;
}

export function stageImagesLocally(images, { taskId, root, maxBytes }) {
  const taskDirectory = safeTaskDirectory(taskId, root);
  const staged = [];

  try {
    for (const [index, image] of images.entries()) {
      if (typeof image?.dataUrl === "string" && /^https?:\/\//i.test(image.dataUrl)) {
        staged.push({ ...publicImageMetadata(image), dataUrl: image.dataUrl });
        continue;
      }

      const match = typeof image?.dataUrl === "string" ? image.dataUrl.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/) : null;
      if (!match) throw new Error(`图片 ${image?.fileName || ""} 不是可用的图片数据。`);
      const mimeType = match[1].toLowerCase();
      const buffer = Buffer.from(match[2], "base64");
      if (!buffer.length) throw new Error(`图片 ${image?.fileName || ""} 是空文件。`);
      if (buffer.length > maxBytes) throw Object.assign(new Error("图片太大，请压缩后再试。"), { statusCode: 413 });

      const fallbackExtension = extensionByMime[mimeType] || ".img";
      const originalExtension = extname(String(image?.fileName || "")).toLowerCase();
      const extension = Object.values(extensionByMime).includes(originalExtension) ? originalExtension : fallbackExtension;
      const stagedPath = join(String(taskId), `${index}${extension}`);
      const target = safeStagedPath(stagedPath, root);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, buffer, { mode: 0o600 });
      staged.push({
        ...publicImageMetadata(image),
        mimeType,
        size: buffer.length,
        stagedPath,
      });
    }
    return staged;
  } catch (error) {
    rmSync(taskDirectory, { recursive: true, force: true });
    throw error;
  }
}

export function fileForStagedMedia(image, { root }) {
  if (!image?.stagedPath) throw new Error("Image is not staged locally.");
  const buffer = readFileSync(safeStagedPath(image.stagedPath, root));
  return {
    buffer,
    fileName: image.fileName || `reference${extensionByMime[image.mimeType] || ".bin"}`,
    mimeType: image.mimeType || "application/octet-stream",
  };
}

export function fileForStagedImage(image, options) {
  return fileForStagedMedia(image, options);
}

export function cleanupStagedImages(taskId, { root }) {
  rmSync(safeTaskDirectory(taskId, root), { recursive: true, force: true });
}

export function cleanupStagedImageFiles(images, { root }) {
  const files = new Set(
    images
      .filter((image) => image?.stagedPath)
      .map((image) => safeStagedPath(image.stagedPath, root)),
  );
  for (const file of files) {
    rmSync(file, { force: true });
    try {
      rmdirSync(dirname(file));
    } catch {
      // The directory may still contain another staged input.
    }
  }
}

export function claimStagedUploadReferences(images, { owner, accountId, taskId, store }) {
  const claims = images.map((image) => {
    const uploadId = String(image?.stagedUploadId || "");
    const record = uploadId ? store.get(uploadId) : null;
    const storedImage = record?.image || (record?.mediaKind === "image" && record?.stagedPath ? {
      stagedPath: record.stagedPath,
      stagedUploadId: record.id,
      fileName: record.fileName,
      mimeType: record.mimeType,
      size: record.size,
    } : null);
    if (!record || !storedImage || !accountId || record.accountId !== accountId || record.owner !== owner || record.claimedBy) {
      throw Object.assign(new Error("暂存图片不可用或已经被其他任务使用，请重新上传。"), { statusCode: 400 });
    }
    return { uploadId, record, storedImage };
  });

  for (const { uploadId } of claims) store.patch(uploadId, { claimedBy: taskId, claimedAt: new Date().toISOString() });
  return claims.map(({ storedImage }) => JSON.parse(JSON.stringify(storedImage)));
}

export function purgeExpiredStagedUploads({
  store,
  root,
  now = new Date(),
  unclaimedTtlMs = 24 * 60 * 60 * 1000,
  claimedTtlMs = 7 * 24 * 60 * 60 * 1000,
}) {
  const removed = [];
  const nowMs = now.getTime();
  for (const record of store.list()) {
    const createdAtMs = Date.parse(record.createdAt || "");
    const ageMs = Number.isFinite(createdAtMs) ? nowMs - createdAtMs : 0;
    const ttlMs = record.claimedBy ? claimedTtlMs : unclaimedTtlMs;
    if (!record.consumedAt && ageMs <= ttlMs) continue;
    if (record.image?.stagedPath) cleanupStagedImageFiles([record.image], { root });
    store.remove(record.id);
    removed.push(record.id);
  }
  return removed;
}

export function publicTask(task) {
  const clone = JSON.parse(JSON.stringify(task));
  for (const key of ["owner", "accountId", "predictionId", "predictionIds", "predictionSettlements", "billingRecords", "amountUsd", "billingSync", "expectedPredictionCount"]) delete clone[key];
  if (clone.error === "fetch failed") clone.error = "WaveSpeedAI 上游网络连接暂时中断，请稍后重试。";
  if (Array.isArray(clone?.input?.images)) clone.input.images = clone.input.images.map(publicImageMetadata);
  return clone;
}

export function publicProductSuite(suite) {
  const clone = JSON.parse(JSON.stringify(suite));
  for (const key of ["owner", "accountId", "sourceImage", "backgroundImage", "modelReferenceImage", "modelReferenceAnalysis", "modelReferenceAnalysisUsage", "modelReferenceUrl", "predictionIds", "billingRecords"]) delete clone[key];
  if (clone.input && typeof clone.input === "object") {
    delete clone.input.backgroundImages;
    delete clone.input.modelReferenceAnalysis;
    delete clone.input.modelReferenceImage;
  }
  if (Array.isArray(clone.items)) clone.items = clone.items.map((item) => {
    const error = item.error === "fetch failed" ? "WaveSpeedAI 上游网络连接暂时中断，请稍后重试。" : item.error || "";
    const safe = { slot: item.slot, label: item.label, status: item.status, prompt: item.prompt || "", defaultPrompt: item.defaultPrompt || item.prompt || "", resultUrl: item.resultUrl || "", error };
    return safe;
  });
  if (clone.error === "fetch failed") clone.error = "WaveSpeedAI 上游网络连接暂时中断，请稍后重试。";
  return clone;
}

// Kept for the legacy synchronous endpoint while existing clients are upgraded.
export async function stageImagesForTask(images, upload) {
  return Promise.all(images.map(async (image) => ({ ...image, dataUrl: await upload(image) })));
}
