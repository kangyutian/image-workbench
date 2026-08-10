import { maxVideoReferenceImages } from "../shared/videoFramePolicy.mjs";

const IMAGE_TO_VIDEO_RATIOS = ["16:9", "9:16", "4:3", "3:4", "1:1"];

export const VIDEO_MODELS = {
  "seedance-2-mini-image-to-video": {
    id: "seedance-2-mini-image-to-video",
    label: "Seedance 2.0 Mini",
    endpoint: "bytedance/seedance-2.0-mini/image-to-video",
    mode: "image-to-video",
    priceHint: 0.24,
    requiresPrompt: true,
    duration: [4, 5, 6, 8, 10, 12, 15],
    aspectRatio: [...IMAGE_TO_VIDEO_RATIOS, "21:9"],
    resolution: ["480p", "720p", "1080p", "4k"],
    supportsAudio: true,
  },
  "seedance-2-image-to-video": {
    id: "seedance-2-image-to-video",
    label: "Seedance 2.0",
    endpoint: "bytedance/seedance-2.0/image-to-video",
    mode: "image-to-video",
    priceHint: 0.6,
    requiresPrompt: true,
    duration: [5],
    aspectRatio: IMAGE_TO_VIDEO_RATIOS,
    resolution: ["720p"],
    supportsAudio: true,
  },
  "seedance-2-fast-image-to-video": {
    id: "seedance-2-fast-image-to-video",
    label: "Seedance 2.0 Fast",
    endpoint: "bytedance/seedance-2.0-fast/image-to-video",
    mode: "image-to-video",
    priceHint: 0.5,
    requiresPrompt: true,
    duration: [4, 5, 6, 8, 10, 12, 15],
    aspectRatio: IMAGE_TO_VIDEO_RATIOS,
    resolution: ["480p", "720p", "1080p"],
    supportsAudio: true,
  },
  "kling-3-std-image-to-video": {
    id: "kling-3-std-image-to-video",
    label: "Kling 3.0 Standard",
    endpoint: "kwaivgi/kling-v3.0-std/image-to-video",
    mode: "image-to-video",
    priceHint: 0.42,
    requiresPrompt: false,
    duration: [3, 5, 10, 15],
    aspectRatio: [],
    resolution: [],
    supportsAudio: false,
  },
  "kling-3-pro-image-to-video": {
    id: "kling-3-pro-image-to-video",
    label: "Kling 3.0 Pro",
    endpoint: "kwaivgi/kling-v3.0-pro/image-to-video",
    mode: "image-to-video",
    priceHint: 0.56,
    requiresPrompt: false,
    duration: [3, 5, 10, 15],
    aspectRatio: [],
    resolution: [],
    supportsAudio: false,
  },
  "grok-imagine-video-v1.5-image-to-video": {
    id: "grok-imagine-video-v1.5-image-to-video",
    label: "Grok Imagine Video v1.5",
    endpoint: "x-ai/grok-imagine-video-v1.5/image-to-video",
    mode: "image-to-video",
    priceHint: 0.08,
    requiresPrompt: true,
    duration: Array.from({ length: 15 }, (_, index) => index + 1),
    aspectRatio: [],
    resolution: ["480p", "720p"],
    supportsAudio: false,
  },
  "kling-3-std-motion-control": {
    id: "kling-3-std-motion-control",
    label: "Kling 3.0 Standard 动作控制",
    endpoint: "kwaivgi/kling-v3.0-std/motion-control",
    mode: "motion-control",
    priceHint: 0.63,
    requiresPrompt: false,
    duration: [],
    aspectRatio: [],
    resolution: [],
    supportsAudio: false,
  },
};

export function videoModelInfo(modelId) {
  return VIDEO_MODELS[modelId] || VIDEO_MODELS["seedance-2-mini-image-to-video"];
}

export function clientVideoModels() {
  return Object.values(VIDEO_MODELS).map(({ endpoint, ...model }) => model);
}

function firstUrl(items) {
  return Array.isArray(items) && typeof items[0]?.url === "string" ? items[0].url : "";
}

function normalizeChoice(value, options) {
  return options.length === 0 ? undefined : options.includes(value) ? value : options[0];
}

export function normalizeVideoInput(input = {}) {
  const model = videoModelInfo(input.modelId);
  const normalized = {
    ...input,
    kind: "video",
    modelId: model.id,
    prompt: String(input.prompt || "").trim(),
    referenceImages: Array.isArray(input.referenceImages) ? input.referenceImages.filter((item) => typeof item?.url === "string" && item.url) : [],
  };

  if (model.mode === "motion-control") {
    normalized.characterOrientation = input.characterOrientation === "video" ? "video" : "image";
    normalized.keepOriginalSound = input.keepOriginalSound !== false;
    delete normalized.duration;
    delete normalized.aspectRatio;
    delete normalized.resolution;
    delete normalized.generateAudio;
    return normalized;
  }

  normalized.duration = normalizeChoice(Number(input.duration), model.duration);
  normalized.aspectRatio = normalizeChoice(input.aspectRatio, model.aspectRatio);
  normalized.resolution = normalizeChoice(input.resolution, model.resolution);
  normalized.generateAudio = model.supportsAudio ? input.generateAudio !== false : undefined;
  return normalized;
}

export function validateVideoInput(input = {}) {
  const normalized = normalizeVideoInput(input);
  const model = videoModelInfo(normalized.modelId);
  const errors = [];
  const maxReferenceImages = maxVideoReferenceImages(model.id);
  if (normalized.referenceImages.length === 0) errors.push("请先上传参考图。");
  if (normalized.referenceImages.length > maxReferenceImages) errors.push(`This model only supports ${maxReferenceImages === 1 ? "one image" : "two images"}.`);
  if (model.requiresPrompt && !normalized.prompt) errors.push("请先输入运动提示词。");
  if (model.mode === "motion-control" && typeof normalized.motionVideo?.url !== "string") errors.push("请上传动作参考视频。");
  return errors;
}

export function videoPayloadFor(input = {}) {
  const request = normalizeVideoInput(input);
  const errors = validateVideoInput(request);
  if (errors.length) throw new Error(errors[0]);
  const model = videoModelInfo(request.modelId);
  const image = firstUrl(request.referenceImages);
  const endImage = request.referenceImages[1]?.url;

  if (model.mode === "motion-control") {
    return {
      image,
      video: request.motionVideo.url,
      character_orientation: request.characterOrientation,
      ...(request.prompt ? { prompt: request.prompt } : {}),
      keep_original_sound: request.keepOriginalSound,
    };
  }

  if (request.modelId === "kling-3-std-image-to-video" || request.modelId === "kling-3-pro-image-to-video") {
    return { image, ...(endImage ? { end_image: endImage } : {}), ...(request.prompt ? { prompt: request.prompt } : {}), duration: request.duration };
  }

  if (request.modelId === "grok-imagine-video-v1.5-image-to-video") {
    return { prompt: request.prompt, image, duration: request.duration, resolution: request.resolution };
  }

  return {
    prompt: request.prompt,
    image,
    ...(endImage ? { last_image: endImage } : {}),
    aspect_ratio: request.aspectRatio,
    resolution: request.resolution,
    duration: request.duration,
    generate_audio: request.generateAudio,
    enable_web_search: false,
  };
}
