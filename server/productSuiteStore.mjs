import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeSuite(suite) {
  const result = clone(suite);
  if (result.input && typeof result.input === "object") delete result.input.backgroundImages;
  return result;
}

function recomputeStatus(items = []) {
  const statuses = items.map((item) => item.status);
  if (statuses.length > 0 && statuses.every((status) => status === "done")) return "done";
  if (statuses.some((status) => status === "running")) return "running";
  if (statuses.some((status) => status === "done" || status === "error")) return "partial";
  return "queued";
}

export class ProductSuiteStore {
  constructor({ file }) {
    this.file = file;
    this.needsMigration = false;
    this.suites = this.read();
    if (this.needsMigration) this.write();
  }

  read() {
    if (!existsSync(this.file)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8"));
      const suites = Array.isArray(parsed?.suites) ? parsed.suites : [];
      const sanitized = suites.map(sanitizeSuite);
      this.needsMigration = JSON.stringify(suites) !== JSON.stringify(sanitized);
      return sanitized;
    } catch {
      return [];
    }
  }

  write() {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, suites: this.suites }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.file);
  }

  list() {
    return clone(this.suites);
  }

  get(id) {
    const suite = this.suites.find((item) => item.id === id);
    return suite ? clone(suite) : null;
  }

  create(input) {
    const now = new Date().toISOString();
    const suite = { ...clone(input), status: input.status || recomputeStatus(input.items), createdAt: input.createdAt || now, updatedAt: now };
    this.suites.push(suite);
    this.write();
    return clone(suite);
  }

  patch(id, changes) {
    const index = this.suites.findIndex((item) => item.id === id);
    if (index === -1) return null;
    this.suites[index] = { ...this.suites[index], ...clone(changes), updatedAt: new Date().toISOString() };
    this.write();
    return clone(this.suites[index]);
  }

  patchItem(id, slot, changes) {
    const suite = this.suites.find((item) => item.id === id);
    if (!suite) return null;
    const items = (suite.items || []).map((item) => item.slot === slot ? { ...item, ...clone(changes), updatedAt: new Date().toISOString() } : item);
    suite.items = items;
    suite.status = recomputeStatus(items);
    suite.updatedAt = new Date().toISOString();
    this.write();
    return clone(suite);
  }

  failQueuedItems(id, error) {
    const suite = this.suites.find((item) => item.id === id);
    if (!suite) return null;
    const now = new Date().toISOString();
    const items = (suite.items || []).map((item) => item.status === "queued"
      ? { ...item, status: "error", error: String(error || "商品套图生成失败。"), updatedAt: now }
      : item);
    suite.items = items;
    suite.status = recomputeStatus(items);
    suite.updatedAt = now;
    this.write();
    return clone(suite);
  }

  remove(id) {
    const index = this.suites.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const [removed] = this.suites.splice(index, 1);
    this.write();
    return clone(removed);
  }

  forOwner(owner) {
    return this.suites.filter((item) => item.accountId ? item.accountId === owner.accountId : item.owner === owner.username).map(clone);
  }
}

export { recomputeStatus };
