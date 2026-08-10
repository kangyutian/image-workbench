import assert from "node:assert/strict";
import test from "node:test";
import { accountIdForUsername, ensureAccountIds, legacyAccountId, migrateTaskAccountId, resolveSessionUser } from "./accountIdentity.mjs";

test("assigns account IDs to legacy users once and preserves existing IDs", () => {
  const first = ensureAccountIds([{ username: "legacy" }, { username: "stable", accountId: "stable-id" }], () => "generated-id");
  assert.equal(first.changed, true);
  assert.deepEqual(first.users.map((user) => user.accountId), ["generated-id", "stable-id"]);

  const second = ensureAccountIds(first.users, () => { throw new Error("must not regenerate"); });
  assert.equal(second.changed, false);
  assert.deepEqual(second.users, first.users);
});

test("does not merge an old deleted account with a recreated same-name account", () => {
  const oldTask = { owner: "same-name", accountId: "account-old" };
  const recreatedUsers = [{ username: "same-name", accountId: "account-new", role: "user" }];
  assert.equal(migrateTaskAccountId(oldTask, recreatedUsers).accountId, "account-old");
  assert.equal(accountIdForUsername(recreatedUsers, "same-name"), "account-new");
  assert.notEqual(legacyAccountId("same-name"), "account-new");
});

test("rejects legacy sessions without accountId instead of falling back to username", () => {
  const users = [{ username: "same-name", accountId: "account-new", role: "user" }];
  assert.equal(resolveSessionUser({ username: "same-name", role: "user" }, users), null);
  assert.deepEqual(resolveSessionUser({ username: "same-name", accountId: "account-new", role: "user" }, users), users[0]);
  assert.equal(resolveSessionUser({ username: "same-name", accountId: "account-old", role: "user" }, users), null);
});
