export type ProviderId = "nanobanana" | "image2" | "grok" | "kling";

export type NanoModelId =
  | "nano-banana-2-fast"
  | "nano-banana-2"
  | "nano-banana-pro"
  | "nano-banana-pro-edit-multi"
  | "grok-2-image"
  | "grok-imagine-image-edit"
  | "grok-imagine-image-quality"
  | "kling-image-v3-edit"
  | "kling-image-o3-edit"
  | "kling-image-o1";

export type GenerationMode = "text-to-image" | "image-to-image" | "multi-image-fusion";

export type Quality = "low" | "medium" | "high";

export type Resolution = "1k" | "2k" | "4k";

export interface UploadedImage {
  id: string;
  fileName: string;
  dataUrl: string;
  mimeType: string;
  size?: number;
}

export type TaskPreset = "print-extraction" | "product-cutout";

export interface GenerateRequest {
  provider: ProviderId;
  nanoModel: NanoModelId;
  prompt: string;
  images: UploadedImage[];
  aspectRatio: string;
  count: number;
  resolution: Resolution;
  quality: Quality;
}

export interface GeneratedImage {
  id: string;
  url: string;
  source: "url" | "base64" | "mock";
}

export interface HistoryEntry {
  id: string;
  provider: ProviderId;
  mode: GenerationMode;
  prompt: string;
  createdAt: string;
  images: GeneratedImage[];
}
