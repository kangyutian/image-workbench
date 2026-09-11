import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TaskStore } from "./taskStore.mjs";

test("persists public task media URLs and reloads queued work", () => {
  const directory = mkdtempSync(join(tmpdir(), "workbench-store-"));
  const file = join(directory, "tasks.json");
  try {
    const task = new TaskStore({ file }).create({ id: "video-1", kind: "video", status: "queued", referenceImages: [{ url: "https://cdn.example/ref.png" }] });
    assert.equal(JSON.parse(readFileSync(file, "utf8")).tasks[0].referenceImages[0].url, "https://cdn.example/ref.png");
    assert.equal(new TaskStore({ file }).get(task.id)?.status, "queued");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("removes a record durably without affecting other records", () => {
  const directory = mkdtempSync(join(tmpdir(), "workbench-store-remove-"));
  const file = join(directory, "tasks.json");
  try {
    const store = new TaskStore({ file });
    store.create({ id: "remove-me", status: "done" });
    store.create({ id: "keep-me", status: "queued" });
    assert.equal(store.remove("remove-me")?.id, "remove-me");
    assert.equal(new TaskStore({ file }).get("remove-me"), null);
    assert.equal(new TaskStore({ file }).get("keep-me")?.status, "queued");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
