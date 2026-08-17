import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUsageRange, summarizeUsage } from "./usageStats.mjs";

test("summarizes active zero-usage accounts and retains deleted-account ledger rows", () => {
  const summary = summarizeUsage({
    trackingStartedAt: "2026-08-10T00:00:00.000Z",
    lastSyncedAt: "2026-08-10T01:00:00.000Z",
    pendingSyncCount: 1,
    users: [
      { accountId: "account-alice", username: "alice", role: "user" },
      { accountId: "account-zero", username: "zero", role: "user" },
    ],
    entries: [
      {
        owner: "alice",
        accountId: "account-alice",
        kind: "image",
        modelId: "grok-2-image",
        status: "done",
        resultCount: 2,
        amountUsd: 0.12,
        billingSync: { status: "complete" },
      },
      {
        owner: "alice",
        accountId: "account-alice",
        kind: "video",
        modelId: "seedance-2-fast-image-to-video",
        status: "error",
        resultCount: 0,
        amountUsd: 0.25,
        billingSync: { status: "pending" },
      },
      {
        owner: "deleted-user",
        accountId: "account-deleted",
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
  assert.equal(summary.accounts.find((account) => account.username === "alice").billingPendingCount, 1);
  assert.equal(summary.accounts.find((account) => account.username === "alice").billingFailedCount, 0);
  assert.deepEqual(summary.accounts.find((account) => account.username === "alice").models, [
    { kind: "image", modelId: "grok-2-image", taskCount: 1, successCount: 1, failureCount: 0, resultCount: 2, amountUsd: 0.12, billingPendingCount: 0, billingFailedCount: 0 },
    { kind: "video", modelId: "seedance-2-fast-image-to-video", taskCount: 1, successCount: 0, failureCount: 1, resultCount: 0, amountUsd: 0.25, billingPendingCount: 1, billingFailedCount: 0 },
  ]);
});

test("keeps deleted and recreated same-name accounts separate by account ID", () => {
  const summary = summarizeUsage({
    trackingStartedAt: "2026-08-10T00:00:00.000Z",
    users: [{ accountId: "account-new", username: "same-name", role: "user" }],
    entries: [
      { accountId: "account-old", owner: "same-name", kind: "image", modelId: "old-model", status: "done", resultCount: 1, amountUsd: 0.12, billingSync: { status: "complete" } },
      { accountId: "account-new", owner: "same-name", kind: "video", modelId: "new-model", status: "done", resultCount: 1, amountUsd: 0.23, billingSync: { status: "complete" } },
    ],
  });

  assert.equal(summary.accounts.length, 2);
  assert.equal(summary.accounts.find((account) => account.accountId === "account-old").status, "deleted");
  assert.equal(summary.accounts.find((account) => account.accountId === "account-old").amountUsd, 0.12);
  assert.equal(summary.accounts.find((account) => account.accountId === "account-new").status, "active");
  assert.equal(summary.accounts.find((account) => account.accountId === "account-new").amountUsd, 0.23);
});

test("filters usage by local date and buckets tasks and billing by day", () => {
  const summary = summarizeUsage({
    trackingStartedAt: "2026-08-01T00:00:00.000Z",
    range: { from: "2026-08-02", to: "2026-08-02", groupBy: "day" },
    users: [{ accountId: "account-alice", username: "alice", role: "user" }],
    entries: [
      {
        owner: "alice", accountId: "account-alice", kind: "image", modelId: "grok-2-image",
        createdAt: "2026-08-02T02:00:00.000Z", status: "done", resultCount: 2,
        amountUsd: 0.99, billingRecords: [{ uuid: "bill-in", predictionId: "p-in", price: 0.12, createdAt: "2026-08-02T03:00:00.000Z" }],
        predictionIds: ["p-in"], billingSync: { status: "complete" },
      },
      {
        owner: "alice", accountId: "account-alice", kind: "video", modelId: "seedance",
        createdAt: "2026-08-01T15:00:00.000Z", status: "done", resultCount: 1,
        amountUsd: 0.25, billingRecords: [{ uuid: "bill-out", predictionId: "p-out", price: 0.25, createdAt: "2026-08-03T16:00:00.000Z" }],
        predictionIds: ["p-out"], billingSync: { status: "complete" },
      },
    ],
  });

  assert.deepEqual(summary.range, { from: "2026-08-02", to: "2026-08-02", groupBy: "day" });
  assert.equal(summary.totals.taskCount, 1);
  assert.equal(summary.totals.amountUsd, 0.12);
  assert.deepEqual(summary.timeSeries, [{
    key: "2026-08-02", label: "2026-08-02", taskCount: 1, imageTaskCount: 1, videoTaskCount: 0,
    successCount: 1, failureCount: 0, resultCount: 2, amountUsd: 0.12,
  }]);
});

test("normalizes valid usage ranges and rejects invalid date filters", () => {
  assert.deepEqual(normalizeUsageRange({ from: "2026-08-01", to: "2026-08-31", groupBy: "month" }), { from: "2026-08-01", to: "2026-08-31", groupBy: "month" });
  assert.throws(() => normalizeUsageRange({ from: "2026-08-32", to: "2026-08-31" }), /开始日期不能晚于结束日期|日期必须/);
  assert.throws(() => normalizeUsageRange({ from: "2026-08-31", to: "2026-08-01" }), /开始日期不能晚于结束日期/);
});
