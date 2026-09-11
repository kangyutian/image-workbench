import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticateMcpRequest,
  mcpConfigFromEnv,
  mcpOwnerFromConfig,
  usersWithMcpService,
} from "./mcpAuth.mjs";

test("maps the configured bearer token to the isolated codex-mcp owner", () => {
  const config = mcpConfigFromEnv({
    WORKBENCH_MCP_TOKEN: "secret-token",
    WORKBENCH_MCP_USERNAME: "codex-mcp",
    WORKBENCH_MCP_ACCOUNT_ID: "service:codex-mcp",
  });

  assert.deepEqual(authenticateMcpRequest({ authorization: "Bearer secret-token" }, config), {
    username: "codex-mcp",
    accountId: "service:codex-mcp",
    role: "service",
  });
  assert.deepEqual(mcpOwnerFromConfig(config), {
    username: "codex-mcp",
    accountId: "service:codex-mcp",
    role: "service",
  });
});

test("rejects missing, malformed, and wrong MCP bearer tokens", () => {
  const config = mcpConfigFromEnv({ WORKBENCH_MCP_TOKEN: "secret-token" });

  assert.equal(authenticateMcpRequest({}, config), null);
  assert.equal(authenticateMcpRequest({ authorization: "Basic secret-token" }, config), null);
  assert.equal(authenticateMcpRequest({ authorization: "Bearer wrong-token" }, config), null);
});

test("does not authenticate when the server token is not configured", () => {
  const config = mcpConfigFromEnv({});
  assert.equal(config.enabled, false);
  assert.equal(authenticateMcpRequest({ authorization: "Bearer anything" }, config), null);
});

test("adds the service identity to administrator usage summaries without making it a login user", () => {
  const config = mcpConfigFromEnv({ WORKBENCH_MCP_TOKEN: "secret-token" });
  assert.deepEqual(usersWithMcpService(config, [{ username: "admin", accountId: "account-admin" }]), [
    { username: "admin", accountId: "account-admin" },
    { username: "codex-mcp", accountId: "service:codex-mcp", role: "service", createdAt: null, lastLoginAt: null },
  ]);
  assert.deepEqual(usersWithMcpService(mcpConfigFromEnv({}), [{ username: "admin", accountId: "account-admin" }]), [{ username: "admin", accountId: "account-admin" }]);
});
