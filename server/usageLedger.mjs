import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function roundMoney(value) {
  return Number((Number(value || 0)).toFixed(6));
}

function predictionIdsFor(task) {
  const ids = Array.isArray(task?.predictionIds) ? task.predictionIds : task?.predictionId ? [task.predictionId] : [];
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

function defaultBillingSync(predictionIds) {
  return {
    status: predictionIds.length ? "pending" : "complete",
    attempts: 0,
    lastAttemptAt: null,
    nextAttemptAt: null,
    error: null,
  };
}

export class UsageLedger {
  constructor({ file, startAt, now = () => new Date() }) {
    this.file = file;
    this.now = now;
    this.startAt = iso(startAt || now());
    this.state = this.read();
  }

  read() {
    if (existsSync(this.file)) {
      try {
        const parsed = JSON.parse(readFileSync(this.file, "utf8"));
        if (parsed?.version === 1 && Array.isArray(parsed.entries) && parsed.trackingStartedAt) return parsed;
      } catch {
        // Recreate a valid privacy-minimal ledger below.
      }
    }
    const state = { version: 1, trackingStartedAt: this.startAt, lastSyncedAt: null, entries: [] };
    this.state = state;
    this.write();
    return state;
  }

  write() {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.file);
    chmodSync(this.file, 0o600);
  }

  upsertTask(task) {
    const taskId = String(task?.id || "");
    const owner = String(task?.owner || "");
    if (!taskId || !owner) return null;
    const createdAt = iso(task.createdAt || this.now());
    if (Date.parse(createdAt) < Date.parse(this.state.trackingStartedAt)) return null;

    const ids = predictionIdsFor(task);
    const input = task.input || {};
    const existing = this.state.entries.find((entry) => entry.taskId === taskId);
    const previousIds = existing?.predictionIds || [];
    const receivedNewPrediction = ids.some((id) => !previousIds.includes(id));
    const billingSync = existing?.billingSync ? { ...existing.billingSync } : defaultBillingSync(ids);
    if (receivedNewPrediction && billingSync.status === "complete" && ids.length > 0) {
      billingSync.status = "pending";
      billingSync.error = null;
      billingSync.nextAttemptAt = null;
    }

    const next = {
      taskId,
      owner,
      kind: task.kind === "video" ? "video" : "image",
      provider: input.provider || null,
      modelId: String(task.kind === "video" ? input.modelId || "unknown" : input.nanoModel || "unknown"),
      createdAt,
      status: String(task.status || "queued"),
      resultCount: Array.isArray(task.results) ? task.results.length : 0,
      predictionIds: ids,
      billingRecords: existing?.billingRecords || [],
      amountUsd: roundMoney(existing?.amountUsd || 0),
      billingSync,
    };

    if (existing) Object.assign(existing, next);
    else this.state.entries.push(next);
    this.write();
    return clone(next);
  }

  applyBillingRecords(taskId, records, sync = {}) {
    const entry = this.state.entries.find((item) => item.taskId === taskId);
    if (!entry) return null;
    const byUuid = new Map((entry.billingRecords || []).map((record) => [record.uuid, record]));
    for (const record of Array.isArray(records) ? records : []) {
      if (!record?.uuid || !entry.predictionIds.includes(record.predictionId)) continue;
      byUuid.set(String(record.uuid), {
        uuid: String(record.uuid),
        predictionId: String(record.predictionId),
        price: roundMoney(record.price),
        createdAt: record.createdAt || null,
      });
    }
    entry.billingRecords = [...byUuid.values()];
    entry.amountUsd = roundMoney(entry.billingRecords.reduce((sum, record) => sum + record.price, 0));
    entry.billingSync = { ...entry.billingSync, ...sync };
    if (sync.syncedAt) this.state.lastSyncedAt = sync.syncedAt;
    this.write();
    return clone(entry);
  }

  updateBillingSync(taskId, changes = {}) {
    const entry = this.state.entries.find((item) => item.taskId === taskId);
    if (!entry) return null;
    entry.billingSync = { ...entry.billingSync, ...changes };
    if (changes.syncedAt) this.state.lastSyncedAt = changes.syncedAt;
    this.write();
    return clone(entry);
  }

  entriesForSync({ now = this.now(), force = false } = {}) {
    const nowMs = new Date(now).getTime();
    return this.state.entries.filter((entry) => {
      if (!entry.predictionIds?.length) return false;
      if (force) return true;
      if (entry.billingSync.status === "complete") return false;
      const nextAttemptAt = entry.billingSync.nextAttemptAt ? Date.parse(entry.billingSync.nextAttemptAt) : 0;
      return !nextAttemptAt || nextAttemptAt <= nowMs;
    }).map(clone);
  }

  list() { return clone(this.state.entries); }
  get(taskId) { const entry = this.state.entries.find((item) => item.taskId === taskId); return entry ? clone(entry) : null; }
  snapshot() { return clone(this.state); }
  pendingCount() { return this.state.entries.filter((entry) => entry.billingSync.status !== "complete" && entry.predictionIds?.length).length; }
}
