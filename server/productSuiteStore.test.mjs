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
