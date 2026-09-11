import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { VideoRemixStore } from "./videoRemixStore.mjs";

test("persists one shot update without changing sibling shots", async () => {
  const root = await mkdtemp(join(tmpdir(), "video-remix-store-"));
  const file = join(root, "video-remixes.json");
  try {
    const store = new VideoRemixStore({ file });
    store.create({
      id: "remix-1",
      owner: "alice",
      accountId: "acct-a",
      shots: [
        { id: "shot-1", imageStatus: "idle" },
        { id: "shot-2", imageStatus: "idle" },
      ],
    });
    store.patchShot("remix-1", "shot-2", { imageStatus: "ready", imageResultUrl: "https://cdn.test/2.png" });
    const restored = new VideoRemixStore({ file }).get("remix-1");
    assert.equal(restored.shots[0].imageStatus, "idle");
    assert.equal(restored.shots[1].imageStatus, "ready");
    assert.equal(restored.shots[1].imageResultUrl, "https://cdn.test/2.png");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns projects by account id before legacy username", async () => {
  const root = await mkdtemp(join(tmpdir(), "video-remix-owner-"));
  const file = join(root, "video-remixes.json");
  try {
    const store = new VideoRemixStore({ file });
    store.create({ id: "remix-1", owner: "original", accountId: "acct-a", shots: [] });
    store.create({ id: "remix-2", owner: "alice", accountId: "acct-b", shots: [] });
    assert.deepEqual(store.forOwner({ username: "renamed", accountId: "acct-a" }).map((item) => item.id), ["remix-1"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects duplicate shot ids and invalid shot replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "video-remix-shot-validation-"));
  const file = join(root, "video-remixes.json");
  try {
    const store = new VideoRemixStore({ file });
    store.create({ id: "remix-1", owner: "alice", accountId: "acct-a", shots: [] });
    assert.throws(() => store.replaceShots("remix-1", [{ id: "shot-1" }, { id: "shot-1" }]), /重复/);
    assert.throws(() => store.replaceShots("remix-1", [{ id: "shot-1" }]), /3–8/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
