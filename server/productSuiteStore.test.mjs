import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ProductSuiteStore } from "./productSuiteStore.mjs";

test("product suite store persists parent state and updates one child without losing siblings", async () => {
  const root = await mkdtemp(join(tmpdir(), "product-suite-store-"));
  const file = join(root, "product-suites.json");
  try {
    const store = new ProductSuiteStore({ file });
    const created = store.create({
      id: "suite-1",
      owner: "kangyutian",
      accountId: "account-1",
      status: "queued",
      items: [
        { slot: "product-3d", status: "queued", resultUrl: "" },
        { slot: "model-front", status: "queued", resultUrl: "" },
      ],
    });

    assert.equal(created.status, "queued");
    const updated = store.patchItem("suite-1", "model-front", { status: "done", resultUrl: "https://example.test/front.png" });
    assert.equal(updated.items[0].status, "queued");
    assert.equal(updated.items[1].status, "done");
    assert.equal(new ProductSuiteStore({ file }).get("suite-1").items[1].resultUrl, "https://example.test/front.png");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("product suite store marks only queued children as failed", async () => {
  const root = await mkdtemp(join(tmpdir(), "product-suite-store-fail-queued-"));
  const file = join(root, "product-suites.json");
  try {
    const store = new ProductSuiteStore({ file });
    store.create({
      id: "suite-fail-queued",
      owner: "kangyutian",
      accountId: "account-1",
      status: "running",
      items: [
        { slot: "queued-slot", status: "queued", error: "" },
        { slot: "done-slot", status: "done", error: "" },
        { slot: "error-slot", status: "error", error: "previous failure" },
        { slot: "running-slot", status: "running", error: "" },
      ],
    });

    const updated = store.failQueuedItems("suite-fail-queued", "upload failed");
    assert.equal(updated.items.find((item) => item.slot === "queued-slot").status, "error");
    assert.equal(updated.items.find((item) => item.slot === "queued-slot").error, "upload failed");
    assert.equal(updated.items.find((item) => item.slot === "done-slot").status, "done");
    assert.equal(updated.items.find((item) => item.slot === "error-slot").error, "previous failure");
    assert.equal(updated.items.find((item) => item.slot === "running-slot").status, "running");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("product suite store removes embedded background data from legacy records", async () => {
  const root = await mkdtemp(join(tmpdir(), "product-suite-migrate-"));
  const file = join(root, "product-suites.json");
  try {
    await writeFile(file, JSON.stringify({ version: 1, suites: [{ id: "suite-legacy", input: { backgroundImages: [{ dataUrl: "data:image/png;base64,AAAA" }] } }] }));
    const store = new ProductSuiteStore({ file });
    assert.equal("backgroundImages" in (store.get("suite-legacy").input || {}), false);
    assert.doesNotMatch(await (await import("node:fs/promises")).readFile(file, "utf8"), /data:image/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("product suite store preserves private model reference state for restart recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "product-suite-reference-"));
  const file = join(root, "product-suites.json");
  try {
    const store = new ProductSuiteStore({ file });
    store.create({
      id: "suite-reference",
      owner: "alice",
      accountId: "account-alice",
      modelReferenceImage: { stagedPath: "suite-reference/2.jpg", mimeType: "image/jpeg" },
      modelReferenceAnalysis: { ageAppearance: "30岁观感" },
      input: { hasModelReference: true },
      items: [],
    });
    const restored = new ProductSuiteStore({ file }).get("suite-reference");
    assert.equal(restored.modelReferenceImage.stagedPath, "suite-reference/2.jpg");
    assert.equal(restored.modelReferenceAnalysis.ageAppearance, "30岁观感");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
