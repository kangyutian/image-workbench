import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { request as httpsRequest } from "node:https";

const port = Number(process.env.PORT || 5173);
const root = resolve("dist");
const gemaiTarget = "api.gemai.cc";
const providerModelCache = new Map();

loadLocalEnv();

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
  const keyMatch = rawKey.match(/sk-[A-Za-z0-9._-]+/);
  return (keyMatch?.[0] ?? rawKey)
    .replace(/^Bearer\s+/i, "")
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function providerApiKey(provider = "") {
  if (provider === "image2") return cleanApiKey(process.env.GEMAI_IMAGE2_API_KEY || "");
  if (provider === "nanobanana") return cleanApiKey(process.env.GEMAI_NANOBANANA_API_KEY || "");
  return "";
}

function readJsonFromGemai(path, apiKey) {
  return new Promise((resolve, reject) => {
    const upstream = httpsRequest(
      {
        hostname: gemaiTarget,
        path,
        method: "GET",
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
        },
      },
      (upstreamRes) => {
        let body = "";
        upstreamRes.setEncoding("utf8");
        upstreamRes.on("data", (chunk) => {
          body += chunk;
        });
        upstreamRes.on("end", () => {
          if ((upstreamRes.statusCode || 500) >= 400) {
            reject(new Error(`Gemai model lookup failed with ${upstreamRes.statusCode}: ${body.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    upstream.on("error", reject);
    upstream.end();
  });
}

async function providerModelId(provider, apiKey) {
  if (provider !== "nanobanana") return "";
  const cacheKey = `${provider}:${apiKey.slice(0, 12)}`;
  if (providerModelCache.has(cacheKey)) return providerModelCache.get(cacheKey);

  const payload = await readJsonFromGemai("/v1/models", apiKey);
  const model = payload?.data?.find((item) => {
    const id = String(item?.id || "").toLowerCase();
    const endpoints = item?.supported_endpoint_types || [];
    return id.includes("image") && endpoints.includes("gemini");
  })?.id;

  if (!model) throw new Error("No Gemini image model is available for nanobanana key.");
  providerModelCache.set(cacheKey, model);
  return model;
}

async function resolveUpstreamPath(upstreamPath, provider, apiKey) {
  if (provider !== "nanobanana" || !upstreamPath.includes(":generateContent")) return upstreamPath;
  const model = await providerModelId(provider, apiKey);
  return upstreamPath.replace(/\/models\/[^/]+:generateContent/, `/models/${encodeURIComponent(model)}:generateContent`);
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    ...headers,
  });
  res.end(body);
}

async function proxyGemai(req, res) {
  let upstreamPath = req.url.replace(/^\/gemai\/v1beta/, "/v1beta").replace(/^\/gemai\/v1/, "/v1");
  const headers = { ...req.headers, host: gemaiTarget };
  const provider = String(headers["x-image-provider"] || "");
  const serverKey = providerApiKey(provider);

  delete headers.connection;
  delete headers["content-length"];
  delete headers["x-image-provider"];

  if (serverKey) {
    headers.authorization = `Bearer ${serverKey}`;
  } else if (!headers.authorization) {
    send(res, 500, `Server API key is missing for provider: ${provider || "unknown"}`);
    return;
  }

  try {
    upstreamPath = await resolveUpstreamPath(upstreamPath, provider, serverKey || String(headers.authorization || ""));
  } catch (error) {
    send(res, 502, error instanceof Error ? error.message : "Gemai model lookup failed.");
    return;
  }

  const upstream = httpsRequest(
    {
      hostname: gemaiTarget,
      path: upstreamPath,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, {
        ...upstreamRes.headers,
        "access-control-allow-origin": "*",
      });
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (error) => {
    send(res, 502, `Gemai proxy failed: ${error.message}`);
  });

  req.pipe(upstream);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const requested = decodeURIComponent(url.pathname);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, safePath);

  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden");
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  if (!existsSync(filePath)) {
    filePath = join(root, "index.html");
  }

  if (!existsSync(filePath)) {
    send(res, 500, "dist/index.html not found. Run npm run build first.");
    return;
  }

  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "content-type": mimeTypes[ext] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(res);
}

createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type,x-image-provider",
    });
    res.end();
    return;
  }

  if (req.url?.startsWith("/gemai/v1")) {
    void proxyGemai(req, res).catch((error) => {
      send(res, 502, error instanceof Error ? error.message : "Gemai proxy failed.");
    });
    return;
  }

  serveStatic(req, res);
}).listen(port, "0.0.0.0", () => {
  console.log(`AI image workbench listening on http://0.0.0.0:${port}`);
});
