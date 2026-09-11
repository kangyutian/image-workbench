import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_TARGET_BYTES, needsImageCompression } from "../../shared/imageUploadPolicy";
import type { ProductSuiteMedia } from "../productSuiteTypes";

const MAX_COMPRESSED_DIMENSION = 4096;
const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5];
const SCALE_STEP = 0.85;

function createMediaId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`无法读取图片：${file.name}`));
    reader.readAsDataURL(file);
  });
}

function dataUrlByteSize(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return Number.POSITIVE_INFINITY;
  const base64 = dataUrl.slice(comma + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor(base64.length * 3 / 4) - padding;
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片无法解码，无法自动压缩。"));
    image.src = dataUrl;
  });
}

function compressedFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "") || "product-image";
  return `${baseName}.webp`;
}

function compressedMedia(file: File, image: HTMLImageElement): ProductSuiteMedia {
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  let scale = Math.min(1, MAX_COMPRESSED_DIMENSION / longestSide);

  for (let attempt = 0; attempt < 12 && scale > 0.05; attempt += 1, scale *= SCALE_STEP) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持图片压缩，请换用 JPG、WebP 或更小的图片。");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of QUALITY_STEPS) {
      const encoded = canvas.toDataURL("image/webp", quality);
      if (!encoded.startsWith("data:image/webp")) throw new Error("浏览器不支持 WebP 压缩，请换用 JPG、WebP 或更小的图片。");
      const size = dataUrlByteSize(encoded);
      if (size < IMAGE_UPLOAD_TARGET_BYTES && size < IMAGE_UPLOAD_MAX_BYTES) {
        return { id: createMediaId(), fileName: compressedFileName(file.name), dataUrl: encoded, mimeType: "image/webp", size };
      }
    }
  }

  throw new Error(`图片 ${file.name} 压缩后仍超过10MB，请换用 JPG、WebP 或更小的图片。`);
}

export async function prepareProductSuiteImage(file: File): Promise<ProductSuiteMedia> {
  const original = await readFileAsDataUrl(file);
  if (!needsImageCompression(file.size)) {
    return { id: createMediaId(), fileName: file.name, dataUrl: original, mimeType: file.type, size: file.size };
  }
  return compressedMedia(file, await loadImage(original));
}
