function hasPredictionIds(task) {
  return Boolean(task?.predictionId) || (Array.isArray(task?.predictionIds) && task.predictionIds.length > 0);
}

export function recoveryAction(task) {
  if (task?.status === "queued") return "enqueue";
  if (task?.status === "running") return hasPredictionIds(task) ? "enqueue" : "requeue";
  if (task?.status === "cancel_requested") return hasPredictionIds(task) ? "enqueue" : "cancel";
  return "ignore";
}

export class TaskScheduler {
  constructor({ maxConcurrent = 2, run }) {
    this.maxConcurrent = Math.max(1, Number(maxConcurrent) || 2);
    this.run = run;
    this.queues = { image: [], video: [] };
    this.active = 0;
    this.lastKind = "video";
    this.drainScheduled = false;
  }

  enqueue(task) {
    if (task?.kind !== "image" && task?.kind !== "video") throw new Error("Unsupported task kind.");
    this.queues[task.kind].push(task);
    this.scheduleDrain();
  }

  scheduleDrain() {
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    setImmediate(() => {
      this.drainScheduled = false;
      this.drain();
    });
  }

  next() {
    const first = this.lastKind === "image" ? "video" : "image";
    const second = first === "image" ? "video" : "image";
    const task = this.queues[first].shift() || this.queues[second].shift();
    if (task) this.lastKind = task.kind;
    return task;
  }

  drain() {
    while (this.active < this.maxConcurrent) {
      const task = this.next();
      if (!task) return;
      this.active += 1;
      Promise.resolve(this.run(task)).catch(() => undefined).finally(() => { this.active -= 1; this.scheduleDrain(); });
    }
  }

  snapshot() { return { active: this.active, queued: this.queues.image.length + this.queues.video.length, image: this.queues.image.length, video: this.queues.video.length }; }
}
