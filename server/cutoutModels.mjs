const MODEL = {
  id: "bria-extract-object",
  endpoint: "bria/extract-object",
  priceUsd: 0.02,
};

export function cutoutModelInfo() {
  return { ...MODEL };
}

export function cutoutEnvKey() {
  return "WAVESPEED_BRIA_EXTRACT_OBJECT_KEY";
}

export function normalizeCutoutInput(input = {}) {
  return {
    kind: "cutout",
    prompt: String(input.prompt || "").trim() || "main product",
    backgroundMode: input.backgroundMode === "white" ? "white" : "transparent",
    forceBackgroundRemoval: input.forceBackgroundRemoval !== false,
    autocrop: input.autocrop === true,
  };
}

export function validateCutoutInput(input = {}, images = []) {
  const errors = [];
  if (!Array.isArray(images) || images.length === 0) errors.push("产品抠图需要 1 张输入图片。");
  else if (images.length > 1) errors.push("每个抠图任务只能包含 1 张输入图片。");
  if (!["transparent", "white"].includes(input.backgroundMode)) errors.push("背景模式只能选择透明底或白底。");
  if (input.prompt !== undefined && String(input.prompt).trim().length > 240) errors.push("产品描述不能超过 240 个字符。");
  return errors;
}

export function cutoutPayloadFor(input = {}, imageUrl) {
  if (input.backgroundMode === "white") {
    return { image: imageUrl, preserve_alpha: false };
  }
  return {
    image: imageUrl,
    prompt: String(input.prompt || "main product").trim() || "main product",
    force_background_removal: input.forceBackgroundRemoval !== false,
    autocrop: input.autocrop === true,
  };
}

export function isCutoutRequest(request = {}) {
  return request.mode === "product-cutout";
}

export function cutoutEndpointFor(input = {}) {
  return input.backgroundMode === "white" ? "bria/remove-background" : "bria/extract-object";
}
