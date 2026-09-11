import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function clone(value) { return JSON.parse(JSON.stringify(value)); }

export class TaskStore {
  constructor({ file }) {
    this.file = file;
    this.tasks = this.read();
  }

  read() {
    if (!existsSync(this.file)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8"));
      return Array.isArray(parsed?.tasks) ? parsed.tasks : [];
    } catch {
      return [];
    }
  }

  write() {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, tasks: this.tasks }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.file);
  }

  list() { return clone(this.tasks); }
  get(id) { const task = this.tasks.find((item) => item.id === id); return task ? clone(task) : null; }
  create(input) { const task = { ...clone(input), createdAt: input.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }; this.tasks.push(task); this.write(); return clone(task); }
  patch(id, changes) { const index = this.tasks.findIndex((item) => item.id === id); if (index === -1) return null; this.tasks[index] = { ...this.tasks[index], ...clone(changes), updatedAt: new Date().toISOString() }; this.write(); return clone(this.tasks[index]); }
  remove(id) { const index = this.tasks.findIndex((item) => item.id === id); if (index === -1) return null; const [removed] = this.tasks.splice(index, 1); this.write(); return clone(removed); }
}
