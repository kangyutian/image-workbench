import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { recomputeVideoRemixStatus } from "../shared/videoRemixModels.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateShotIds(shots) {
  if (!Array.isArray(shots)) throw new Error("分镜列表必须是数组。");
  const ids = shots.map((shot) => String(shot?.id || ""));
  if (ids.some((id) => !id)) throw new Error("每个分镜都需要唯一 ID。");
  if (new Set(ids).size !== ids.length) throw new Error("分镜 ID 不能重复。");
}

function validateEditableShots(shots) {
  validateShotIds(shots);
  if (shots.length < 3 || shots.length > 8) throw new Error("分镜数量必须为 3–8 个。");
}

export class VideoRemixStore {
  constructor({ file }) {
    this.file = file;
    this.projects = this.read();
  }

  read() {
    if (!existsSync(this.file)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8"));
      return Array.isArray(parsed?.projects) ? parsed.projects : [];
    } catch {
      return [];
    }
  }

  write() {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, projects: this.projects }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.file);
  }

  list() {
    return clone(this.projects);
  }

  get(id) {
    const project = this.projects.find((item) => item.id === id);
    return project ? clone(project) : null;
  }

  create(input) {
    const now = new Date().toISOString();
    const shots = Array.isArray(input.shots) ? input.shots : [];
    validateShotIds(shots);
    const project = {
      ...clone(input),
      shots,
      status: input.status || recomputeVideoRemixStatus(shots),
      createdAt: input.createdAt || now,
      updatedAt: now,
    };
    this.projects.push(project);
    this.write();
    return clone(project);
  }

  patch(id, changes) {
    const index = this.projects.findIndex((item) => item.id === id);
    if (index === -1) return null;
    this.projects[index] = { ...this.projects[index], ...clone(changes), updatedAt: new Date().toISOString() };
    this.write();
    return clone(this.projects[index]);
  }

  patchShot(id, shotId, changes) {
    const project = this.projects.find((item) => item.id === id);
    if (!project) return null;
    const index = (project.shots || []).findIndex((shot) => shot.id === shotId);
    if (index === -1) return null;
    project.shots[index] = { ...project.shots[index], ...clone(changes), updatedAt: new Date().toISOString() };
    project.status = recomputeVideoRemixStatus(project.shots);
    project.updatedAt = new Date().toISOString();
    this.write();
    return clone(project);
  }

  replaceShots(id, shots) {
    const project = this.projects.find((item) => item.id === id);
    if (!project) return null;
    validateEditableShots(shots);
    project.shots = clone(shots);
    project.status = recomputeVideoRemixStatus(project.shots);
    project.updatedAt = new Date().toISOString();
    this.write();
    return clone(project);
  }

  failQueuedShots(id, message, stage = "image") {
    const project = this.projects.find((item) => item.id === id);
    if (!project) return null;
    const now = new Date().toISOString();
    project.shots = (project.shots || []).map((shot) => {
      const statusKey = stage === "video" ? "videoStatus" : "imageStatus";
      const errorKey = stage === "video" ? "videoError" : "imageError";
      return shot[statusKey] === "queued" ? { ...shot, [statusKey]: "error", [errorKey]: String(message || "任务执行失败。"), updatedAt: now } : shot;
    });
    project.status = recomputeVideoRemixStatus(project.shots);
    project.updatedAt = now;
    this.write();
    return clone(project);
  }

  remove(id) {
    const index = this.projects.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const [removed] = this.projects.splice(index, 1);
    this.write();
    return clone(removed);
  }

  forOwner(owner) {
    return this.projects
      .filter((item) => item.accountId ? item.accountId === owner.accountId : item.owner === owner.username)
      .map(clone);
  }
}
