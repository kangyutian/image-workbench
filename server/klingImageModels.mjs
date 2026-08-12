const KLING_IMAGE_MODELS = {
  "kling-image-v3-edit": {
    id: "kling-image-v3-edit",
    label: "Kling Image V3 Edit",
    endpoint: "kwaivgi/kling-image-v3/edit",
    mode: "image-to-image",
    minImages: 1,
    maxImages: 1,
    aspectRatio: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"],
    resolution: ["1k", "2k"],
    maxImagesPerRequest: 9,
  },
  "kling-image-o3-edit": {
    id: "kling-image-o3-edit",
    label: "Kling Image O3 Edit",
    endpoint: "kwaivgi/kling-image-o3/edit",
    mode: "multi-image-fusion",
    minImages: 1,
    maxImages: 10,
    aspectRatio: ["auto", "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"],
    resolution: ["1k", "2k", "4k"],
    maxImagesPerRequest: 9,
  },
  "kling-image-o1": {
    id: "kling-image-o1",
    label: "Kling Image O1",
    endpoint: "kwaivgi/kling-image-o1",
    mode: "image-to-image",
    minImages: 0,
    maxImages: 10,
    aspectRatio: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9", "auto"],
    resolution: ["1k", "2k"],
    maxImagesPerRequest: 9,
  },
};

const KLING_IMAGE_KEYS = {
  "kling-image-v3-edit": "WAVESPEED_KLING_IMAGE_V3_EDIT_KEY",
  "kling-image-o3-edit": "WAVESPEED_KLING_IMAGE_O3_EDIT_KEY",
  "kling-image-o1": "WAVESPEED_KLING_IMAGE_O1_KEY",
};

export function klingImageModelInfo(modelId) {
  return KLING_IMAGE_MODELS[modelId];
}

export function isKlingImageRequest(request = {}) {
  return request.provider === "kling";
}

export function envKeyForKlingImageModel(modelId) {
  return KLING_IMAGE_KEYS[modelId] || "WAVESPEED_API_KEY";
}

export function envKeyForModelRequest(request = {}) {
  return envKeyForKlingImageModel(request.nanoModel);
}

export function requiresDedicatedKlingImageKey(request = {}) {
  return isKlingImageRequest(request) && Boolean(klingImageModelInfo(request.nanoModel));
}

export function normalizeKlingImageInput(request = {}) {
  const model = klingImageModelInfo(request.nanoModel);
  if (!model) return request;
  const normalized = { ...request };
  normalized.count = Math.max(1, Math.min(model.maxImagesPerRequest, Number(request.count) || 1));
  if (!model.aspectRatio.includes(normalized.aspectRatio)) normalized.aspectRatio = model.aspectRatio[0];
  if (!model.resolution.includes(normalized.resolution)) normalized.resolution = model.resolution[0];
  return normalized;
}

export function validateKlingImageInput(request = {}, uploadedImages = []) {
  const model = klingImageModelInfo(request.nanoModel);
  if (!model) return ["请选择可用的 Kling 图片模型。"];
  if (!String(request.prompt || "").trim()) return ["请先输入提示词。"];
  if (uploadedImages.length < model.minImages) {
    return [`${model.label} 至少需要 ${model.minImages} 张参考图。`];
  }
  if (uploadedImages.length > model.maxImages) {
    return [model.minImages === model.maxImages
      ? `${model.label} 只支持 ${model.maxImages} 张参考图。`
      : `${model.label} 最多支持 ${model.maxImages} 张参考图。`];
  }
  return [];
}

export function klingImagePayloadFor(request = {}, uploadedImages = []) {
  const normalized = normalizeKlingImageInput(request);
  const errors = validateKlingImageInput(normalized, uploadedImages);
  if (errors.length) throw new Error(errors[0]);

  const payload = {
    prompt: normalized.prompt.trim(),
    aspect_ratio: normalized.aspectRatio,
    resolution: normalized.resolution,
    num_images: normalized.count,
    output_format: "png",
  };

  if (normalized.nanoModel === "kling-image-v3-edit") {
    payload.image = uploadedImages[0];
  } else if (uploadedImages.length > 0) {
    payload.images = uploadedImages;
  }

  return payload;
}
