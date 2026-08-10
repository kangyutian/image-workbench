import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { recoveryAction, TaskScheduler } from "./server/taskScheduler.mjs";
import { accountIdForUsername, ensureAccountIds, migrateTaskAccountId, resolveSessionUser } from "./server/accountIdentity.mjs";
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
} from "./server/imageUploads.mjs";
import { TaskStore } from "./server/taskStore.mjs";
import { validateVideoInput, videoModelInfo, videoPayloadFor } from "./server/videoModels.mjs";
import { envKeyForModelRequest, grokImageModelInfo, grokPayloadFor, isGrokImageRequest, normalizeGrokImageInput, validateGrokImageInput } from "./server/grokModels.mjs";
import { UsageLedger } from "./server/usageLedger.mjs";
import { UsageSynchronizer } from "./server/usageSynchronizer.mjs";
import { summarizeUsage } from "./server/usageStats.mjs";
import { usageResponse } from "./server/usageApi.mjs";
import { mergePredictionIds, mergeResultUrls, predictionIdsFromResponse, reconcileRecoveryResults, recoveryPredictionIds } from "./server/predictionResults.mjs";

const port = Number(process.env.PORT || 5173);
const root = resolve("dist");
const wavespeedBaseUrl = "https://api.wavespeed.ai/api/v3";
const maxJsonBytes = 120 * 1024 * 1024;
const maxImportedImageBytes = 30 * 1024 * 1024;
const usersFile = resolve("data", "users.json");
const tasksFile = resolve("data", "tasks.json");
const stagedUploadsFile = resolve("data", "staged-uploads.json");
const usageLedgerFile = resolve("data", "usage-ledger.json");
const stagedImagesRoot = resolve("data", "staged-images");
const maxReferenceImages = 10;
const stagedUploadCleanupIntervalMs = 60 * 60 * 1000;
const sessionMaxAgeSeconds = 7 * 24 * 60 * 60;
const predictionRequests = new Map();

loadLocalEnv();
const taskStore = new TaskStore({ file: tasksFile });
const stagedUploadStore = new TaskStore({ file: stagedUploadsFile });
const usageLedger = new UsageLedger({ file: usageLedgerFile });
const taskScheduler = new TaskScheduler({
  maxConcurrent: Number(process.env.WORKBENCH_MAX_CONCURRENT_GENERATIONS || 2),
  run: executeWorkbenchTask,
});
const usageSynchronizer = new UsageSynchronizer({
  ledger: usageLedger,
  keyForEntry: usageEnvKeyForEntry,
  apiKeyForEnvKey: billingApiKeyForEnvKey,
  baseUrl: wavespeedBaseUrl,
});

function cleanupExpiredStagedUploads() {
  try {
    purgeExpiredStagedUploads({ store: stagedUploadStore, root: stagedImagesRoot });
  } catch (error) {
    console.warn("Unable to clean expired staged uploads", error instanceof Error ? error.message : error);
  }
}

cleanupExpiredStagedUploads();
const stagedUploadCleanupTimer = setInterval(cleanupExpiredStagedUploads, stagedUploadCleanupIntervalMs);
stagedUploadCleanupTimer.unref();

function usersStore() {
  if (!existsSync(usersFile)) {
    const username = String(process.env.WORKBENCH_ADMIN_USERNAME || "").trim();
    const password = String(process.env.WORKBENCH_ADMIN_PASSWORD || "");
    if (!username || !password) return { users: [] };
    const initial = {
      users: [
        {
          username,
          accountId: randomBytes(16).toString("hex"),
          passwordHash: hashPassword(password),
          role: "admin",
          createdAt: new Date().toISOString(),
          lastLoginAt: null,
        },
      ],
    };
    writeUsersStore(initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(readFileSync(usersFile, "utf8"));
    const normalized = ensureAccountIds(Array.isArray(parsed?.users) ? parsed.users : [], () => randomBytes(16).toString("hex"));
    const store = { users: normalized.users };
    if (normalized.changed) writeUsersStore(store);
    return store;
  } catch {
    return { users: [] };
  }
}

function writeUsersStore(store) {
  mkdirSync(resolve("data"), { recursive: true });
  const temporary = `${usersFile}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, usersFile);
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

function passwordMatches(password, passwordHash) {
  const [salt, expected] = String(passwordHash || "").split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function sessionSecret() {
  return String(process.env.WORKBENCH_SESSION_SECRET || "");
}

function signSession(payload) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function sessionForUser(user) {
  if (!sessionSecret()) return null;
  const payload = Buffer.from(
    JSON.stringify({ username: user.username, accountId: user.accountId, role: user.role, exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds }),
  ).toString("base64url");
  return `${payload}.${signSession(payload)}`;
}

function currentUser(req) {
  if (!sessionSecret()) return null;
  const cookies = Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split(/=(.*)/s))
      .filter(([key]) => key),
  );
  const token = cookies.workbench_session;
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = signSession(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session?.username || !session?.role || Number(session.exp) < Date.now() / 1000) return null;
    const user = resolveSessionUser(session, usersStore().users);
    return user ? { username: user.username, accountId: user.accountId, role: user.role } : null;
  } catch {
    return null;
  }
}

function cookieForSession(token, req) {
  const secure = true;
  return `workbench_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(req) {
  const secure = true;
  return `workbench_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

function publicUser(user) {
  return { username: user.username, role: user.role, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt || null };
}

function migrateStoredAccountIds() {
  const users = usersStore().users;
  for (const task of taskStore.list()) {
    const migrated = migrateTaskAccountId(task, users);
    if (migrated !== task) taskStore.patch(task.id, { accountId: migrated.accountId });
  }
  usageLedger.migrateAccountIds((username) => accountIdForUsername(users, username));
}

migrateStoredAccountIds();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

const nanoEndpoints = {
  "nano-banana-2-fast": {
    text: "google/nano-banana-2/text-to-image-fast",
    edit: "google/nano-banana-2/edit-fast",
  },
  "nano-banana-2": {
    text: "google/nano-banana-2/text-to-image",
    edit: "google/nano-banana-2/edit",
  },
  "nano-banana-pro": {
    text: "google/nano-banana-pro/text-to-image",
    edit: "google/nano-banana-pro/edit",
  },
  "nano-banana-pro-edit-multi": {
    edit: "google/nano-banana-pro/edit-multi",
  },
};

const commonAspectRatios = ["1:1", "4:3", "3:4", "16:9", "9:16"];
const editMultiAspectRatios = ["4:3", "3:4"];
const commonResolutions = ["1k", "2k", "4k"];
const fastResolutions = ["2k", "4k"];

function isEditMultiRequest(request = {}) {
  return request.provider === "nanobanana" && request.nanoModel === "nano-banana-pro-edit-multi";
}

function allowedAspectRatiosFor(request = {}) {
  if (isGrokImageRequest(request)) return grokImageModelInfo(request.nanoModel)?.aspectRatio || [];
  return isEditMultiRequest(request) ? editMultiAspectRatios : commonAspectRatios;
}

function allowedResolutionsFor(request = {}) {
  if (isGrokImageRequest(request)) return grokImageModelInfo(request.nanoModel)?.resolution || [];
  if (isEditMultiRequest(request)) return [];
  if (request.provider === "nanobanana" && request.nanoModel === "nano-banana-2-fast") return fastResolutions;
  return commonResolutions;
}

function normalizeRequestOptions(request = {}) {
  if (isGrokImageRequest(request)) {
    Object.assign(request, normalizeGrokImageInput(request));
    return request;
  }
  const aspects = allowedAspectRatiosFor(request);
  if (!aspects.includes(request.aspectRatio)) request.aspectRatio = aspects[0];

  const resolutions = allowedResolutionsFor(request);
  if (resolutions.length > 0 && !resolutions.includes(request.resolution)) request.resolution = resolutions[0];

  if (isEditMultiRequest(request)) request.count = 2;
  return request;
}

function loadLocalEnv() {
  const envPath = resolve(".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function cleanApiKey(rawKey = "") {
  const keyMatch = rawKey.match(/[A-Za-z0-9._-]{20,}/);
  return (keyMatch?.[0] ?? rawKey)
    .replace(/^Bearer\s+/i, "")
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function envKeyForRequest(request = {}) {
  if (request.provider === "image2") return "WAVESPEED_IMAGE2_KEY";
  return envKeyForModelRequest(request);
}

function usageEnvKeyForEntry(entry = {}) {
  if (entry.kind === "image" && entry.provider === "image2") return "WAVESPEED_IMAGE2_KEY";
  return envKeyForModelRequest(entry.kind === "video"
    ? { kind: "video", modelId: entry.modelId }
    : { kind: "image", provider: entry.provider, nanoModel: entry.modelId });
}

function billingApiKeyForEnvKey(envKey) {
  return cleanApiKey(process.env[envKey] || process.env.WAVESPEED_API_KEY || "");
}

function wavespeedApiKeyFor(request = {}) {
  const envKey = envKeyForRequest(request);
  const modelKey = cleanApiKey(process.env[envKey] || "");
  const fallbackKey = cleanApiKey(process.env.WAVESPEED_API_KEY || "");
  return {
    apiKey: modelKey || fallbackKey,
    envKey,
  };
}

function sendText(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxJsonBytes) {
        reject(Object.assign(new Error("Request body is too large."), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(Object.assign(error, { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function fileNameFromImageUrl(rawUrl, mimeType) {
  try {
    const parsed = new URL(rawUrl);
    const fromPath = parsed.pathname.split("/").filter(Boolean).pop() || "";
    const cleanName = decodeURIComponent(fromPath).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
    if (cleanName) return cleanName.slice(0, 120);
  } catch {
    // Fall through to the MIME-based default.
  }

  const extensionByMime = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return `imported-clothing.${extensionByMime[mimeType] || "png"}`;
}

async function handleImportImage(req, res) {
  try {
    const { url } = await readJsonBody(req);
    if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) {
      sendJson(res, 400, { message: "请填写可公开访问的 http 或 https 图片链接。" });
      return;
    }

    const targetUrl = url.trim();
    const response = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "AI-Image-Workbench/1.0",
        accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
      },
    });

    if (!response.ok) {
      sendJson(res, 502, { message: "图片链接无法读取，请换成本地上传或检查链接是否可公开访问。" });
      return;
    }

    const mimeType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!mimeType.startsWith("image/")) {
      sendJson(res, 400, { message: "这个链接返回的不是图片，请换一个图片直链。" });
      return;
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxImportedImageBytes) {
      sendJson(res, 413, { message: "图片太大，请压缩图片或换成本地上传。" });
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxImportedImageBytes) {
      sendJson(res, 413, { message: "图片太大，请压缩图片或换成本地上传。" });
      return;
    }

    sendJson(res, 200, {
      image: {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        fileName: fileNameFromImageUrl(targetUrl, mimeType),
        dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
        mimeType,
        size: buffer.length,
      },
    });
  } catch {
    sendJson(res, 502, { message: "图片链接无法读取，请换成本地上传或检查链接是否可公开访问。" });
  }
}

function dataUrlToFile(image) {
  if (typeof image?.dataUrl !== "string") throw new Error("Invalid image data.");
  const match = image.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error(`图片 ${image.fileName || ""} 不是可上传的 dataURL。`);
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
    fileName: image.fileName || "reference.png",
  };
}

async function wavespeedFetch(path, options = {}, request = {}) {
  const { apiKey, envKey } = wavespeedApiKeyFor(request);
  if (!apiKey) {
    const error = new Error(`服务器未配置该模型的 WaveSpeedAI API Key。请设置 ${envKey}，或设置通用 WAVESPEED_API_KEY。`);
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch(`${wavespeedBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }

  if (!response.ok) {
    const message = body?.error || body?.message || `WaveSpeedAI request failed with ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return body;
}

async function uploadImage(image, request) {
  if (typeof image?.dataUrl === "string" && /^https?:\/\//i.test(image.dataUrl)) {
    return image.dataUrl;
  }

  const file = dataUrlToFile(image);
  const form = new FormData();
  form.append("file", new Blob([file.buffer], { type: file.mimeType }), file.fileName);

  const body = await wavespeedFetch(
    "/media/upload/binary",
    {
      method: "POST",
      body: form,
    },
    request,
  );

  const url = body?.data?.download_url;
  if (!url) throw new Error("WaveSpeedAI 上传成功，但没有返回 download_url。");
  return url;
}

function endpointFor(request, hasImages) {
  if (isGrokImageRequest(request)) {
    const model = grokImageModelInfo(request.nanoModel);
    if (!model) throw new Error("请选择可用的 Grok 图片模型。");
    return model.endpoint;
  }
  if (request.provider === "image2") {
    return hasImages ? "openai/gpt-image-2/edit" : "openai/gpt-image-2/text-to-image";
  }

  const model = nanoEndpoints[request.nanoModel] || nanoEndpoints["nano-banana-2-fast"];
  if (hasImages) return model.edit;
  if (!model.text) throw new Error("该 Nano 模型只支持图生图/多图编辑，请先上传参考图。");
  return model.text;
}

function payloadFor(request, uploadedImages) {
  if (isGrokImageRequest(request)) return grokPayloadFor(request, uploadedImages);
  const hasImages = uploadedImages.length > 0;
  const isEditMulti = request.provider === "nanobanana" && request.nanoModel === "nano-banana-pro-edit-multi";
  const payload = {
    prompt: request.prompt,
    aspect_ratio: request.aspectRatio,
    output_format: "png",
    enable_sync_mode: false,
    enable_base64_output: false,
  };

  if (!isEditMulti) {
    payload.resolution = request.resolution;
  } else {
    payload.num_images = 2;
  }

  if (request.provider === "image2") {
    payload.quality = request.quality;
  }

  if (hasImages) {
    payload.images = uploadedImages;
  }

  return payload;
}

function outputUrlsFrom(body) {
  const outputs = body?.data?.outputs ?? body?.data?.output ?? body?.outputs ?? [];
  if (Array.isArray(outputs)) {
    return outputs
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item?.url === "string") return item.url;
        return "";
      })
      .filter(Boolean);
  }
  if (typeof outputs === "string") return [outputs];
  return [];
}

async function sleep(ms) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function pollPrediction(id, request) {
  for (let attempt = 0; attempt < 420; attempt += 1) {
    const body = await wavespeedFetch(`/predictions/${encodeURIComponent(id)}/result`, { method: "GET" }, request);
    const status = String(body?.data?.status || "").toLowerCase();
    const error = body?.data?.error || body?.error;

    if (status === "completed" || status === "succeeded" || status === "success") {
      const urls = outputUrlsFrom(body);
      if (urls.length > 0) return urls;
      throw new Error("WaveSpeedAI 任务完成，但没有返回图片 URL。");
    }

    if (status === "failed" || status === "error" || error) {
      throw new Error(error || "WaveSpeedAI 任务生成失败。");
    }

    await sleep(2000);
  }

  throw new Error("WaveSpeedAI 任务超时，请稍后到平台任务记录中查看结果。");
}

async function submitOnePrediction(request, uploadedImages) {
  const endpoint = endpointFor(request, uploadedImages.length > 0);
  const body = await wavespeedFetch(
    `/${endpoint}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadFor(request, uploadedImages)),
    },
    request,
  );

  const predictionId = String(body?.data?.id || "");
  const immediate = outputUrlsFrom(body);
  if (immediate.length > 0) {
    if (predictionId) predictionRequests.set(predictionId, { provider: request.provider, nanoModel: request.nanoModel });
    return { id: predictionId || null, images: immediate, completed: true };
  }

  const id = body?.data?.id;
  if (!id) throw new Error("WaveSpeedAI 没有返回任务 ID。");
  predictionRequests.set(String(id), { provider: request.provider, nanoModel: request.nanoModel });
  return { id: String(id), completed: false };
}

async function handleGenerate(req, res) {
  try {
    const request = await readJsonBody(req);
    if (!request?.prompt?.trim()) {
      sendJson(res, 400, { message: "请先输入提示词。" });
      return;
    }
    normalizeRequestOptions(request);

    const images = Array.isArray(request.images) ? request.images : [];
    const uploadedImages = await uploadImagesInParallel(images, (image) => uploadImage(image, request));

    const count = Math.max(1, Math.min(8, Number(request.count) || 1));
    const batches = [];
    const submits = request.provider === "nanobanana" && request.nanoModel === "nano-banana-pro-edit-multi" || request.provider === "grok" ? 1 : count;
    for (let index = 0; index < submits; index += 1) {
      batches.push(await submitOnePrediction(request, uploadedImages));
    }

    sendJson(res, 200, {
      images: batches.flatMap((batch) => (batch.images || []).map((url) => ({ url, source: "url" }))),
      predictionIds: batches.flatMap((batch) => (batch.id ? [batch.id] : [])),
    });
  } catch (error) {
    const status = Number(error?.statusCode || 502);
    const message = error instanceof Error ? error.message : "WaveSpeedAI proxy failed.";
    sendJson(res, status, { message });
  }
}

async function handlePredictionResult(req, res) {
  try {
    const match = req.url.match(/^\/wavespeed\/predictions\/([^/]+)\/result/);
    if (!match) {
      sendJson(res, 404, { message: "Prediction endpoint not found." });
      return;
    }
    const id = decodeURIComponent(match[1]);
    const storedRequest = predictionRequests.get(id);
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const request = storedRequest || {
      provider: url.searchParams.get("provider") || undefined,
      nanoModel: url.searchParams.get("nanoModel") || undefined,
    };
    const body = await wavespeedFetch(`/predictions/${encodeURIComponent(id)}/result`, { method: "GET" }, request);
    sendJson(res, 200, body);
  } catch (error) {
    sendJson(res, Number(error?.statusCode || 502), {
      message: error instanceof Error ? error.message : "WaveSpeedAI prediction lookup failed.",
    });
  }
}

function taskId() {
  return `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
}

function recordUsageTask(task, queueBilling = false) {
  if (!task) return;
  usageLedger.upsertTask(task);
  if (queueBilling) usageSynchronizer.enqueue();
}

function patchTaskAndUsage(id, changes, queueBilling = false) {
  const task = taskStore.patch(id, changes);
  recordUsageTask(task, queueBilling);
  return task;
}

function ownerIdentity(owner) {
  const username = String(typeof owner === "string" ? owner : owner?.username || "").trim();
  const users = usersStore().users;
  const user = users.find((item) => item.username === username);
  return {
    username,
    accountId: String(typeof owner === "object" && owner?.accountId || user?.accountId || accountIdForUsername(users, username)),
  };
}

function createTaskAndUsage(input) {
  const owner = ownerIdentity(input.owner);
  const task = taskStore.create({ ...input, owner: owner.username, accountId: owner.accountId });
  recordUsageTask(task);
  return task;
}

function publicMediaUrl(media) {
  return typeof media?.dataUrl === "string" && /^https?:\/\//i.test(media.dataUrl) ? media.dataUrl : typeof media?.url === "string" ? media.url : "";
}

function mediaSizeLimit(mediaType) {
  return mediaType === "video" ? Number(process.env.WORKBENCH_MAX_VIDEO_UPLOAD_BYTES || 100 * 1024 * 1024) : maxImportedImageBytes;
}

async function uploadMedia(media, mediaType, request = {}) {
  const url = publicMediaUrl(media);
  if (url) return url;
  const file = mediaType === "image" && media?.stagedPath
    ? fileForStagedImage(media, { root: stagedImagesRoot })
    : dataUrlToFile(media);
  if (mediaType === "video" && !["video/mp4", "video/webm", "video/quicktime"].includes(file.mimeType)) throw new Error("动作参考视频仅支持 MP4、WebM 或 MOV 文件。");
  if (mediaType === "image" && !file.mimeType.startsWith("image/")) throw new Error("请上传图片文件。");
  if (file.buffer.length > mediaSizeLimit(mediaType)) throw Object.assign(new Error(mediaType === "video" ? "视频文件太大，请压缩后再试。" : "图片太大，请压缩后再试。"), { statusCode: 413 });
  const form = new FormData();
  form.append("file", new Blob([file.buffer], { type: file.mimeType }), file.fileName);
  const body = await wavespeedFetch("/media/upload/binary", { method: "POST", body: form }, request);
  const uploadUrl = body?.data?.download_url;
  if (!uploadUrl) throw new Error("WaveSpeedAI 上传成功，但没有返回 download_url。");
  return uploadUrl;
}

async function executeWorkbenchTask(queuedTask) {
  const task = taskStore.get(queuedTask.id);
  if (!task || task.status === "cancelled" || task.status === "done") return;
  try {
    patchTaskAndUsage(task.id, { status: "running", error: "" });
    const request = task.input;
    const existingPredictionIds = recoveryPredictionIds(task);
    if (existingPredictionIds.length) {
      const settled = await Promise.allSettled(existingPredictionIds.map((id) => pollPrediction(id, request)));
      const recovery = reconcileRecoveryResults(task.results, settled);
      const urls = recovery.urls;
      const expectedPredictionCount = Number(task.expectedPredictionCount) || 0;
      if (recovery.failedCount > 0 || expectedPredictionCount > existingPredictionIds.length) {
        patchTaskAndUsage(task.id, {
          status: "error",
          results: urls.map((url) => ({ url })),
          error: recovery.failedCount > 0 ? recovery.error : "Task recovery found fewer submitted predictions than expected; retry is required before completion.",
        }, true);
        return;
      }
      patchTaskAndUsage(task.id, { status: task.status === "cancel_requested" ? "cancelled" : "done", results: urls.map((url) => ({ url })), error: "" }, true);
      return;
    }
    if (task.kind === "video") {
      const model = videoModelInfo(request.modelId);
      const body = await wavespeedFetch(`/${model.endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(videoPayloadFor(request)) }, request);
      const immediate = outputUrlsFrom(body);
      const [predictionId] = predictionIdsFromResponse(body);
      if (predictionId) predictionRequests.set(predictionId, { provider: request.provider, nanoModel: request.nanoModel });
      if (immediate.length) {
        const predictionIds = mergePredictionIds(task.predictionIds, predictionId ? [predictionId] : []);
        patchTaskAndUsage(task.id, {
          status: "done",
          results: mergeResultUrls(task.results, immediate).map((url) => ({ url })),
          ...(predictionIds.length ? { predictionId: predictionIds[0], predictionIds } : {}),
          error: "",
        }, true);
        return;
      }
      if (!predictionId) throw new Error("WaveSpeedAI 没有返回任务 ID。");
      const predictionIds = mergePredictionIds(task.predictionIds, [predictionId]);
      patchTaskAndUsage(task.id, { predictionId: predictionIds[0], predictionIds });
      const urls = await pollPrediction(predictionId, request);
      patchTaskAndUsage(task.id, { status: "done", results: mergeResultUrls(task.results, urls).map((url) => ({ url })), error: "" }, true);
      return;
    }
    const imageInputs = Array.isArray(request.images) ? request.images : [];
    const images = await uploadImagesInParallel(imageInputs, (image) => uploadMedia(image, "image", request));
    if (imageInputs.some((image) => image?.stagedPath)) {
      const persistedImages = imageInputs.map((image, index) => {
        const { stagedPath, stagedUploadId, ...metadata } = image;
        return { ...metadata, dataUrl: images[index] };
      });
      request.images = persistedImages;
      patchTaskAndUsage(task.id, { input: request });
      cleanupStagedImageFiles(imageInputs, { root: stagedImagesRoot });
      for (const image of imageInputs) {
        if (image?.stagedUploadId) stagedUploadStore.remove(image.stagedUploadId);
      }
    }
    const count = Math.max(1, Math.min(8, Number(request.count) || 1));
    const batches = [];
    const submits = request.provider === "grok" || isEditMultiRequest(request) ? 1 : count;
    let predictionIds = [...(task.predictionIds || [])];
    for (let index = 0; index < submits; index += 1) {
      const batch = await submitOnePrediction(request, images);
      batches.push(batch);
      if (batch.id) {
        predictionIds = mergePredictionIds(predictionIds, [batch.id]);
        patchTaskAndUsage(task.id, { predictionId: predictionIds[0], predictionIds });
      }
    }
    const urls = batches.flatMap((batch) => batch.images || []);
    const ids = batches.flatMap((batch) => batch.id && !batch.completed ? [batch.id] : []);
    const resolved = (await Promise.all(ids.map((id) => pollPrediction(id, request)))).flat();
    patchTaskAndUsage(task.id, { status: "done", results: mergeResultUrls(task.results, [...urls, ...resolved]).map((url) => ({ url })), error: "" }, true);
  } catch (error) {
    taskStore.patch(task.id, { status: "error", error: error instanceof Error ? error.message : "任务执行失败，请稍后重试。" });
  }
  recordUsageTask(taskStore.get(task.id), true);
}

async function handleUploadMedia(req, res) {
  try {
    const body = await readJsonBody(req);
    const mediaType = body?.mediaType === "video" ? "video" : "image";
    const request = body?.request && typeof body.request === "object" ? body.request : body?.modelId ? { kind: "video", modelId: body.modelId } : {};
    sendJson(res, 200, { url: await uploadMedia(body?.media, mediaType, request) });
  } catch (error) {
    sendJson(res, Number(error?.statusCode || 400), { message: error instanceof Error ? error.message : "媒体上传失败。" });
  }
}

async function handleStageImage(req, res, owner) {
  const uploadId = taskId();
  try {
    const body = await readJsonBody(req);
    const staged = stageImagesLocally([body?.media], {
      taskId: uploadId,
      root: stagedImagesRoot,
      maxBytes: maxImportedImageBytes,
    })[0];
    const image = { ...staged, stagedUploadId: uploadId };
    stagedUploadStore.create({ id: uploadId, owner: owner.username, accountId: owner.accountId, image, claimedBy: null, consumedAt: null });
    sendJson(res, 201, {
      media: {
        id: image.id,
        fileName: image.fileName,
        mimeType: image.mimeType,
        size: image.size,
        stagedUploadId: uploadId,
      },
    });
  } catch (error) {
    cleanupStagedImages(uploadId, { root: stagedImagesRoot });
    sendJson(res, Number(error?.statusCode || 400), { message: error instanceof Error ? error.message : "图片暂存失败。" });
  }
}

async function createWorkbenchTask(input, owner) {
  const ownerInfo = ownerIdentity(owner);
  if (input?.kind === "video") {
    const normalized = { ...input, kind: "video" };
    const errors = validateVideoInput(normalized);
    if (errors.length) throw Object.assign(new Error(errors[0]), { statusCode: 400 });
    return createTaskAndUsage({ id: taskId(), owner: ownerInfo, kind: "video", expectedPredictionCount: 1, status: "queued", input: normalized, results: [], error: "", predictionId: null, predictionIds: [] });
  }
  if (!input?.prompt?.trim()) throw Object.assign(new Error("请先输入提示词。"), { statusCode: 400 });
  normalizeRequestOptions(input);
  const id = taskId();
  const images = Array.isArray(input.images) ? input.images : [];
  if (isGrokImageRequest(input)) {
    const errors = validateGrokImageInput(input, images);
    if (errors.length) throw Object.assign(new Error(errors[0]), { statusCode: 400 });
  }
  validateReferenceImageCount(images, maxReferenceImages);
  const referencedUploads = images.filter((image) => image?.stagedUploadId);
  if (referencedUploads.length > 0 && referencedUploads.length !== images.length) {
    throw Object.assign(new Error("图片上传状态不一致，请重新上传后再试。"), { statusCode: 400 });
  }
  const stagedImages = referencedUploads.length > 0
    ? claimStagedUploadReferences(images, { owner: ownerInfo.username, accountId: ownerInfo.accountId, taskId: id, store: stagedUploadStore })
    : stageImagesLocally(images, { taskId: id, root: stagedImagesRoot, maxBytes: maxImportedImageBytes });
  return createTaskAndUsage({ id, owner: ownerInfo, kind: "image", expectedPredictionCount: isGrokImageRequest(input) || isEditMultiRequest(input) ? 1 : Math.max(1, Math.min(8, Number(input.count) || 1)), status: "queued", input: { ...input, kind: "image", images: stagedImages }, results: [], error: "", predictionId: null, predictionIds: [] });
}

async function handleTasksCreate(req, res, owner, videoOnly = false) {
  try {
    const input = await readJsonBody(req);
    if (videoOnly && input?.kind !== "video") throw Object.assign(new Error("该接口只接受视频任务。"), { statusCode: 400 });
    const task = await createWorkbenchTask(input, owner);
    taskScheduler.enqueue(task);
    sendJson(res, 201, { task: publicTask(task) });
  } catch (error) {
    sendJson(res, Number(error?.statusCode || 502), { message: error instanceof Error ? error.message : "无法创建任务。" });
  }
}

function handleTasksList(res, owner) {
  sendJson(res, 200, { tasks: taskStore.list().filter((task) => task.accountId ? task.accountId === owner.accountId : task.owner === owner.username).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(publicTask) });
}

function ownsTask(task, owner) {
  return Boolean(task && (task.accountId ? task.accountId === owner.accountId : task.owner === owner.username));
}

function handleTaskRetry(req, res, owner) {
  const id = decodeURIComponent(req.url.match(/^\/workbench\/tasks\/([^/]+)\/retry/)?.[1] || "");
  const task = taskStore.get(id);
  if (task && !ownsTask(task, owner)) return sendJson(res, 404, { message: "Task not found." });
  if (!task || task.owner !== owner.username) return sendJson(res, 404, { message: "任务不存在。" });
  const retry = createTaskAndUsage({ id: taskId(), owner, kind: task.kind, expectedPredictionCount: task.expectedPredictionCount || (task.kind === "video" ? 1 : Math.max(1, Math.min(8, Number(task.input?.count) || 1))), status: "queued", input: task.input, results: [], error: "", predictionId: null, predictionIds: [], retryOf: task.id });
  taskScheduler.enqueue(retry);
  sendJson(res, 201, { task: publicTask(retry) });
}

function handleTaskCancel(req, res, owner) {
  const id = decodeURIComponent(req.url.match(/^\/workbench\/tasks\/([^/]+)\/cancel/)?.[1] || "");
  const task = taskStore.get(id);
  if (task && !ownsTask(task, owner)) return sendJson(res, 404, { message: "Task not found." });
  if (!task || task.owner !== owner.username) return sendJson(res, 404, { message: "任务不存在。" });
  const status = task.status === "queued" ? "cancelled" : "cancel_requested";
  sendJson(res, 200, { task: publicTask(patchTaskAndUsage(id, { status, cancelledAt: new Date().toISOString() }, true)) });
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    sendJson(res, 401, { message: "Please sign in to continue." });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.role !== "admin") {
    sendJson(res, 403, { message: "Administrator access is required." });
    return null;
  }
  return user;
}

async function handleLogin(req, res) {
  try {
    if (!sessionSecret()) {
      sendJson(res, 503, { message: "Authentication is not configured yet." });
      return;
    }
    const body = await readJsonBody(req);
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    const store = usersStore();
    const user = store.users.find((item) => item.username === username);
    if (!user || !passwordMatches(password, user.passwordHash)) {
      sendJson(res, 401, { message: "Invalid username or password." });
      return;
    }
    user.lastLoginAt = new Date().toISOString();
    writeUsersStore(store);
    const session = sessionForUser(user);
    sendJson(res, 200, { user: publicUser(user) }, { "set-cookie": cookieForSession(session, req) });
  } catch {
    sendJson(res, 400, { message: "Unable to sign in." });
  }
}

function handleCurrentUser(req, res) {
  const user = requireUser(req, res);
  if (user) sendJson(res, 200, { user: publicUser(user) });
}

function handleLogout(req, res) {
  sendJson(res, 200, { ok: true }, { "set-cookie": clearSessionCookie(req) });
}

function handleUsersList(req, res) {
  if (!requireAdmin(req, res)) return;
  sendJson(res, 200, { users: usersStore().users.map(publicUser) });
}

async function handleCreateUser(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const body = await readJsonBody(req);
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    const role = body?.role === "admin" ? "admin" : "user";
    if (!/^[A-Za-z0-9_.-]{3,48}$/.test(username)) {
      sendJson(res, 400, { message: "Username must be 3-48 characters using letters, numbers, dot, dash, or underscore." });
      return;
    }
    if (password.length < 10) {
      sendJson(res, 400, { message: "Password must be at least 10 characters." });
      return;
    }
    const store = usersStore();
    if (store.users.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
      sendJson(res, 409, { message: "That username already exists." });
      return;
    }
    const user = { username, accountId: randomBytes(16).toString("hex"), passwordHash: hashPassword(password), role, createdAt: new Date().toISOString(), lastLoginAt: null };
    store.users.push(user);
    writeUsersStore(store);
    sendJson(res, 201, { user: publicUser(user) });
  } catch {
    sendJson(res, 400, { message: "Unable to create user." });
  }
}

function handleDeleteUser(req, res) {
  const actor = requireAdmin(req, res);
  if (!actor) return;
  const match = req.url.match(/^\/admin\/users\/([^/?]+)/);
  const username = match ? decodeURIComponent(match[1]) : "";
  const store = usersStore();
  const target = store.users.find((item) => item.username === username);
  if (!target) {
    sendJson(res, 404, { message: "User not found." });
    return;
  }
  if (target.username === actor.username) {
    sendJson(res, 400, { message: "You cannot delete your own account." });
    return;
  }
  if (target.role === "admin" && store.users.filter((item) => item.role === "admin").length <= 1) {
    sendJson(res, 400, { message: "At least one administrator must remain." });
    return;
  }
  store.users = store.users.filter((item) => item.username !== username);
  writeUsersStore(store);
  sendJson(res, 200, { ok: true });
}

function currentUsageSummary() {
  const sync = usageSynchronizer.status();
  return {
    ...summarizeUsage({
      trackingStartedAt: usageLedger.snapshot().trackingStartedAt,
      lastSyncedAt: usageLedger.snapshot().lastSyncedAt,
      pendingSyncCount: sync.pendingSyncCount,
      users: usersStore().users,
      entries: usageLedger.list(),
    }),
    sync,
  };
}

function handleUsageGet(req, res) {
  if (!requireAdmin(req, res)) return;
  sendJson(res, 200, usageResponse(currentUsageSummary()));
}

function handleUsageSync(req, res) {
  if (!requireAdmin(req, res)) return;
  void usageSynchronizer.sync({ force: true }).catch(() => undefined);
  sendJson(res, 202, { accepted: true, sync: usageSynchronizer.status() });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const requested = decodeURIComponent(url.pathname);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, safePath);

  if (!filePath.startsWith(root)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  if (!existsSync(filePath)) {
    filePath = join(root, "index.html");
  }

  if (!existsSync(filePath)) {
    sendText(res, 500, "dist/index.html not found. Run npm run build first.");
    return;
  }

  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "content-type": mimeTypes[ext] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(res);
}

const httpServer = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    });
    res.end();
    return;
  }

  if (req.url?.startsWith("/auth/login") && req.method === "POST") {
    void handleLogin(req, res);
    return;
  }

  if (req.url?.startsWith("/auth/me") && req.method === "GET") {
    handleCurrentUser(req, res);
    return;
  }

  if (req.url?.startsWith("/auth/logout") && req.method === "POST") {
    handleLogout(req, res);
    return;
  }

  if (req.url === "/admin/usage" && req.method === "GET") {
    handleUsageGet(req, res);
    return;
  }

  if (req.url === "/admin/usage/sync" && req.method === "POST") {
    handleUsageSync(req, res);
    return;
  }

  if (req.url?.startsWith("/admin/users") && req.method === "GET") {
    handleUsersList(req, res);
    return;
  }

  if (req.url === "/admin/users" && req.method === "POST") {
    void handleCreateUser(req, res);
    return;
  }

  if (req.url?.startsWith("/admin/users/") && req.method === "DELETE") {
    handleDeleteUser(req, res);
    return;
  }

  if (req.url?.startsWith("/wavespeed/generate") && req.method === "POST") {
    if (!requireUser(req, res)) return;
    void handleGenerate(req, res);
    return;
  }

  if (req.url?.startsWith("/wavespeed/import-image") && req.method === "POST") {
    if (!requireUser(req, res)) return;
    void handleImportImage(req, res);
    return;
  }

  if (req.url === "/wavespeed/upload-media" && req.method === "POST") {
    if (!requireUser(req, res)) return;
    void handleUploadMedia(req, res);
    return;
  }

  if (req.url === "/workbench/tasks" && req.method === "GET") {
    const user = requireUser(req, res);
    if (user) handleTasksList(res, user);
    return;
  }

  if (req.url === "/workbench/stage-image" && req.method === "POST") {
    const user = requireUser(req, res);
    if (user) void handleStageImage(req, res, user);
    return;
  }

  if (req.url === "/workbench/tasks" && req.method === "POST") {
    const user = requireUser(req, res);
    if (user) void handleTasksCreate(req, res, user);
    return;
  }

  if (req.url === "/wavespeed/video/generate" && req.method === "POST") {
    const user = requireUser(req, res);
    if (user) void handleTasksCreate(req, res, user, true);
    return;
  }

  if (req.url?.match(/^\/workbench\/tasks\/[^/]+\/retry/) && req.method === "POST") {
    const user = requireUser(req, res);
    if (user) handleTaskRetry(req, res, user);
    return;
  }

  if (req.url?.match(/^\/workbench\/tasks\/[^/]+\/cancel/) && req.method === "POST") {
    const user = requireUser(req, res);
    if (user) handleTaskCancel(req, res, user);
    return;
  }

  if (req.url?.startsWith("/wavespeed/predictions/") && req.method === "GET") {
    if (!requireUser(req, res)) return;
    void handlePredictionResult(req, res);
    return;
  }

  serveStatic(req, res);
});

httpServer.on("clientError", (error, socket) => {
  console.warn("Rejected malformed client request", { code: error.code || "unknown", bytesParsed: error.bytesParsed || 0 });
  socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`AI image workbench listening on http://0.0.0.0:${port}`);
});

for (const task of taskStore.list()) {
  const action = recoveryAction(task);
  if (action === "enqueue") {
    recordUsageTask(task);
    taskScheduler.enqueue(task);
  }
  if (action === "requeue") {
    const recovered = patchTaskAndUsage(task.id, { status: "queued", error: "" });
    if (recovered) taskScheduler.enqueue(recovered);
  }
  if (action === "cancel") patchTaskAndUsage(task.id, { status: "cancelled", cancelledAt: new Date().toISOString() }, true);
}

if (usageLedger.pendingCount() > 0) usageSynchronizer.enqueue();
