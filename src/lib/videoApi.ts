export type VideoModelId =
  | "seedance-2-mini-image-to-video"
  | "seedance-2-fast-image-to-video"
  | "seedance-2-image-to-video"
  | "kling-3-std-image-to-video"
  | "kling-3-pro-image-to-video"
  | "kling-3-std-motion-control"
  | "grok-imagine-video-v1.5-image-to-video";
export type VideoStatus = "queued" | "running" | "done" | "error" | "cancel_requested" | "cancelled";
export interface VideoMedia { id: string; fileName: string; dataUrl: string; mimeType: string; size?: number; }
export interface VideoReferenceImage { url: string; fileName?: string; }
export interface VideoTask { id: string; kind: "video"; status: VideoStatus; results: Array<{ url: string }>; error: string; createdAt: string; input: { modelId: VideoModelId; prompt: string; /** referenceImages[0] is the required start frame; referenceImages[1] is the optional end frame. */ referenceImages: VideoReferenceImage[]; motionVideo?: { url: string; fileName?: string }; duration?: number; aspectRatio?: string; resolution?: string; generateAudio?: boolean; characterOrientation?: "image" | "video"; keepOriginalSound?: boolean }; }
async function request(path: string, init?: RequestInit) { const response = await fetch(path, init); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.message ?? "请求失败，请稍后重试。"); return body; }
export async function uploadVideoMedia(media: VideoMedia, mediaType: "image" | "video", modelId: VideoModelId) { return String((await request("/wavespeed/upload-media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media, mediaType, modelId }) })).url); }
export async function createVideoTask(input: VideoTask["input"]) { return (await request("/workbench/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "video", ...input }) })).task as VideoTask; }
export async function loadVideoTasks() { const body = await request("/workbench/tasks"); return (Array.isArray(body.tasks) ? body.tasks : []).filter((task: unknown): task is VideoTask => typeof task === "object" && task !== null && (task as { kind?: unknown }).kind === "video"); }
export async function retryVideoTask(id: string) { return (await request(`/workbench/tasks/${encodeURIComponent(id)}/retry`, { method: "POST" })).task as VideoTask; }
export async function cancelVideoTask(id: string) { return (await request(`/workbench/tasks/${encodeURIComponent(id)}/cancel`, { method: "POST" })).task as VideoTask; }
