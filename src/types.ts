export type ProviderId = "nanobanana" | "image2";

export type GenerationMode = "text-to-image" | "image-to-image" | "multi-image-fusion";

export type Quality = "standard" | "hd" | "2k" | "4k";

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface UploadedImage {
  id: string;
  fileName: string;
  dataUrl: string;
  mimeType: string;
}

export interface GenerateRequest {
  provider: ProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  negativePrompt?: string;
  images: UploadedImage[];
  aspectRatio: string;
  count: number;
  strength: number;
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
