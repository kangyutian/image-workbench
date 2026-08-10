const END_FRAME_MODELS = new Set([
  "seedance-2-mini-image-to-video",
  "seedance-2-image-to-video",
  "seedance-2-fast-image-to-video",
  "kling-3-std-image-to-video",
  "kling-3-pro-image-to-video",
]);

export function supportsVideoEndFrame(modelId) {
  return END_FRAME_MODELS.has(String(modelId || ""));
}

export function maxVideoReferenceImages(modelId) {
  return supportsVideoEndFrame(modelId) ? 2 : 1;
}
