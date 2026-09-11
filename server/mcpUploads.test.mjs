import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import test from "node:test";
import assert from "node:assert/strict";
import {
  MCP_MAX_IMAGE_BYTES,
  MCP_MAX_VIDEO_BYTES,
  McpUploadStore,
  createUploadTicket,
  mediaFromUpload,
  uploadTokenMatches,
  validateUploadInput,
  markUploadReady,
  writeUploadBody,
  purgeExpiredMcpUploads,
} from "./mcpUploads.mjs";

test("enforces the strict under-10MB image limit and video limit", () => {
  assert.throws(() => validateUploadInput({ mediaKind: "image", mimeType: "image/png", size: MCP_MAX_IMAGE_BYTES }), /小于10MB/);
  assert.deepEqual(validateUploadInput({ mediaKind: "image", mimeType: "image/png", size: MCP_MAX_IMAGE_BYTES - 1 }), { mediaKind: "image", mimeType: "image/png", size: MCP_MAX_IMAGE_BYTES - 1 });
  assert.equal(validateUploadInput({ mediaKind: "video", mimeType: "video/mp4", size: MCP_MAX_VIDEO_BYTES }).size, MCP_MAX_VIDEO_BYTES);
});

test("creates a one-time upload ticket without persisting the raw token", () => {
  const directory = mkdtempSync(join(tmpdir(), "workbench-mcp-upload-"));
  try {
    const store = new McpUploadStore({ file: join(directory, "uploads.json") });
    const owner = { username: "codex-mcp", accountId: "service:codex-mcp" };
    const ticket = createUploadTicket({ store, owner, fileName: "产品图.png", mimeType: "image/png", size: 5000, mediaKind: "image" });
    const record = store.get(ticket.upload_id);
    assert.equal(ticket.upload_token.length > 20, true);
    assert.equal(record.uploadToken, undefined);
    assert.equal(uploadTokenMatches(record, ticket.upload_token), true);
    assert.equal(uploadTokenMatches(record, "wrong-token"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("returns only an owner-bound ready media reference", () => {
  const record = {
    id: "upload-1",
    owner: "codex-mcp",
    accountId: "service:codex-mcp",
    mediaKind: "image",
    status: "ready",
    fileName: "input.png",
    mimeType: "image/png",
    size: 100,
    stagedPath: "upload-1/input.png",
  };
  assert.deepEqual(mediaFromUpload(record, { accountId: "service:codex-mcp" }), {
    stagedPath: "upload-1/input.png",
    stagedUploadId: "upload-1",
    fileName: "input.png",
    mimeType: "image/png",
    size: 100,
  });
  assert.throws(() => mediaFromUpload(record, { accountId: "other" }), /不可用/);
});

test("streams an exact ticket-sized body to private staging and marks it ready", async () => {
  const directory = mkdtempSync(join(tmpdir(), "workbench-mcp-upload-"));
  try {
    const store = new McpUploadStore({ file: join(directory, "uploads.json") });
    const owner = { username: "codex-mcp", accountId: "service:codex-mcp" };
    const payload = Buffer.from("image-bytes");
    const ticket = createUploadTicket({ store, owner, fileName: "input.png", mimeType: "image/png", size: payload.length, mediaKind: "image" });
    const record = store.get(ticket.upload_id);
    const request = new PassThrough();
    request.headers = { "content-length": String(payload.length) };
    const uploadPromise = writeUploadBody(request, record, { root: directory });
    request.end(payload);
    await uploadPromise;
    const ready = markUploadReady(store, record, { root: directory });
    assert.equal(ready.status, "ready");
    assert.deepEqual(readFileSync(join(directory, ready.stagedPath)), payload);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("purges expired MCP tickets and their private files", () => {
  const directory = mkdtempSync(join(tmpdir(), "workbench-mcp-upload-"));
  try {
    const store = new McpUploadStore({ file: join(directory, "uploads.json") });
    const owner = { username: "codex-mcp", accountId: "service:codex-mcp" };
    const old = new Date("2020-01-01T00:00:00.000Z");
    const ticket = createUploadTicket({ store, owner, fileName: "old.png", mimeType: "image/png", size: 5, mediaKind: "image", now: old });
    const removed = purgeExpiredMcpUploads({ store, root: directory, now: new Date("2020-01-02T00:00:00.000Z"), unclaimedTtlMs: 60 * 60 * 1000 });
    assert.deepEqual(removed, [ticket.upload_id]);
    assert.equal(store.get(ticket.upload_id), null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
