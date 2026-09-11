import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.WORKBENCH_E2E_BASE_URL || "https://nxtnumber.com";
const redPath = process.argv[2];
const bluePath = process.argv[3];

if (!redPath || !bluePath) throw new Error("Pass two PNG fixture paths.");

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

function sessionCookie() {
  const secret = String(process.env.WORKBENCH_SESSION_SECRET || "");
  if (!secret) throw new Error("WORKBENCH_SESSION_SECRET is not configured.");
  const users = JSON.parse(readFileSync(resolve("data", "users.json"), "utf8"));
  const user = users.users.find((item) => item.role === "admin") || users.users[0];
  if (!user) throw new Error("No workbench user exists.");
  const payload = Buffer.from(
    JSON.stringify({ username: user.username, role: user.role, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `workbench_session=${payload}.${signature}`;
}

async function request(path, cookie, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Cookie: cookie,
      ...(init.headers || {}),
    },
  });
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { message: raw.slice(0, 500) };
  }
  if (!response.ok) throw new Error(`${path} failed with ${response.status}: ${body.message || body.error || "empty response"}`);
  return body;
}

function fixture(path, fileName) {
  const buffer = readFileSync(path);
  return {
    id: fileName,
    fileName,
    dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
    mimeType: "image/png",
    size: buffer.length,
  };
}

function assertPublicPayload(body, label) {
  const serialized = JSON.stringify(body);
  if (serialized.includes("stagedPath") || serialized.includes(";base64,")) {
    throw new Error(`${label} exposed private staged image data.`);
  }
}

loadLocalEnv();
const cookie = sessionCookie();
const media = [fixture(redPath, "fusion-test-red.png"), fixture(bluePath, "fusion-test-blue.png")];
const stagedMedia = [];
for (const item of media) {
  const stageStartedAt = Date.now();
  const staged = await request("/workbench/stage-image", cookie, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media: item }),
  });
  const stageElapsedMs = Date.now() - stageStartedAt;
  if (!staged.media?.stagedUploadId) throw new Error("Image staging returned no upload token.");
  assertPublicPayload(staged, "Image staging response");
  if (stageElapsedMs > 180000) throw new Error(`Image staging took too long (${stageElapsedMs}ms).`);
  stagedMedia.push(staged.media);
  console.log(`E2E stage: locally staged ${item.fileName} in ${stageElapsedMs}ms`);
}

console.log("E2E stage: creating a fusion task from two local upload tokens");
const createStartedAt = Date.now();
const created = await request("/workbench/tasks", cookie, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    kind: "image",
    provider: "image2",
    nanoModel: "nano-banana-2-fast",
    prompt: "Create one clean square composition that combines the white circle from the red reference with the gold square from the blue reference.",
    images: stagedMedia,
    aspectRatio: "1:1",
    count: 1,
    resolution: "1k",
    quality: "low",
  }),
});
const createElapsedMs = Date.now() - createStartedAt;
if (createElapsedMs > 5000) throw new Error(`Task creation took too long (${createElapsedMs}ms).`);

const taskId = created.task?.id;
if (!taskId) throw new Error("Task creation returned no task ID.");
console.log(`E2E stage: task created in ${createElapsedMs}ms (${taskId})`);

let lastStatus = "";
for (let attempt = 0; attempt < 240; attempt += 1) {
  const listed = await request("/workbench/tasks", cookie);
  assertPublicPayload(listed, "Task list response");
  const task = listed.tasks?.find((item) => item.id === taskId);
  if (!task) throw new Error("Created task disappeared from the task list.");
  if (task.status !== lastStatus) {
    lastStatus = task.status;
    console.log(`E2E stage: task status ${task.status}`);
  }
  if (task.status === "done") {
    const outputUrl = task.results?.[0]?.url;
    if (!outputUrl) throw new Error("Task completed without an output URL.");
    console.log(`E2E PASS: generated image ${outputUrl}`);
    process.exit(0);
  }
  if (task.status === "error" || task.status === "cancelled") {
    throw new Error(`Task ended as ${task.status}: ${task.error || "no error message"}`);
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 2000));
}

throw new Error("Task did not finish within 8 minutes.");
