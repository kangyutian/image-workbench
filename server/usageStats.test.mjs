import assert from "node:assert/strict";
import test from "node:test";
import { summarizeUsage } from "./usageStats.mjs";

test("summarizes active zero-usage accounts and retains deleted-account ledger rows", () => {
  const summary = summarizeUsage({
    trackingStartedAt: "2026-08-10T00:00:00.000Z",
    lastSyncedAt: "2026-08-10T01:00:00.000Z",
    pendingSyncCount: 1,
    users: [
      { username: "alice", role: "user" },
      { username: "zero", role: "user" },
    ],
    entries: [
      {
        owner: "alice",
        kind: "image",
        modelId: "grok-2-image",
        status: "done",
        resultCount: 2,
        amountUsd: 0.12,
        billingSync: { status: "complete" },
      },
      {
        owner: "alice",
        kind: "video",
        modelId: "seedance-2-fast-image-to-video",
        status: "error",
        resultCount: 0,
        amountUsd: 0.25,
        billingSync: { status: "pending" },
      },
      {
        owner: "deleted-user",
        kind: "image",
        modelId: "grok-2-image",
        status: "done",
        resultCount: 1,
        amountUsd: 0.07,
        billingSync: { status: "complete" },
      },
    ],
  });

  assert.deepEqual(summary.totals, {
    taskCount: 3,
    imageTaskCount: 2,
    videoTaskCount: 1,
    successCount: 2,
    failureCount: 1,
    resultCount: 3,
    amountUsd: 0.44,
  });
  assert.equal(summary.accounts.find((account) => account.username === "zero").taskCount, 0);
  assert.equal(summary.accounts.find((account) => account.username === "deleted-user").status, "deleted");
  assert.deepEqual(summary.accounts.find((account) => account.username === "alice").models, [
    { kind: "image", modelId: "grok-2-image", taskCount: 1, successCount: 1, failureCount: 0, resultCount: 2, amountUsd: 0.12 },
    { kind: "video", modelId: "seedance-2-fast-image-to-video", taskCount: 1, successCount: 0, failureCount: 1, resultCount: 0, amountUsd: 0.25 },
  ]);
});
