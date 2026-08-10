import { billingRetryDelayMs, searchBillingRecords } from "./billing.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
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
    if (this.timer !== null || this.currentPromise) return;
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
    if (this.timer !== null) {
      this.clearTimeoutImpl(this.timer);
      this.timer = null;
    }
    const runPromise = this.runSync({ force });
    this.currentPromise = runPromise.finally(() => {
      this.currentPromise = null;
      if (this.ledger.pendingCount() > 0) this.schedule(this.nextDelay());
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
          const current = this.ledger.get(entry.taskId) || entry;
          this.ledger.reconcileBilling(entry.taskId, records.filter((record) => entry.predictionIds.includes(record.predictionId)), {
            successful: true,
            attempts: (Number(current.billingSync?.attempts) || 0) + 1,
            attemptedAt: startedAt,
          });
        }
      } catch {
        this.lastError = "One or more WaveSpeed billing groups could not be synchronized.";
        for (const entry of group) {
          const current = this.ledger.get(entry.taskId) || entry;
          this.ledger.reconcileBilling(entry.taskId, [], {
            successful: false,
            attempts: (Number(current.billingSync?.attempts) || 0) + 1,
            attemptedAt: startedAt,
          });
        }
      }
    }

    this.lastFinishedAt = iso(this.now());
    return this.status();
  }

  nextDelay() {
    const pending = this.ledger.list().filter((entry) => entry.predictionIds?.length && entry.billingSync?.status !== "complete");
    const delays = pending
      .map((entry) => entry.billingSync?.nextAttemptAt ? Date.parse(entry.billingSync.nextAttemptAt) - new Date(this.now()).getTime() : billingRetryDelayMs(0))
      .filter((delay) => Number.isFinite(delay))
      .map((delay) => Math.max(0, delay));
    return delays.length ? Math.min(...delays) : billingRetryDelayMs(0);
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
