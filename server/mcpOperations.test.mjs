import test from "node:test";
import assert from "node:assert/strict";
import { createMcpOperations } from "./mcpOperations.mjs";

function fixture() {
  const owner = { username: "codex-mcp", accountId: "service:codex-mcp", role: "service" };
  const idempotency = new Map();
  const created = [];
  const queued = [];
  const deps = {
    owner,
    idempotency: {
      get: (_owner, key) => idempotency.get(`${owner.accountId}:${key}`) || null,
      put: (_owner, key, value) => idempotency.set(`${owner.accountId}:${key}`, value),
    },
    capabilities: () => ({ image: ["nano-banana-2"], video: ["seedance-2-image-to-video"] }),
    resolveMediaRef: async (ref) => ref.media_id ? { stagedUploadId: ref.media_id, fileName: "input.png", mimeType: "image/png" } : { dataUrl: ref.url, fileName: "remote.png", mimeType: "image/png" },
    createTask: async (input) => {
      const task = { id: `task-${created.length + 1}`, status: "queued", kind: input.kind, input };
      created.push(task);
      return task;
    },
    enqueue: (task) => queued.push(task),
    publicTask: (task) => task,
  };
  return { deps, created, queued };
}

test("maps MCP image models and references to the existing image task shape", async () => {
  const { deps, created, queued } = fixture();
  const operations = createMcpOperations(deps);
  const result = await operations.createImageTask({
    idempotency_key: "image-request-1",
    model: "nano-banana-2",
    prompt: "white product photo",
    images: [{ media_id: "upload-1" }],
    count: 2,
    aspect_ratio: "4:5",
    resolution: "2k",
  });

  assert.equal(result.task_id, "task-1");
  assert.equal(created[0].input.provider, "nanobanana");
  assert.equal(created[0].input.nanoModel, "nano-banana-2");
  assert.equal(created[0].input.images[0].stagedUploadId, "upload-1");
  assert.deepEqual(queued.map((task) => task.id), ["task-1"]);
});

test("returns the original task for a repeated idempotency key", async () => {
  const { deps, created, queued } = fixture();
  const operations = createMcpOperations(deps);
  const input = { idempotency_key: "image-request-2", model: "nano-banana-2", prompt: "same request", images: [] };
  const first = await operations.createImageTask(input);
  const second = await operations.createImageTask(input);
  assert.deepEqual(second, first);
  assert.equal(created.length, 1);
  assert.equal(queued.length, 1);
});

test("maps video frame and motion references without waiting for generation", async () => {
  const { deps, created, queued } = fixture();
  const operations = createMcpOperations(deps);
  await operations.createVideoTask({
    idempotency_key: "video-request-1",
    model: "seedance-2-image-to-video",
    prompt: "slow camera move",
    first_frame: { media_id: "first" },
    end_frame: { url: "https://example.com/end.png" },
    duration: 5,
  });

  assert.equal(created[0].input.kind, "video");
  assert.equal(created[0].input.modelId, "seedance-2-image-to-video");
  assert.equal(created[0].input.referenceImages.length, 2);
  assert.equal(created[0].input.referenceImages[0].stagedUploadId, "first");
  assert.equal(created[0].input.referenceImages[1].dataUrl, "https://example.com/end.png");
  assert.deepEqual(queued.map((task) => task.id), ["task-1"]);
});

test("maps product suite model reference and independent appearance selectors", async () => {
  const { deps, created, queued } = fixture();
  deps.createProductSuite = async (input) => {
    const suite = { id: "suite-1", status: "queued", input, items: [] };
    const task = { id: "suite-task-1", status: "queued", kind: "suite", input };
    created.push(task);
    return { suite, task };
  };
  deps.publicSuite = (suite) => suite;
  const operations = createMcpOperations(deps);

  const result = await operations.createProductSuite({
    idempotency_key: "suite-request-1",
    product_image: { media_id: "product-1" },
    model_reference_image: { media_id: "model-1" },
    model: "image2",
    gender: "female",
    body_type: "balanced",
    age_range: "25-35",
    hair_style: "long-wavy",
    hair_color: "blonde",
    skin_tone: "fair",
  });

  assert.equal(result.suite_id, "suite-1");
  assert.equal(created[0].input.model, "image2");
  assert.equal(created[0].input.modelReferenceImage.stagedUploadId, "model-1");
  assert.equal(created[0].input.hairColor, "blonde");
  assert.equal(created[0].input.ageRange, "25-35");
  assert.equal(created[0].input.hairStyle, "long-wavy");
  assert.equal(created[0].input.skinTone, "fair");
  assert.deepEqual(queued.map((task) => task.id), ["suite-task-1"]);
});

test("maps multiple product suite reference images", async () => {
  const { deps, created, queued } = fixture();
  deps.createProductSuite = async (input) => {
    const suite = { id: "suite-multi", status: "queued", input, items: [] };
    const task = { id: "suite-task-multi", status: "queued", kind: "suite", input };
    created.push(task);
    return { suite, task };
  };
  deps.publicSuite = (suite) => suite;
  const operations = createMcpOperations(deps);

  await operations.createProductSuite({
    idempotency_key: "suite-request-multi",
    product_images: [{ media_id: "product-front" }, { media_id: "product-side" }, { media_id: "product-back" }],
  });

  assert.deepEqual(created[0].input.images.map((image) => image.stagedUploadId), ["product-front", "product-side", "product-back"]);
  assert.deepEqual(queued.map((task) => task.id), ["suite-task-multi"]);
});
