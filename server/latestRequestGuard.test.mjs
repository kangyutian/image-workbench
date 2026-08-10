import assert from "node:assert/strict";
import test from "node:test";

import { createLatestRequestGuard } from "../shared/latestRequestGuard.mjs";

test("cancel invalidates an in-flight request", () => {
  const guard = createLatestRequestGuard();
  const token = guard.begin();

  guard.cancel();

  assert.equal(guard.isCurrent(token), false);
});

test("begin invalidates the previous request", () => {
  const guard = createLatestRequestGuard();
  const previousToken = guard.begin();
  const currentToken = guard.begin();

  assert.equal(guard.isCurrent(previousToken), false);
  assert.equal(guard.isCurrent(currentToken), true);
});

test("separate guards do not invalidate each other", () => {
  const startGuard = createLatestRequestGuard();
  const endGuard = createLatestRequestGuard();
  const startToken = startGuard.begin();
  const endToken = endGuard.begin();

  endGuard.cancel();

  assert.equal(startGuard.isCurrent(startToken), true);
  assert.equal(endGuard.isCurrent(endToken), false);
});
