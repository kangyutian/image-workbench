import http from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import { handleMcpHttpRequest } from "./mcpHttp.mjs";
import { createMcpServer } from "./mcpServer.mjs";

function startMcpServer() {
  const config = {
    enabled: true,
    token: "secret-token",
    username: "codex-mcp",
    accountId: "service:codex-mcp",
  };
  const server = http.createServer((req, res) => handleMcpHttpRequest(req, res, {
    config,
    createServer: () => createMcpServer({
      operations: {
        listCapabilities: () => ({ image: [], video: [] }),
      },
    }),
  }));
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

test("rejects unauthenticated MCP requests before creating a protocol session", async () => {
  const { server, port } = await startMcpServer();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("serves stateless MCP initialization and tool discovery with the service token", async () => {
  const { server, port } = await startMcpServer();
  try {
    const headers = { authorization: "Bearer secret-token", "content-type": "application/json", accept: "application/json, text/event-stream" };
    const initialize = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } }),
    });
    assert.equal(initialize.status, 200);
    const initialized = await initialize.json();
    assert.equal(initialized.result.serverInfo.name, "image-workbench");

    const tools = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    assert.equal(tools.status, 200);
    const listed = await tools.json();
    assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
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
    assert.equal(listed.result.tools.find((tool) => tool.name === "create_image_task").annotations.readOnlyHint, false);
    assert.equal(listed.result.tools.find((tool) => tool.name === "list_capabilities").annotations.readOnlyHint, true);

    const capabilities = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_capabilities", arguments: {} } }),
    });
    assert.equal(capabilities.status, 200);
    const called = await capabilities.json();
    assert.deepEqual(JSON.parse(called.result.content[0].text), { image: [], video: [] });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
