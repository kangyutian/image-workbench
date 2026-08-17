import { legacyAccountId } from "./accountIdentity.mjs";

function roundMoney(value) {
  return Number((Number(value || 0)).toFixed(6));
}

const USAGE_TIME_ZONE = "Asia/Shanghai";

function dateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: USAGE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function localDateToUtc(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function utcToDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function bucketKey(key, groupBy) {
  if (groupBy === "month") return key.slice(0, 7);
  if (groupBy === "week") {
    const date = localDateToUtc(key);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    return utcToDateKey(date);
  }
  return key;
}

function emptyTimeBucket(key, label = key) {
  return { key, label, taskCount: 0, imageTaskCount: 0, videoTaskCount: 0, successCount: 0, failureCount: 0, resultCount: 0, amountUsd: 0 };
}

function addAmountToTimeBucket(bucket, amount) {
  bucket.amountUsd = roundMoney(bucket.amountUsd + (Number(amount) || 0));
}

function inRange(key, range) {
  return Boolean(key && (!range.from || key >= range.from) && (!range.to || key <= range.to));
}

function buildTimeBuckets(range) {
  if (!range?.from || !range?.to) return new Map();
  const buckets = new Map();
  const cursor = localDateToUtc(range.from);
  const end = localDateToUtc(range.to);
  while (cursor <= end) {
    const key = bucketKey(utcToDateKey(cursor), range.groupBy);
    if (!buckets.has(key)) buckets.set(key, emptyTimeBucket(key, key));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
}

function billingRecordsInRange(entry, range) {
  return (Array.isArray(entry.billingRecords) ? entry.billingRecords : []).filter((record) => inRange(dateKey(record.createdAt) || dateKey(entry.createdAt), range));
}

export function normalizeUsageRange(query = {}) {
  const from = String(query.from || "").trim();
  const to = String(query.to || "").trim();
  const groupBy = ["day", "week", "month"].includes(query.groupBy) ? query.groupBy : "day";
  if (!from && !to) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("日期必须使用 YYYY-MM-DD 格式。");
  if (from > to) throw new Error("开始日期不能晚于结束日期。");
  return { from, to, groupBy };
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

function addEntryToBucket(bucket, entry, { includeTask = true } = {}) {
  if (includeTask) {
    bucket.taskCount += 1;
    if (entry.kind === "image") bucket.imageTaskCount += 1;
    if (entry.kind === "video") bucket.videoTaskCount += 1;
    if (entry.status === "done") bucket.successCount += 1;
    if (entry.status === "error" || entry.status === "cancelled") bucket.failureCount += 1;
    bucket.resultCount += Math.max(0, Number(entry.resultCount) || 0);
  }
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
  if (includeTask) {
    model.taskCount += 1;
    if (entry.status === "done") model.successCount += 1;
    if (entry.status === "error" || entry.status === "cancelled") model.failureCount += 1;
    model.resultCount += Math.max(0, Number(entry.resultCount) || 0);
  }
  model.amountUsd = roundMoney(model.amountUsd + (Number(entry.amountUsd) || 0));
  if (entry.billingSync?.status === "pending") model.billingPendingCount += 1;
  if (entry.billingSync?.status === "failed") model.billingFailedCount += 1;
}

export function summarizeUsage({ trackingStartedAt, lastSyncedAt = null, pendingSyncCount = 0, users = [], entries = [], range = null }) {
  const accounts = new Map();
  for (const user of users) {
    const username = String(user?.username || "");
    if (!username) continue;
    const accountId = String(user?.accountId || legacyAccountId(username));
    accounts.set(accountId, emptyAccount(accountId, username, "active", user.role || null));
  }

  const timeBuckets = buildTimeBuckets(range);
  for (const entry of entries) {
    const username = String(entry?.owner || "");
    if (!username) continue;
    const taskKey = dateKey(entry.createdAt);
    const taskInRange = !range || inRange(taskKey, range);
    const billingRecords = range ? billingRecordsInRange(entry, range) : entry.billingRecords;
    if (range && !taskInRange && billingRecords.length === 0) continue;
    const accountId = String(entry?.accountId || legacyAccountId(username));
    if (!accounts.has(accountId)) accounts.set(accountId, emptyAccount(accountId, username, "deleted"));
    const amountUsd = range
      ? billingRecords.reduce((sum, record) => sum + (Number(record.price) || 0), 0) || (!entry.billingRecords?.length && taskInRange ? Number(entry.amountUsd) || 0 : 0)
      : Number(entry.amountUsd) || 0;
    addEntryToBucket(accounts.get(accountId), { ...entry, amountUsd }, { includeTask: taskInRange });

    if (range) {
      if (taskInRange) {
        const bucket = timeBuckets.get(bucketKey(taskKey, range.groupBy));
        if (bucket) {
          bucket.taskCount += 1;
          if (entry.kind === "image") bucket.imageTaskCount += 1;
          if (entry.kind === "video") bucket.videoTaskCount += 1;
          if (entry.status === "done") bucket.successCount += 1;
          if (entry.status === "error" || entry.status === "cancelled") bucket.failureCount += 1;
          bucket.resultCount += Math.max(0, Number(entry.resultCount) || 0);
        }
      }
      if (billingRecords.length > 0) {
        for (const record of billingRecords) {
          const billingKey = dateKey(record.createdAt) || taskKey;
          const bucket = timeBuckets.get(bucketKey(billingKey, range.groupBy));
          if (bucket) addAmountToTimeBucket(bucket, record.price);
        }
      } else if (taskInRange && Number(entry.amountUsd)) {
        const bucket = timeBuckets.get(bucketKey(taskKey, range.groupBy));
        if (bucket) addAmountToTimeBucket(bucket, entry.amountUsd);
      }
    }
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

  const result = {
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
  if (range) {
    result.range = range;
    result.timeSeries = [...timeBuckets.values()];
  }
  return result;
}
