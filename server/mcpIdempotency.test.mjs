import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { McpIdempotencyStore } from "./mcpIdempotency.mjs";

test("persists idempotency records by account and key", () => {
  const directory = mkdtempSync(join(tmpdir(), "workbench-mcp-idempotency-"));
  const file = join(directory, "idempotency.json");
  try {
    const first = new McpIdempotencyStore({ file });
    first.put({ accountId: "service:codex-mcp" }, "request-1234", { taskId: "task-1", tool: "create_image_task" });

    const second = new McpIdempotencyStore({ file });
    assert.deepEqual(second.get({ accountId: "service:codex-mcp" }, "request-1234"), { taskId: "task-1", tool: "create_image_task" });
    assert.equal(second.get({ accountId: "other" }, "request-1234"), null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("replaces an existing account key atomically", () => {
  const directory = mkdtempSync(join(tmpdir(), "workbench-mcp-idempotency-"));
  const file = join(directory, "idempotency.json");
  try {
    const store = new McpIdempotencyStore({ file });
    const owner = { accountId: "service:codex-mcp" };
    store.put(owner, "request-1234", { taskId: "task-1" });
    store.put(owner, "request-1234", { taskId: "task-2" });
    assert.deepEqual(store.get(owner, "request-1234"), { taskId: "task-2" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
