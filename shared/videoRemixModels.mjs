export const VIDEO_REMIX_LIMITS = Object.freeze({
  maxVideoBytes: 100 * 1024 * 1024,
  maxDurationSeconds: 20,
  minShots: 3,
  maxShots: 8,
  maxProductImages: 5,
  clipDuration: 5,
  maxPromptLength: 5000,
});

export const VIDEO_REMIX_ASPECT_RATIOS = Object.freeze(["9:16", "16:9", "1:1"]);

export const VIDEO_REMIX_IMAGE_MODELS = Object.freeze([
  "gpt-image-2.5-sunburst",
  "gpt-image-2",
  "nano-banana-2-fast",
  "nano-banana-2",
  "nano-banana-pro",
  "nano-banana-pro-edit-multi",
]);

export const VIDEO_REMIX_VIDEO_MODELS = new Set([
  "seedance-2-mini-image-to-video",
  "seedance-2-fast-image-to-video",
  "seedance-2-image-to-video",
  "kling-3-std-image-to-video",
  "kling-3-pro-image-to-video",
]);

export function normalizeVideoRemixSettings(input = {}) {
  const aspectRatio = VIDEO_REMIX_ASPECT_RATIOS.includes(input.aspectRatio) ? input.aspectRatio : "9:16";
  const imageModelId = VIDEO_REMIX_IMAGE_MODELS.includes(input.imageModelId) ? input.imageModelId : "gpt-image-2.5-sunburst";
  const videoModelId = VIDEO_REMIX_VIDEO_MODELS.has(input.videoModelId) ? input.videoModelId : "seedance-2-fast-image-to-video";
  return { aspectRatio, imageModelId, videoModelId, clipDuration: VIDEO_REMIX_LIMITS.clipDuration };
}

function promptText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateVideoRemixDraft(input = {}) {
  const errors = [];
  if (!VIDEO_REMIX_ASPECT_RATIOS.includes(input.aspectRatio)) errors.push("请选择支持的画面比例。");
  if (!VIDEO_REMIX_IMAGE_MODELS.includes(input.imageModelId)) errors.push("请选择 Image2 或 Nano Banana 图片模型。");
  if (!VIDEO_REMIX_VIDEO_MODELS.has(input.videoModelId)) errors.push("仅支持 Kling 或 Seedance 图生视频模型。");
  if (Number(input.clipDuration) !== VIDEO_REMIX_LIMITS.clipDuration) errors.push("视频片段时长固定为 5 秒。");

  if (Array.isArray(input.shots)) {
    if (input.shots.length < VIDEO_REMIX_LIMITS.minShots || input.shots.length > VIDEO_REMIX_LIMITS.maxShots) {
      errors.push("分镜数量必须为 3–8 个。");
    }
    let previousEnd = 0;
    input.shots.forEach((shot, index) => {
      const start = Number(shot?.startSeconds);
      const end = Number(shot?.endSeconds);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) errors.push(`第 ${index + 1} 个镜头结束时间必须晚于开始时间。`);
      if (Number.isFinite(start) && start < previousEnd) errors.push(`第 ${index + 1} 个镜头时间不能与上一个镜头重叠。`);
      previousEnd = Number.isFinite(end) ? end : previousEnd;
      if (!promptText(shot?.imagePrompt)) errors.push(`第 ${index + 1} 个镜头图像提示词不能为空。`);
      if (!promptText(shot?.videoPrompt)) errors.push(`第 ${index + 1} 个镜头视频提示词不能为空。`);
      if (promptText(shot?.imagePrompt).length > VIDEO_REMIX_LIMITS.maxPromptLength) errors.push(`第 ${index + 1} 个镜头图像提示词过长。`);
      if (promptText(shot?.videoPrompt).length > VIDEO_REMIX_LIMITS.maxPromptLength) errors.push(`第 ${index + 1} 个镜头视频提示词过长。`);
    });
  }
  return errors;
}

export function recomputeVideoRemixStatus(shots = []) {
  if (!Array.isArray(shots) || shots.length === 0) return "draft";
  const statuses = shots.flatMap((shot) => [shot.imageStatus, shot.videoStatus]);
  if (shots.every((shot) => shot.videoStatus === "done")) return "done";
  if (statuses.some((status) => status === "error")) return "partial";
  if (statuses.some((status) => ["queued", "running"].includes(status))) return "running";
  if (shots.every((shot) => shot.imageStatus === "approved")) return "ready";
  if (shots.some((shot) => ["ready", "approved"].includes(shot.imageStatus))) return "partial";
  return "draft";
}

export function invalidateShotAfterPromptEdit(shot = {}) {
  return {
    ...shot,
    imageStatus: shot.imageResultUrl ? "ready" : "idle",
    imageApprovedAt: null,
    videoStatus: "idle",
    videoTaskId: "",
    videoResultUrl: "",
    videoError: "",
  };
}

const PRIVATE_KEYS = new Set([
  "owner",
  "accountId",
  "stagedPath",
  "absolutePath",
  "uploadToken",
  "tokenHash",
  "openAiResponse",
  "providerResponse",
  "predictionId",
  "predictionIds",
  "billingKey",
]);

function sanitizePublic(value) {
  if (Array.isArray(value)) return value.map(sanitizePublic);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !PRIVATE_KEYS.has(key)).map(([key, entry]) => [key, sanitizePublic(entry)]));
}

export function publicVideoRemixProject(project) {
  return sanitizePublic(project);
}
