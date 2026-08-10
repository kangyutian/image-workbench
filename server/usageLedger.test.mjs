import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { UsageLedger } from "./usageLedger.mjs";

function task(overrides = {}) {
  return {
    id: "task-1",
    owner: "alice",
    kind: "image",
    createdAt: "2026-08-10T00:01:00.000Z",
    status: "queued",
    input: { provider: "grok", nanoModel: "grok-2-image", prompt: "private prompt" },
    results: [],
    predictionIds: ["prediction-1", "prediction-2"],
    ...overrides,
  };
}

test("records only new tasks with complete prediction IDs and no prompt or media data", () => {
  const directory = mkdtempSync(join(tmpdir(), "workbench-usage-ledger-"));
  const file = join(directory, "usage-ledger.json");
  try {
    const ledger = new UsageLedger({ file, startAt: "2026-08-10T00:00:00.000Z" });
    ledger.upsertTask(task());
    ledger.upsertTask(task({
      id: "old-task",
      createdAt: "2026-08-09T23:59:59.000Z",
      input: { provider: "image2", nanoModel: "image2", prompt: "old private prompt", images: [{ dataUrl: "data:image/png;base64,secret" }] },
    }));

    const entries = ledger.list();
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].predictionIds, ["prediction-1", "prediction-2"]);
    assert.equal(entries[0].owner, "alice");
    assert.equal(entries[0].modelId, "grok-2-image");
    assert.equal("prompt" in entries[0], false);
    assert.equal(JSON.stringify(entries[0]).includes("private prompt"), false);
    assert.equal(JSON.stringify(entries[0]).includes("data:image"), false);
    assert.match(readFileSync(file, "utf8"), /trackingStartedAt/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("merges matched billing UUIDs and keeps billing state durable", () => {
  const directory = mkdtempSync(join(tmpdir(), "workbench-usage-billing-"));
  const file = join(directory, "usage-ledger.json");
  try {
    const ledger = new UsageLedger({ file, startAt: "2026-08-10T00:00:00.000Z" });
    ledger.upsertTask(task());
    ledger.applyBillingRecords("task-1", [
      { uuid: "billing-1", predictionId: "prediction-1", price: 0.12, createdAt: "2026-08-10T00:02:00.000Z" },
      { uuid: "billing-1", predictionId: "prediction-1", price: 0.12, createdAt: "2026-08-10T00:02:00.000Z" },
    ], { status: "complete", syncedAt: "2026-08-10T00:03:00.000Z" });

    const entry = ledger.get("task-1");
    assert.equal(entry.amountUsd, 0.12);
    assert.deepEqual(entry.billingRecords, [{ uuid: "billing-1", predictionId: "prediction-1", price: 0.12, createdAt: "2026-08-10T00:02:00.000Z" }]);
    assert.equal(entry.billingSync.status, "complete");
    assert.equal(new UsageLedger({ file }).get("task-1").amountUsd, 0.12);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
