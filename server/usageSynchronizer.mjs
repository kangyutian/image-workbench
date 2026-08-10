import { billingRetryDelayMs, searchBillingRecords } from "./billing.mjs";

const MAX_RETRY_ATTEMPTS = 7;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function retryChanges(entry, now, error = null) {
  const attempts = (Number(entry.billingSync?.attempts) || 0) + 1;
  if (attempts >= MAX_RETRY_ATTEMPTS) {
    return {
      status: "complete",
      attempts,
      lastAttemptAt: iso(now),
      nextAttemptAt: null,
      error: error ? "WaveSpeed billing sync did not return a matching record before settlement." : null,
      syncedAt: iso(now),
    };
  }
  return {
    status: "pending",
    attempts,
    lastAttemptAt: iso(now),
    nextAttemptAt: new Date(new Date(now).getTime() + billingRetryDelayMs(attempts - 1)).toISOString(),
    error: error ? "WaveSpeed billing sync is temporarily unavailable." : null,
    syncedAt: iso(now),
  };
}

export class UsageSynchronizer {
  constructor({
    ledger,
    keyForEntry,
    apiKeyForEnvKey,
    fetchImpl = fetch,
    baseUrl,
    now = () => new Date(),
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
  }) {
    this.ledger = ledger;
    this.keyForEntry = keyForEntry;
    this.apiKeyForEnvKey = apiKeyForEnvKey;
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl;
    this.now = now;
    this.setTimeoutImpl = setTimeoutImpl;
    this.clearTimeoutImpl = clearTimeoutImpl;
    this.timer = null;
    this.currentPromise = null;
    this.lastStartedAt = null;
    this.lastFinishedAt = null;
    this.lastError = null;
  }

  schedule(delayMs = 15_000) {
    if (this.timer || this.currentPromise) return;
    this.timer = this.setTimeoutImpl(() => {
      this.timer = null;
      void this.sync();
    }, delayMs);
    if (typeof this.timer?.unref === "function") this.timer.unref();
  }

  enqueue() {
    this.schedule(15_000);
  }

  async sync({ force = false } = {}) {
    if (this.currentPromise) return this.currentPromise;
    if (this.timer) {
      this.clearTimeoutImpl(this.timer);
      this.timer = null;
    }
    this.currentPromise = this.runSync({ force }).finally(() => {
      this.currentPromise = null;
    });
    return this.currentPromise;
  }

  async runSync({ force }) {
    const startedAt = this.now();
    this.lastStartedAt = iso(startedAt);
    this.lastError = null;
    const entries = this.ledger.entriesForSync({ now: startedAt, force });
    const groups = new Map();
    for (const entry of entries) {
      const envKey = this.keyForEntry(entry);
      if (!groups.has(envKey)) groups.set(envKey, []);
      groups.get(envKey).push(entry);
    }

    for (const [envKey, group] of groups) {
      const predictionIds = [...new Set(group.flatMap((entry) => entry.predictionIds))];
      try {
        const apiKey = this.apiKeyForEnvKey(envKey);
        if (!apiKey) throw new Error("billing credential unavailable");
        const records = await searchBillingRecords({ apiKey, predictionIds, fetchImpl: this.fetchImpl, baseUrl: this.baseUrl });
        for (const entry of group) {
          const matching = records.filter((record) => entry.predictionIds.includes(record.predictionId));
          const current = this.ledger.get(entry.taskId) || entry;
          if (matching.length > 0) {
            this.ledger.applyBillingRecords(entry.taskId, matching, {
              status: "complete",
              attempts: (Number(current.billingSync?.attempts) || 0) + 1,
              lastAttemptAt: iso(startedAt),
              nextAttemptAt: null,
              error: null,
              syncedAt: iso(startedAt),
            });
          } else {
            this.ledger.updateBillingSync(entry.taskId, retryChanges(current, startedAt));
          }
        }
      } catch (error) {
        this.lastError = "One or more WaveSpeed billing groups could not be synchronized.";
        for (const entry of group) {
          const current = this.ledger.get(entry.taskId) || entry;
          this.ledger.updateBillingSync(entry.taskId, retryChanges(current, startedAt, error));
        }
      }
    }

    this.lastFinishedAt = iso(this.now());
    if (this.ledger.pendingCount() > 0) this.schedule(this.nextDelay());
    return this.status();
  }

  nextDelay() {
    const pending = this.ledger.list().filter((entry) => entry.predictionIds?.length && entry.billingSync?.status !== "complete");
    const delays = pending
      .map((entry) => entry.billingSync?.nextAttemptAt ? Date.parse(entry.billingSync.nextAttemptAt) - new Date(this.now()).getTime() : 15_000)
      .filter((delay) => Number.isFinite(delay))
      .map((delay) => Math.max(0, delay));
    return delays.length ? Math.min(...delays) : 15_000;
  }

  status() {
    return clone({
      running: Boolean(this.currentPromise),
      lastStartedAt: this.lastStartedAt,
      lastFinishedAt: this.lastFinishedAt,
      lastError: this.lastError,
      pendingSyncCount: this.ledger.pendingCount(),
    });
  }
}
