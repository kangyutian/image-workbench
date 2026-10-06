import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ProductSuitePromptSetStore } from "./productSuitePromptSetStore.mjs";

const prompts = {
  "product-3d": "3d prompt",
  "model-front": "front prompt",
  "model-angle": "angle prompt",
  "model-back": "back prompt",
};

test("prompt sets persist and edits cannot transfer ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "product-suite-prompt-set-"));
  const file = join(root, "prompt-sets.json");
  try {
    const store = new ProductSuitePromptSetStore({ file });
    const created = store.create({ name: "My version", prompts }, { username: "alice", accountId: "account-a" });
    assert.equal(created.ownerUsername, "alice");
    assert.equal(created.ownerAccountId, "account-a");
    const updated = store.update(created.id, { name: "Renamed", ownerUsername: "mallory", ownerAccountId: "account-m", prompts: { ...prompts, "model-front": "edited" } });
    assert.equal(updated.ownerUsername, "alice");
    assert.equal(updated.ownerAccountId, "account-a");
    assert.equal(updated.prompts["model-front"], "edited");
    assert.equal(new ProductSuitePromptSetStore({ file }).get(created.id).name, "Renamed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prompt set names are unique per owner, case-insensitively", async () => {
  const root = await mkdtemp(join(tmpdir(), "product-suite-prompt-name-"));
  try {
    const store = new ProductSuitePromptSetStore({ file: join(root, "prompt-sets.json") });
    store.create({ name: "Studio", prompts }, { username: "alice", accountId: "account-a" });
    assert.throws(() => store.create({ name: "studio", prompts }, { username: "alice", accountId: "account-a" }), /同名/);
    assert.doesNotThrow(() => store.create({ name: "Studio", prompts }, { username: "bob", accountId: "account-b" }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
