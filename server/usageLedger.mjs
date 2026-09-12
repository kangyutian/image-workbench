import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { legacyAccountId } from "./accountIdentity.mjs";
import { billingRetryDelayMs } from "./billing.mjs";

export const MAX_AUTOMATIC_BILLING_ATTEMPTS = 6;
const TERMINAL_PREDICTION_STATUSES = new Set(["charged", "no_charge"]);

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

function validPredictionStatus(status) {
  return ["pending", "charged", "no_charge", "unresolved", "failed"].includes(status) ? status : "pending";
}

function normalizeSettlement(value, fallbackStatus = "pending") {
  const status = validPredictionStatus(value?.status || fallbackStatus);
  return {
    status,
    attempts: Math.max(0, Number(value?.attempts) || 0),
    lastAttemptAt: value?.lastAttemptAt || null,
    nextAttemptAt: value?.nextAttemptAt || null,
    error: value?.error || null,
  };
}

function isSettled(settlement) {
  return TERMINAL_PREDICTION_STATUSES.has(settlement?.status);
}

function aggregateStatus(predictionIds, settlements) {
  if (!predictionIds.length) return "complete";
  const values = predictionIds.map((id) => settlements[id]).filter(Boolean);
  if (values.some((settlement) => settlement.status === "failed")) return "failed";
  if (values.some((settlement) => settlement.status === "unresolved")) return "unresolved";
  return values.length === predictionIds.length && values.every(isSettled) ? "complete" : "pending";
}

function safeBillingRecord(record) {
  const uuid = String(record?.uuid || "").trim();
  const predictionId = String(record?.predictionId || "").trim();
  if (!uuid || !predictionId || !Number.isFinite(Number(record?.price))) return null;
  return {
    uuid,
    predictionId,
    price: roundMoney(record.price),
    createdAt: record.createdAt || null,
  };
}

function normalizeState(parsed, startAt) {
  const state = {
    version: 2,
    trackingStartedAt: parsed?.trackingStartedAt || startAt,
    lastSyncedAt: parsed?.lastSyncedAt || null,
    billingRecordUuids: {},
    entries: [],
  };
  let changed = parsed?.version !== 2 || !parsed?.billingRecordUuids;

  for (const raw of Array.isArray(parsed?.entries) ? parsed.entries : []) {
    const taskId = String(raw?.taskId || "").trim();
    const owner = String(raw?.owner || "").trim();
    if (!taskId || !owner) {
      changed = true;
      continue;
    }
    const predictionIds = predictionIdsFor(raw);
    const billingRecords = [];
    for (const candidate of Array.isArray(raw.billingRecords) ? raw.billingRecords : []) {
      const record = safeBillingRecord(candidate);
      if (!record || !predictionIds.includes(record.predictionId)) {
        changed = true;
        continue;
      }
      if (state.billingRecordUuids[record.uuid]) {
        changed = true;
        continue;
      }
      state.billingRecordUuids[record.uuid] = taskId;
      billingRecords.push(record);
    }

    const oldSync = raw.billingSync && typeof raw.billingSync === "object" ? raw.billingSync : {};
    const billingSync = { ...defaultBillingSync(predictionIds), ...oldSync };
    const predictionSettlements = {};
    for (const predictionId of predictionIds) {
      const matching = billingRecords.find((record) => record.predictionId === predictionId);
      const fallbackStatus = matching
        ? "charged"
        : billingSync.status === "failed" || billingSync.error
          ? "failed"
          : "pending";
      predictionSettlements[predictionId] = normalizeSettlement(raw.predictionSettlements?.[predictionId], fallbackStatus);
      if (matching) predictionSettlements[predictionId].status = "charged";
    }
    const status = aggregateStatus(predictionIds, predictionSettlements);
    if (billingSync.status !== status) changed = true;
    if (status === "pending" && billingSync.status === "complete") {
      billingSync.attempts = 0;
      billingSync.lastAttemptAt = null;
      billingSync.nextAttemptAt = null;
      billingSync.error = null;
      changed = true;
    }
    state.entries.push({
      taskId,
      accountId: raw.accountId ? String(raw.accountId) : null,
      owner,
      kind: raw.kind === "video" ? "video" : "image",
      provider: raw.provider || null,
      modelId: String(raw.modelId || "unknown"),
      credentialScope: raw.credentialScope || null,
      createdAt: iso(raw.createdAt),
      status: String(raw.status || "queued"),
      resultCount: Math.max(0, Number(raw.resultCount) || 0),
      predictionIds,
      predictionSettlements,
      billingRecords,
      amountUsd: roundMoney(billingRecords.reduce((sum, record) => sum + record.price, 0)),
      billingSync: { ...billingSync, status },
    });
  }

  return { state, changed };
}

function settlementsForIds(ids, existing = {}, billingSync = {}, billingRecords = []) {
  const settlements = {};
  for (const predictionId of ids) {
    const matching = billingRecords.find((record) => record.predictionId === predictionId);
    const fallbackStatus = matching
      ? "charged"
      : billingSync.status === "failed" || billingSync.error
        ? "failed"
      : "pending";
    settlements[predictionId] = normalizeSettlement(existing[predictionId], fallbackStatus);
    if (matching) settlements[predictionId].status = "charged";
  }
  return settlements;
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
        if (Array.isArray(parsed?.entries) && parsed.trackingStartedAt) {
          const normalized = normalizeState(parsed, this.startAt);
          this.state = normalized.state;
          if (normalized.changed) this.write();
          return this.state;
        }
      } catch {
        // Recreate a valid privacy-minimal ledger below.
      }
    }
    const state = { version: 2, trackingStartedAt: this.startAt, lastSyncedAt: null, billingRecordUuids: {}, entries: [] };
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

    const existing = this.state.entries.find((entry) => entry.taskId === taskId);
    const ids = [...new Set([...(existing?.predictionIds || []), ...predictionIdsFor(task)])];
    const billingRecords = Array.isArray(existing?.billingRecords) ? existing.billingRecords.map(safeBillingRecord).filter(Boolean) : [];
    const billingSync = existing?.billingSync ? { ...existing.billingSync } : defaultBillingSync(ids);
    const predictionSettlements = settlementsForIds(ids, existing?.predictionSettlements, billingSync, billingRecords);
    const addedPrediction = ids.some((id) => !(existing?.predictionIds || []).includes(id));
    if (addedPrediction && billingSync.status === "complete") {
      billingSync.status = "pending";
      billingSync.error = null;
      billingSync.nextAttemptAt = null;
    }
    billingSync.status = aggregateStatus(ids, predictionSettlements);

    const next = {
      taskId,
      accountId: task.accountId ? String(task.accountId) : existing?.accountId || null,
      owner,
      kind: task.kind === "video" ? "video" : "image",
      provider: task.input?.provider || existing?.provider || null,
      modelId: String(task.kind === "video" ? task.input?.modelId || existing?.modelId || "unknown" : task.input?.nanoModel || existing?.modelId || "unknown"),
      credentialScope: task.input?.credentialScope || existing?.credentialScope || null,
      createdAt,
      status: String(task.status || "queued"),
      resultCount: Array.isArray(task.results) ? task.results.length : Number(existing?.resultCount) || 0,
      predictionIds: ids,
      predictionSettlements,
      billingRecords,
      amountUsd: roundMoney(billingRecords.reduce((sum, record) => sum + record.price, 0)),
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
    const attempts = Math.max(1, Number(sync.attempts) || (Number(entry.billingSync?.attempts) || 0) + 1);
    return this.reconcileBilling(taskId, records, {
      successful: true,
      attempts,
      attemptedAt: sync.lastAttemptAt || sync.syncedAt || this.now(),
      error: null,
    });
  }

  addBillingRecords(entry, records) {
    const byUuid = new Map((entry.billingRecords || []).map((record) => [record.uuid, record]));
    const acceptedPredictionIds = new Set();
    for (const candidate of Array.isArray(records) ? records : []) {
      const record = safeBillingRecord(candidate);
      if (!record || !entry.predictionIds.includes(record.predictionId)) continue;
      const owner = this.state.billingRecordUuids[record.uuid];
      if (owner && owner !== entry.taskId) continue;
      const existing = byUuid.get(record.uuid);
      if (existing && existing.predictionId !== record.predictionId) continue;
      this.state.billingRecordUuids[record.uuid] = entry.taskId;
      byUuid.set(record.uuid, record);
      acceptedPredictionIds.add(record.predictionId);
    }
    entry.billingRecords = [...byUuid.values()];
    entry.amountUsd = roundMoney(entry.billingRecords.reduce((sum, record) => sum + record.price, 0));
    return acceptedPredictionIds;
  }

  reconcileBilling(taskId, records, { successful = true, attempts, attemptedAt = this.now(), error = null } = {}) {
    const entry = this.state.entries.find((item) => item.taskId === taskId);
    if (!entry) return null;
    const attemptedAtIso = iso(attemptedAt);
    const attemptNumber = Math.max(1, Number(attempts) || (Number(entry.billingSync?.attempts) || 0) + 1);
    const acceptedPredictionIds = successful ? this.addBillingRecords(entry, records) : new Set();
    entry.predictionSettlements = settlementsForIds(entry.predictionIds, entry.predictionSettlements, entry.billingSync, entry.billingRecords);

    for (const predictionId of entry.predictionIds) {
      const settlement = entry.predictionSettlements[predictionId];
      if (isSettled(settlement)) continue;
      const settlementAttempts = Math.max(attemptNumber, (Number(settlement.attempts) || 0) + 1);
      const charged = acceptedPredictionIds.has(predictionId);
      const terminal = successful && charged;
      settlement.status = terminal ? "charged" : successful && settlementAttempts >= MAX_AUTOMATIC_BILLING_ATTEMPTS ? "unresolved" : successful ? "pending" : "failed";
      settlement.attempts = settlementAttempts;
      settlement.lastAttemptAt = attemptedAtIso;
      settlement.nextAttemptAt = TERMINAL_PREDICTION_STATUSES.has(settlement.status) || settlementAttempts >= MAX_AUTOMATIC_BILLING_ATTEMPTS
        ? null
        : new Date(Date.parse(attemptedAtIso) + billingRetryDelayMs(settlementAttempts)).toISOString();
      settlement.error = successful ? null : "WaveSpeed billing sync is temporarily unavailable.";
    }

    const status = aggregateStatus(entry.predictionIds, entry.predictionSettlements);
    const nextAttemptAt = status === "complete"
      ? null
      : entry.predictionIds
        .map((id) => entry.predictionSettlements[id]?.nextAttemptAt)
        .filter(Boolean)
        .sort()[0] || null;
    entry.billingSync = {
      ...entry.billingSync,
      status,
      attempts: attemptNumber,
      lastAttemptAt: attemptedAtIso,
      nextAttemptAt,
      error: status === "failed"
        ? "WaveSpeed billing sync is temporarily unavailable."
        : status === "unresolved"
          ? "WaveSpeed billing record was not found during the automatic retry window."
          : null,
      syncedAt: attemptedAtIso,
    };
    this.state.lastSyncedAt = attemptedAtIso;
    this.write();
    return clone(entry);
  }

  updateBillingSync(taskId, changes = {}) {
    const entry = this.state.entries.find((item) => item.taskId === taskId);
    if (!entry) return null;
    entry.billingSync = { ...entry.billingSync, ...changes };
    if (changes.status === "complete" && aggregateStatus(entry.predictionIds, entry.predictionSettlements) !== "complete") {
      entry.billingSync.status = aggregateStatus(entry.predictionIds, entry.predictionSettlements);
    }
    if (changes.syncedAt) this.state.lastSyncedAt = changes.syncedAt;
    this.write();
    return clone(entry);
  }

  migrateAccountIds(resolveAccountId) {
    let changed = false;
    for (const entry of this.state.entries) {
      if (entry.accountId) continue;
      const resolved = typeof resolveAccountId === "function" ? resolveAccountId(entry.owner) : null;
      entry.accountId = String(resolved || legacyAccountId(entry.owner));
      changed = true;
    }
    if (changed) this.write();
    return changed;
  }

  entriesForSync({ now = this.now(), force = false } = {}) {
    const nowMs = new Date(now).getTime();
    return this.state.entries.filter((entry) => {
      if (!entry.predictionIds?.length || entry.billingSync.status === "complete") return false;
      if (force) return true;
      const nextAttemptAt = entry.billingSync.nextAttemptAt ? Date.parse(entry.billingSync.nextAttemptAt) : 0;
      if (Number(entry.billingSync.attempts) >= MAX_AUTOMATIC_BILLING_ATTEMPTS && !nextAttemptAt) return false;
      return !nextAttemptAt || nextAttemptAt <= nowMs;
    }).map(clone);
  }

  list() { return clone(this.state.entries); }
  get(taskId) { const entry = this.state.entries.find((item) => item.taskId === taskId); return entry ? clone(entry) : null; }
  snapshot() { return clone(this.state); }
  pendingCount() { return this.state.entries.filter((entry) => entry.billingSync.status !== "complete" && entry.predictionIds?.length).length; }
}
