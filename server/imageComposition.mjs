import sharp from "sharp";

export const PRODUCT_SUITE_CANVAS = Object.freeze({ width: 2048, height: 2560 });

function canvasSize(size = PRODUCT_SUITE_CANVAS) {
  const width = Math.max(1, Math.round(Number(size.width) || PRODUCT_SUITE_CANVAS.width));
  const height = Math.max(1, Math.round(Number(size.height) || PRODUCT_SUITE_CANVAS.height));
  return { width, height };
}

export async function normalizeBackgroundToFixedCanvas(backgroundBuffer, size = PRODUCT_SUITE_CANVAS) {
  const { width, height } = canvasSize(size);
  return sharp(backgroundBuffer).resize(width, height, { fit: "cover", position: "centre" }).png().toBuffer();
}

export async function composeSubjectOnFixedBackground(backgroundBuffer, subjectBuffer, size = PRODUCT_SUITE_CANVAS) {
  const { width, height } = canvasSize(size);
  const background = await normalizeBackgroundToFixedCanvas(backgroundBuffer, { width, height });
  const subject = await sharp(subjectBuffer)
    .ensureAlpha()
    .resize(width, height, { fit: "contain", position: "centre", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp(background).composite([{ input: subject, left: 0, top: 0 }]).png().toBuffer();
}

export function imageBufferDataUrl(buffer, mimeType = "image/png") {
  return `data:${mimeType};base64,${Buffer.from(buffer).toString("base64")}`;
}

export async function prepareComposedImageForUpload(buffer, maxBytes = 9.5 * 1024 * 1024) {
  const png = Buffer.from(buffer);
  if (png.length < maxBytes) return { buffer: png, mimeType: "image/png" };
  const jpeg = await sharp(png).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
  return { buffer: jpeg, mimeType: "image/jpeg" };
}
