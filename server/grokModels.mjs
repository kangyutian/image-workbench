const GROK_IMAGE_MODELS = {
  "grok-2-image": {
    id: "grok-2-image",
    endpoint: "x-ai/grok-2-image",
    mode: "text-to-image",
    aspectRatio: [],
    resolution: [],
    maxImages: 4,
  },
  "grok-imagine-image-edit": {
    id: "grok-imagine-image-edit",
    endpoint: "x-ai/grok-imagine-image/edit",
    mode: "image-edit",
    aspectRatio: [],
    resolution: [],
    maxImages: 1,
  },
  "grok-imagine-image-quality": {
    id: "grok-imagine-image-quality",
    endpoint: "x-ai/grok-imagine-image-quality/text-to-image",
    mode: "text-to-image-quality",
    aspectRatio: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    resolution: ["1k", "2k"],
    maxImages: 4,
  },
};

const modelKeys = {
  "seedance-2-mini-image-to-video": "WAVESPEED_SEEDANCE_2_MINI_KEY",
  "seedance-2-fast-image-to-video": "WAVESPEED_SEEDANCE_2_FAST_KEY",
  "seedance-2-image-to-video": "WAVESPEED_SEEDANCE_2_KEY",
  "kling-3-std-image-to-video": "WAVESPEED_KLING_3_STD_I2V_KEY",
  "kling-3-pro-image-to-video": "WAVESPEED_KLING_3_PRO_I2V_KEY",
  "kling-3-std-motion-control": "WAVESPEED_KLING_3_STD_MOTION_KEY",
  "grok-imagine-video-v1.5-image-to-video": "WAVESPEED_GROK_IMAGINE_VIDEO_V15_I2V_KEY",
  "nano-banana-2-fast": "WAVESPEED_NANO_BANANA_2_FAST_KEY",
  "nano-banana-2": "WAVESPEED_NANO_BANANA_2_KEY",
  "nano-banana-pro": "WAVESPEED_NANO_BANANA_PRO_KEY",
  "nano-banana-pro-edit-multi": "WAVESPEED_NANO_BANANA_PRO_EDIT_MULTI_KEY",
  "grok-2-image": "WAVESPEED_GROK_2_IMAGE_KEY",
  "grok-imagine-image-edit": "WAVESPEED_GROK_IMAGINE_IMAGE_EDIT_KEY",
  "grok-imagine-image-quality": "WAVESPEED_GROK_IMAGINE_IMAGE_QUALITY_KEY",
  "kling-image-v3-edit": "WAVESPEED_KLING_IMAGE_V3_EDIT_KEY",
  "kling-image-o3-edit": "WAVESPEED_KLING_IMAGE_O3_EDIT_KEY",
  "kling-image-o1": "WAVESPEED_KLING_IMAGE_O1_KEY",
};

export function isGrokImageRequest(request = {}) {
  return request.provider === "grok";
}

export function grokImageModelInfo(modelId) {
  return GROK_IMAGE_MODELS[modelId];
}

export function normalizeGrokImageInput(request = {}) {
  const model = grokImageModelInfo(request.nanoModel);
  if (!model) return request;
  const normalized = { ...request };
  normalized.count = Math.max(1, Math.min(model.maxImages, Number(request.count) || 1));
  if (model.aspectRatio.length && !model.aspectRatio.includes(normalized.aspectRatio)) normalized.aspectRatio = model.aspectRatio[0];
  if (model.resolution.length && !model.resolution.includes(normalized.resolution)) normalized.resolution = model.resolution[0];
  return normalized;
}

export function validateGrokImageInput(request = {}, uploadedImages = []) {
  const model = grokImageModelInfo(request.nanoModel);
  if (!model) return ["请选择可用的 Grok 图片模型。"];
  if (!String(request.prompt || "").trim()) return ["请先输入提示词。"];
  if (model.mode === "image-edit" && uploadedImages.length !== 1) return ["Grok Imagine Image Edit 需要恰好一张参考图。"];
  if (model.mode !== "image-edit" && uploadedImages.length > 0) return [`${model.id === "grok-2-image" ? "Grok 2 Image" : "Grok Imagine Image Quality"} 仅支持文生图，请移除参考图。`];
  return [];
}

export function grokPayloadFor(request = {}, uploadedImages = []) {
  const normalized = normalizeGrokImageInput(request);
  const errors = validateGrokImageInput(normalized, uploadedImages);
  if (errors.length) throw new Error(errors[0]);
  if (normalized.nanoModel === "grok-imagine-image-edit") return { prompt: normalized.prompt.trim(), image: uploadedImages[0] };
  if (normalized.nanoModel === "grok-imagine-image-quality") {
    return {
      prompt: normalized.prompt.trim(),
      aspect_ratio: normalized.aspectRatio,
      resolution: normalized.resolution,
      num_images: normalized.count,
      output_format: "png",
    };
  }
  return { prompt: normalized.prompt.trim(), num_images: normalized.count };
}

export function envKeyForModelRequest(request = {}) {
  const modelId = request.kind === "video" ? request.modelId : request.nanoModel;
  return modelKeys[modelId] || "WAVESPEED_API_KEY";
}
