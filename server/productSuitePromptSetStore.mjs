import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { normalizeProductSuitePromptSet, productSuitePromptSetId } from "./productSuitePromptSets.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class ProductSuitePromptSetStore {
  constructor({ file }) {
    this.file = file;
    this.promptSets = this.read();
  }

  read() {
    if (!existsSync(this.file)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8"));
      return Array.isArray(parsed?.promptSets) ? parsed.promptSets : [];
    } catch {
      return [];
    }
  }

  write() {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, promptSets: this.promptSets }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.file);
  }

  list() { return clone(this.promptSets); }
  get(id) {
    const promptSet = this.promptSets.find((item) => item.id === id);
    return promptSet ? clone(promptSet) : null;
  }

  assertUniqueName(name, ownerAccountId, ownerUsername, ignoreId = "") {
    const key = String(name).trim().toLocaleLowerCase();
    const duplicate = this.promptSets.some((item) => item.id !== ignoreId
      && (item.ownerAccountId ? item.ownerAccountId === ownerAccountId : item.ownerUsername === ownerUsername)
      && item.name.toLocaleLowerCase() === key);
    if (duplicate) throw new Error("你名下已有同名的提示词版本，请换一个名称。");
  }

  create(input, owner) {
    const normalized = normalizeProductSuitePromptSet(input);
    this.assertUniqueName(normalized.name, owner.accountId, owner.username);
    const now = new Date().toISOString();
    const promptSet = {
      id: productSuitePromptSetId(),
      ...normalized,
      ownerUsername: String(owner.username),
      ownerAccountId: String(owner.accountId || ""),
      createdAt: now,
      updatedAt: now,
    };
    this.promptSets.push(promptSet);
    this.write();
    return clone(promptSet);
  }

  update(id, changes) {
    const index = this.promptSets.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const current = this.promptSets[index];
    const normalized = normalizeProductSuitePromptSet({
      name: changes.name ?? current.name,
      prompts: changes.prompts ?? current.prompts,
      requiresCustomBackground: changes.requiresCustomBackground ?? current.requiresCustomBackground,
    });
    this.assertUniqueName(normalized.name, current.ownerAccountId, current.ownerUsername, current.id);
    this.promptSets[index] = { ...current, ...normalized, updatedAt: new Date().toISOString() };
    this.write();
    return clone(this.promptSets[index]);
  }

  remove(id) {
    const index = this.promptSets.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const [removed] = this.promptSets.splice(index, 1);
    this.write();
    return clone(removed);
  }
}
