import test from "node:test";
import assert from "node:assert/strict";
import {
  MCP_TOOL_NAMES,
  buildMcpInstructions,
  mcpToolAnnotations,
  toolResult,
} from "./mcpServer.mjs";

test("advertises the complete non-admin workbench MCP tool surface", () => {
  assert.deepEqual(MCP_TOOL_NAMES, [
    "list_capabilities",
    "get_upload",
    "list_tasks",
    "get_task",
    "list_product_suites",
    "get_product_suite",
    "get_task_download",
    "get_product_suite_download",
    "create_upload_ticket",
    "create_image_task",
    "create_video_task",
    "create_cutout_task",
    "create_product_suite",
    "retry_task",
    "cancel_task",
    "retry_product_suite_slot",
  ]);
  assert.match(buildMcpInstructions(), /codex-mcp/);
  assert.match(buildMcpInstructions(), /5秒/);
  assert.equal(mcpToolAnnotations(false).readOnlyHint, true);
  assert.equal(mcpToolAnnotations(true).readOnlyHint, false);
});

test("returns JSON text and structured content without leaking implementation details", () => {
  const result = toolResult({ task_id: "task-1", status: "queued" });
  assert.deepEqual(result.structuredContent, { task_id: "task-1", status: "queued" });
  assert.equal(result.content[0].type, "text");
  assert.deepEqual(JSON.parse(result.content[0].text), { task_id: "task-1", status: "queued" });
});
