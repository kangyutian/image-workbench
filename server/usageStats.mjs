import { legacyAccountId } from "./accountIdentity.mjs";

function roundMoney(value) {
  return Number((Number(value || 0)).toFixed(6));
}

function emptyAccount(accountId, username, status, role = null) {
  return {
    accountId,
    username,
    status,
    role,
    taskCount: 0,
    imageTaskCount: 0,
    videoTaskCount: 0,
    successCount: 0,
    failureCount: 0,
    resultCount: 0,
    amountUsd: 0,
    billingPendingCount: 0,
    billingFailedCount: 0,
    models: [],
  };
}

function addEntryToBucket(bucket, entry) {
  bucket.taskCount += 1;
  if (entry.kind === "image") bucket.imageTaskCount += 1;
  if (entry.kind === "video") bucket.videoTaskCount += 1;
  if (entry.status === "done") bucket.successCount += 1;
  if (entry.status === "error" || entry.status === "cancelled") bucket.failureCount += 1;
  bucket.resultCount += Math.max(0, Number(entry.resultCount) || 0);
  bucket.amountUsd = roundMoney(bucket.amountUsd + (Number(entry.amountUsd) || 0));
  if (entry.billingSync?.status === "pending") bucket.billingPendingCount += 1;
  if (entry.billingSync?.status === "failed") bucket.billingFailedCount += 1;

  const modelKey = `${entry.kind}:${entry.modelId || "unknown"}`;
  let model = bucket.models.find((item) => `${item.kind}:${item.modelId}` === modelKey);
  if (!model) {
    model = {
      kind: entry.kind,
      modelId: entry.modelId || "unknown",
      taskCount: 0,
      successCount: 0,
      failureCount: 0,
      resultCount: 0,
      amountUsd: 0,
      billingPendingCount: 0,
      billingFailedCount: 0,
    };
    bucket.models.push(model);
  }
  model.taskCount += 1;
  if (entry.status === "done") model.successCount += 1;
  if (entry.status === "error" || entry.status === "cancelled") model.failureCount += 1;
  model.resultCount += Math.max(0, Number(entry.resultCount) || 0);
  model.amountUsd = roundMoney(model.amountUsd + (Number(entry.amountUsd) || 0));
  if (entry.billingSync?.status === "pending") model.billingPendingCount += 1;
  if (entry.billingSync?.status === "failed") model.billingFailedCount += 1;
}

export function summarizeUsage({ trackingStartedAt, lastSyncedAt = null, pendingSyncCount = 0, users = [], entries = [] }) {
  const accounts = new Map();
  for (const user of users) {
    const username = String(user?.username || "");
    if (!username) continue;
    const accountId = String(user?.accountId || legacyAccountId(username));
    accounts.set(accountId, emptyAccount(accountId, username, "active", user.role || null));
  }

  for (const entry of entries) {
    const username = String(entry?.owner || "");
    if (!username) continue;
    const accountId = String(entry?.accountId || legacyAccountId(username));
    if (!accounts.has(accountId)) accounts.set(accountId, emptyAccount(accountId, username, "deleted"));
    addEntryToBucket(accounts.get(accountId), entry);
  }

  const accountList = [...accounts.values()];
  const totals = emptyAccount("total", "total", "total");
  for (const account of accountList) {
    totals.taskCount += account.taskCount;
    totals.imageTaskCount += account.imageTaskCount;
    totals.videoTaskCount += account.videoTaskCount;
    totals.successCount += account.successCount;
    totals.failureCount += account.failureCount;
    totals.resultCount += account.resultCount;
    totals.amountUsd = roundMoney(totals.amountUsd + account.amountUsd);
  }

  return {
    trackingStartedAt,
    lastSyncedAt,
    pendingSyncCount: Math.max(0, Number(pendingSyncCount) || 0),
    totals: {
      taskCount: totals.taskCount,
      imageTaskCount: totals.imageTaskCount,
      videoTaskCount: totals.videoTaskCount,
      successCount: totals.successCount,
      failureCount: totals.failureCount,
      resultCount: totals.resultCount,
      amountUsd: totals.amountUsd,
    },
    accounts: accountList,
  };
}
