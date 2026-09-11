import type { UploadedImage } from "../types";

export type CutoutBackgroundMode = "transparent" | "white";
export interface CutoutTask {
  id: string;
  kind: "image";
  status: "queued" | "running" | "done" | "error" | "cancelled";
  results: Array<{ url: string }>;
  error: string;
  input: { mode: "product-cutout"; prompt: string; backgroundMode: CutoutBackgroundMode; autocrop: boolean; forceBackgroundRemoval: boolean };
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message ?? `API request failed with ${response.status}`);
  return body;
}

export async function createCutoutTask(input: CutoutTask["input"], image: UploadedImage) {
  const body = await request("/workbench/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "image", ...input, images: [image] }),
  });
  return body.task as CutoutTask;
}

export async function loadCutoutTasks() {
  const body = await request("/workbench/tasks");
  return (Array.isArray(body.tasks) ? body.tasks : []).filter((task: unknown): task is CutoutTask => Boolean(
    task && typeof task === "object" && (task as { input?: { mode?: unknown } }).input?.mode === "product-cutout",
  ));
}
