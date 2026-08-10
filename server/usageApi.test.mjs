import assert from "node:assert/strict";
import test from "node:test";
import { adminUsageStatus, usageResponse } from "./usageApi.mjs";

test("allows only administrators to access usage API responses", () => {
  assert.equal(adminUsageStatus(null), 401);
  assert.equal(adminUsageStatus({ username: "alice", role: "user" }), 403);
  assert.equal(adminUsageStatus({ username: "root", role: "admin" }), 200);
  assert.deepEqual(usageResponse({ totals: { amountUsd: 0 }, accounts: [] }), { usage: { totals: { amountUsd: 0 }, accounts: [] } });
});
