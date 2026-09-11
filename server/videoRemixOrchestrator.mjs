import { VIDEO_REMIX_LIMITS } from "../shared/videoRemixModels.mjs";

const PRODUCT_IDENTITY_LOCK = "使用上传的产品参考图作为唯一产品身份。Preserve the exact shape, color, materials, proportions, logo placement, and visible details from the uploaded product references. 不要增加配件、伴随产品、包装、服装、文字或额外产品部件；所有新增内容必须来自提示词明确要求。";

function imageProviderFor(modelId) {
  return String(modelId || "").startsWith("gpt-") ? "image2" : "nanobanana";
}

export function imageRequestForShot(project, shot, references = []) {
  return {
    kind: "image",
    provider: imageProviderFor(project.imageModelId),
    nanoModel: project.imageModelId,
    prompt: `${String(shot.imagePrompt || "").trim()}\n\n${PRODUCT_IDENTITY_LOCK}`.trim(),
    images: references,
    aspectRatio: project.aspectRatio,
    count: 1,
    resolution: "2k",
    quality: "high",
  };
}

export function videoRequestForShot(project, shot) {
  return {
    kind: "video",
    modelId: project.videoModelId,
    prompt: String(shot.videoPrompt || "").trim(),
    referenceImages: shot.imageResultUrl ? [{ url: shot.imageResultUrl }] : [],
    duration: VIDEO_REMIX_LIMITS.clipDuration,
    aspectRatio: project.aspectRatio,
    resolution: "720p",
    generateAudio: false,
  };
}

export function allStoryboardShotsApproved(shots = []) {
  return Array.isArray(shots) && shots.length > 0 && shots.every((shot) => shot.imageStatus === "approved");
}

export function syncRemixTaskResult({ projectStore, task }) {
  if (!task?.remixProjectId || !task?.remixShotId || !task?.remixStage) return null;
  const prefix = task.remixStage === "video" ? "video" : "image";
  const success = task.status === "done";
  const resultUrl = success ? String(task.results?.[0]?.url || "") : "";
  const changes = prefix === "image"
    ? {
      imageStatus: success && resultUrl ? "ready" : "error",
      imageTaskId: task.id,
      imageResultUrl: resultUrl,
      imageError: success && resultUrl ? "" : String(task.error || "生成失败。"),
    }
    : {
      videoStatus: success && resultUrl ? "done" : "error",
      videoTaskId: task.id,
      videoResultUrl: resultUrl,
      videoError: success && resultUrl ? "" : String(task.error || "生成失败。"),
    };
  return projectStore.patchShot(task.remixProjectId, task.remixShotId, changes);
}

export function remixTaskMetadata(projectId, shotId, stage) {
  return { remixProjectId: projectId, remixShotId: shotId, remixStage: stage };
}

export { PRODUCT_IDENTITY_LOCK };
