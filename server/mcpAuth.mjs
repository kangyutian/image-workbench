import { createHash, timingSafeEqual } from "node:crypto";

export const DEFAULT_MCP_USERNAME = "codex-mcp";
export const DEFAULT_MCP_ACCOUNT_ID = "service:codex-mcp";

export function mcpConfigFromEnv(env = process.env) {
  const token = String(env.WORKBENCH_MCP_TOKEN || "").trim();
  return {
    enabled: Boolean(token),
    token,
    username: String(env.WORKBENCH_MCP_USERNAME || DEFAULT_MCP_USERNAME).trim() || DEFAULT_MCP_USERNAME,
    accountId: String(env.WORKBENCH_MCP_ACCOUNT_ID || DEFAULT_MCP_ACCOUNT_ID).trim() || DEFAULT_MCP_ACCOUNT_ID,
  };
}

export function mcpOwnerFromConfig(config) {
  return { username: config.username, accountId: config.accountId, role: "service" };
}

export function usersWithMcpService(config, users = []) {
  if (!config?.enabled || users.some((user) => user.accountId === config.accountId)) return users;
  return [...users, { username: config.username, accountId: config.accountId, role: "service", createdAt: null, lastLoginAt: null }];
}

function safeTokenEquals(actual, expected) {
  if (!actual || !expected) return false;
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function bearerTokenFromHeaders(headers = {}) {
  const authorization = Array.isArray(headers.authorization) ? headers.authorization[0] : headers.authorization;
  const match = String(authorization || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export function authenticateMcpRequest(headers, config) {
  if (!config?.enabled) return null;
  return safeTokenEquals(bearerTokenFromHeaders(headers), config.token) ? mcpOwnerFromConfig(config) : null;
}
