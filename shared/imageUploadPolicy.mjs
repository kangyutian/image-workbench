export const IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_UPLOAD_TARGET_BYTES = 8 * 1024 * 1024;

export function needsImageCompression(size) {
  return Number(size) >= IMAGE_UPLOAD_MAX_BYTES;
}
