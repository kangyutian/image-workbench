import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authenticateMcpRequest } from "./mcpAuth.mjs";

function sendJson(res, status, body) {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export async function handleMcpHttpRequest(req, res, { config, createServer }) {
  if (!config?.enabled) {
    sendJson(res, 503, { message: "MCP 服务尚未配置。" });
    return;
  }

  const owner = authenticateMcpRequest(req.headers, config);
  if (!owner) {
    sendJson(res, 401, { message: "MCP authorization required." });
    return;
  }

  const server = createServer(owner);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    if (!res.headersSent) sendJson(res, Number(error?.statusCode || 500), { message: "MCP 请求处理失败。" });
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}
