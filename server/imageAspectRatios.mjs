export const IMAGE2_ASPECT_RATIOS = Object.freeze(["1:1", "1:2", "2:1", "1:3", "3:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "9:21", "21:9"]);
export const COMMON_ASPECT_RATIOS = Object.freeze(["1:1", "4:3", "3:4", "16:9", "9:16"]);
export const EDIT_MULTI_ASPECT_RATIOS = Object.freeze(["4:3", "3:4"]);

export function aspectRatiosFor(request = {}) {
  if (request.provider === "image2") return IMAGE2_ASPECT_RATIOS;
  if (request.provider === "nanobanana" && request.nanoModel === "nano-banana-pro-edit-multi") return EDIT_MULTI_ASPECT_RATIOS;
  return COMMON_ASPECT_RATIOS;
}

export function normalizeAspectRatio(request = {}) {
  const allowed = aspectRatiosFor(request);
  if (!allowed.includes(request.aspectRatio)) request.aspectRatio = allowed[0];
  return request;
}
