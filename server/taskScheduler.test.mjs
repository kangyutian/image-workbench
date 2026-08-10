import assert from "node:assert/strict";
import test from "node:test";
import { recoveryAction, TaskScheduler } from "./taskScheduler.mjs";

test("recovers interrupted tasks without leaving pre-prediction work stuck", () => {
  assert.equal(recoveryAction({ status: "queued", predictionId: null }), "enqueue");
  assert.equal(recoveryAction({ status: "running", predictionId: null }), "requeue");
  assert.equal(recoveryAction({ status: "running", predictionId: "prediction-1" }), "enqueue");
  assert.equal(recoveryAction({ status: "running", predictionIds: ["prediction-1", "prediction-2"] }), "enqueue");
  assert.equal(recoveryAction({ status: "cancel_requested", predictionId: null }), "cancel");
  assert.equal(recoveryAction({ status: "done", predictionId: "prediction-1" }), "ignore");
});

test("defers task execution until after the request call stack returns", async () => {
  const started = [];
  const scheduler = new TaskScheduler({ maxConcurrent: 1, run: async (task) => { started.push(task.id); } });
  scheduler.enqueue({ id: "image-1", kind: "image" });
  assert.deepEqual(started, []);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["image-1"]);
});

test("starts image and video tasks together under two shared slots", async () => {
  const started = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const scheduler = new TaskScheduler({ maxConcurrent: 2, run: async (task) => { started.push(task.kind); await gate; } });
  scheduler.enqueue({ id: "image-1", kind: "image" });
  scheduler.enqueue({ id: "video-1", kind: "video" });
  scheduler.enqueue({ id: "image-2", kind: "image" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["image", "video"]);
  assert.equal(scheduler.snapshot().active, 2);
  release();
});
