import test from "node:test";
import assert from "node:assert/strict";
import { issueDownloadToken, verifyDownloadToken } from "./mcpDownloads.mjs";

test("issues and verifies an owner-bound short-lived download token", () => {
  const token = issueDownloadToken("mcp-secret", { accountId: "service:codex-mcp", kind: "suite", id: "suite-1" }, 60_000);
  assert.deepEqual(verifyDownloadToken("mcp-secret", token), { accountId: "service:codex-mcp", kind: "suite", id: "suite-1" });
  assert.equal(verifyDownloadToken("wrong-secret", token), null);
});

test("rejects an expired or tampered download token", () => {
  const expired = issueDownloadToken("mcp-secret", { accountId: "service:codex-mcp", kind: "task", id: "task-1" }, -1);
  assert.equal(verifyDownloadToken("mcp-secret", expired), null);
  const token = issueDownloadToken("mcp-secret", { accountId: "service:codex-mcp", kind: "task", id: "task-1" }, 60_000);
  assert.equal(verifyDownloadToken("mcp-secret", `${token}tampered`), null);
});
