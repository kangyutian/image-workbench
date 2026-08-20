import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export class McpIdempotencyStore {
  constructor({ file }) {
    this.file = file;
    this.records = this.read();
  }

  key(owner, idempotencyKey) {
    const accountId = String(owner?.accountId || owner?.username || "").trim();
    return `${accountId}\u0000${String(idempotencyKey || "").trim()}`;
  }

  read() {
    if (!existsSync(this.file)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  persist() {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.records, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.file);
  }

  get(owner, idempotencyKey) {
    return clone(this.records[this.key(owner, idempotencyKey)] || null);
  }

  put(owner, idempotencyKey, record) {
    this.records[this.key(owner, idempotencyKey)] = clone(record);
    this.persist();
    return clone(record);
  }

  remove(owner, idempotencyKey) {
    const key = this.key(owner, idempotencyKey);
    if (!this.records[key]) return false;
    delete this.records[key];
    this.persist();
    return true;
  }
}
