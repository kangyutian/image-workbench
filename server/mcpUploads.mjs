import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

export const MCP_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MCP_MAX_VIDEO_BYTES = 100 * 1024 * 1024;

const extensions = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

const allowedMimeTypes = new Set(Object.keys(extensions));

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function safeFileName(fileName, mimeType) {
  const name = basename(String(fileName || "input"), extname(String(fileName || "input"))).replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 120) || "input";
  const extension = extensions[mimeType] || ".bin";
  return `${name}${extension}`;
}

function tokenHash(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

export function validateUploadInput({ mediaKind, mimeType, size }) {
  const normalizedKind = mediaKind === "video" ? "video" : mediaKind === "image" ? "image" : "";
  const normalizedMime = String(mimeType || "").toLowerCase();
  const normalizedSize = Number(size);
  if (!normalizedKind || !allowedMimeTypes.has(normalizedMime) || (normalizedKind === "image" ? !normalizedMime.startsWith("image/") : !normalizedMime.startsWith("video/"))) {
    throw Object.assign(new Error("不支持的媒体类型。"), { statusCode: 400 });
  }
  const maxBytes = normalizedKind === "image" ? MCP_MAX_IMAGE_BYTES : MCP_MAX_VIDEO_BYTES;
  if (!Number.isSafeInteger(normalizedSize) || normalizedSize <= 0) throw Object.assign(new Error("媒体文件大小无效。"), { statusCode: 400 });
  if ((normalizedKind === "image" && normalizedSize >= maxBytes) || (normalizedKind === "video" && normalizedSize > maxBytes)) {
    const message = normalizedKind === "image" ? "图片必须严格小于10MB，请压缩后再试。" : "视频文件不能超过100MB，请压缩后再试。";
    throw Object.assign(new Error(message), { statusCode: 413 });
  }
  return { mediaKind: normalizedKind, mimeType: normalizedMime, size: normalizedSize };
}

export class McpUploadStore {
  constructor({ file }) {
    this.file = file;
    this.records = this.read();
  }

  read() {
    if (!existsSync(this.file)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  persist() {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.records, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.file);
  }

  get(id) {
    return clone(this.records[String(id || "")] || null);
  }

  list() {
    return Object.values(this.records).map(clone);
  }

  put(record) {
    this.records[record.id] = clone(record);
    this.persist();
    return clone(record);
  }

  patch(id, changes) {
    const current = this.records[String(id || "")];
    if (!current) return null;
    return this.put({ ...current, ...clone(changes) });
  }

  remove(id) {
    if (!this.records[String(id || "")]) return false;
    delete this.records[String(id)];
    this.persist();
    return true;
  }
}

export function createUploadTicket({ store, owner, fileName, mimeType, size, mediaKind, now = new Date(), ttlMs = 10 * 60 * 1000 }) {
  const input = validateUploadInput({ mediaKind, mimeType, size });
  const id = `mcp-upload-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
  const uploadToken = randomBytes(32).toString("base64url");
  const record = {
    id,
    owner: owner.username,
    accountId: owner.accountId,
    mediaKind: input.mediaKind,
    mimeType: input.mimeType,
    size: input.size,
    fileName: safeFileName(fileName, input.mimeType),
    tokenHash: tokenHash(uploadToken),
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    stagedPath: "",
    claimedBy: null,
  };
  if (typeof store.put === "function") store.put(record);
  else store.create(record);
  return {
    upload_id: id,
    upload_token: uploadToken,
    upload_url: `/mcp/uploads/${encodeURIComponent(id)}`,
    expires_at: record.expiresAt,
    max_bytes: input.mediaKind === "image" ? MCP_MAX_IMAGE_BYTES - 1 : MCP_MAX_VIDEO_BYTES,
  };
}

export function uploadTokenMatches(record, token) {
  if (!record?.tokenHash || !token) return false;
  const actual = Buffer.from(tokenHash(token), "hex");
  const expected = Buffer.from(record.tokenHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function uploadPath(record, root) {
  const targetRoot = resolve(root);
  return join(targetRoot, record.id, record.fileName);
}

export async function writeUploadBody(req, record, { root }) {
  const expectedSize = Number(req.headers["content-length"] || 0);
  if (expectedSize && expectedSize !== record.size) throw Object.assign(new Error("上传文件大小与票据不一致。"), { statusCode: 400 });
  const target = uploadPath(record, root);
  mkdirSync(dirname(target), { recursive: true });
  const output = createWriteStream(target, { flags: "wx", mode: 0o600 });
  let total = 0;
  try {
    await new Promise((resolvePromise, rejectPromise) => {
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        output.destroy();
        rejectPromise(error);
      };
      req.on("data", (chunk) => {
        total += chunk.length;
        if (total > record.size) {
          req.destroy();
          fail(Object.assign(new Error("上传文件超过票据大小。"), { statusCode: 413 }));
          return;
        }
        output.write(chunk);
      });
      req.on("end", () => {
        if (total !== record.size) {
          fail(Object.assign(new Error("上传文件大小不完整。"), { statusCode: 400 }));
          return;
        }
        output.end(() => {
          settled = true;
          resolvePromise();
        });
      });
      req.on("error", fail);
      output.on("error", fail);
    });
  } catch (error) {
    rmSync(target, { force: true });
    throw error;
  }
  return target;
}

export function markUploadReady(store, record, { root }) {
  const target = uploadPath(record, root);
  const stagedPath = join(record.id, record.fileName);
  const media = { stagedPath, stagedUploadId: record.id, fileName: record.fileName, mimeType: record.mimeType, size: record.size };
  const updated = store.patch(record.id, {
    status: "ready",
    stagedPath,
    uploadedAt: new Date().toISOString(),
    ...(record.mediaKind === "image" ? { image: media } : { video: media }),
  });
  return updated || { ...record, status: "ready", stagedPath: join(record.id, record.fileName) };
}

export function claimUpload(store, record, owner, taskId) {
  const media = mediaFromUpload(record, owner);
  const updated = store.patch(record.id, { claimedBy: taskId, claimedAt: new Date().toISOString() });
  return { record: updated || record, media };
}

export function mediaFromUpload(record, owner) {
  if (!record || record.status !== "ready" || (record.accountId && record.accountId !== owner?.accountId) || (record.owner && owner?.username && record.owner !== owner.username)) {
    throw Object.assign(new Error("媒体上传不可用或不属于当前账号。"), { statusCode: 404 });
  }
  if (record.claimedBy) throw Object.assign(new Error("媒体上传已经被其他任务使用。"), { statusCode: 400 });
  return {
    stagedPath: record.stagedPath,
    stagedUploadId: record.id,
    fileName: record.fileName,
    mimeType: record.mimeType,
    size: record.size,
  };
}

export function publicUpload(record, owner) {
  if (!record || (record.accountId && record.accountId !== owner?.accountId)) return null;
  return {
    upload_id: record.id,
    status: record.status,
    media_kind: record.mediaKind,
    file_name: record.fileName,
    mime_type: record.mimeType,
    size: record.size,
    created_at: record.createdAt,
    expires_at: record.expiresAt,
    uploaded_at: record.uploadedAt || null,
  };
}

export function purgeExpiredMcpUploads({ store, root, now = new Date(), unclaimedTtlMs = 24 * 60 * 60 * 1000, claimedTtlMs = 7 * 24 * 60 * 60 * 1000 }) {
  const removed = [];
  const nowMs = now.getTime();
  const base = resolve(root);
  for (const record of store.list()) {
    const createdAtMs = Date.parse(record.createdAt || "");
    const ageMs = Number.isFinite(createdAtMs) ? nowMs - createdAtMs : 0;
    const expiredByTicket = record.status === "pending" && Date.parse(record.expiresAt || "") <= nowMs;
    const expiredByAge = ageMs > (record.claimedBy ? claimedTtlMs : unclaimedTtlMs);
    if (!expiredByTicket && !expiredByAge) continue;
    const directory = resolve(base, record.id);
    if (directory.startsWith(`${base}${process.platform === "win32" ? "\\" : "/"}`)) rmSync(directory, { recursive: true, force: true });
    store.remove(record.id);
    removed.push(record.id);
  }
  return removed;
}
