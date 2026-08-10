import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { UsageLedger } from "./usageLedger.mjs";
import { UsageSynchronizer } from "./usageSynchronizer.mjs";

test("syncs fake billing records by credential group and coalesces scheduled retries", async () => {
  const directory = mkdtempSync(join(tmpdir(), "workbench-usage-sync-"));
  try {
    const ledger = new UsageLedger({ file: join(directory, "usage.json"), startAt: "2026-08-10T00:00:00.000Z" });
    ledger.upsertTask({
      id: "task-1",
      owner: "alice",
      kind: "video",
      createdAt: "2026-08-10T00:01:00.000Z",
      status: "done",
      input: { modelId: "seedance-2-fast-image-to-video" },
      results: [{ url: "https://cdn.example/video.mp4" }],
      predictionIds: ["prediction-1"],
    });
    const scheduled = [];
    const synchronizer = new UsageSynchronizer({
      ledger,
      keyForEntry: () => "FAKE_KEY_NAME",
      apiKeyForEnvKey: () => "fake-billing-key",
      fetchImpl: async (_url, options) => {
        assert.equal(options.headers.Authorization, "Bearer fake-billing-key");
        return new Response(JSON.stringify({ data: { page: 1, total: 1, items: [{ uuid: "billing-1", billing_type: "deduct", price: 0.25, created_at: "2026-08-10T00:02:00.000Z", prediction: { uuid: "prediction-1" } }] } }), { status: 200 });
      },
      now: () => new Date("2026-08-10T00:03:00.000Z"),
      setTimeoutImpl: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
      clearTimeoutImpl: () => undefined,
    });

    synchronizer.enqueue();
    synchronizer.enqueue();
    assert.deepEqual(scheduled.map((item) => item.delay), [15_000]);
    await synchronizer.sync();
    assert.equal(ledger.get("task-1").amountUsd, 0.25);
    assert.equal(ledger.get("task-1").billingSync.status, "complete");
    assert.equal(synchronizer.status().running, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("marks a missing billing response pending with a bounded next retry", async () => {
  const directory = mkdtempSync(join(tmpdir(), "workbench-usage-retry-"));
  try {
    const ledger = new UsageLedger({ file: join(directory, "usage.json"), startAt: "2026-08-10T00:00:00.000Z" });
    ledger.upsertTask({ id: "task-2", owner: "alice", kind: "image", createdAt: "2026-08-10T00:01:00.000Z", status: "error", input: { nanoModel: "grok-2-image", provider: "grok" }, results: [], predictionIds: ["prediction-2"] });
    const synchronizer = new UsageSynchronizer({
      ledger,
      keyForEntry: () => "FAKE_KEY_NAME",
      apiKeyForEnvKey: () => "fake-billing-key",
      fetchImpl: async () => new Response(JSON.stringify({ data: { page: 1, total: 0, items: [] } }), { status: 200 }),
      now: () => new Date("2026-08-10T00:03:00.000Z"),
      setTimeoutImpl: () => 1,
      clearTimeoutImpl: () => undefined,
    });

    await synchronizer.sync();
    const sync = ledger.get("task-2").billingSync;
    assert.equal(sync.status, "pending");
    assert.equal(sync.attempts, 1);
    assert.equal(sync.nextAttemptAt, "2026-08-10T00:03:15.000Z");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("uses the persisted future retry time when scheduling background work", () => {
  const directory = mkdtempSync(join(tmpdir(), "workbench-usage-delay-"));
  try {
    const now = new Date("2026-08-10T00:03:00.000Z");
    const ledger = new UsageLedger({ file: join(directory, "usage.json"), startAt: "2026-08-10T00:00:00.000Z" });
    ledger.upsertTask({ id: "task-3", owner: "alice", kind: "image", createdAt: "2026-08-10T00:01:00.000Z", status: "error", input: { nanoModel: "grok-2-image", provider: "grok" }, results: [], predictionIds: ["prediction-3"] });
    ledger.updateBillingSync("task-3", { status: "pending", attempts: 2, nextAttemptAt: "2026-08-10T00:04:00.000Z" });
    const synchronizer = new UsageSynchronizer({ ledger, keyForEntry: () => "FAKE", apiKeyForEnvKey: () => "fake", now: () => now, setTimeoutImpl: () => 1, clearTimeoutImpl: () => undefined });
    assert.equal(synchronizer.nextDelay(), 60_000);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
