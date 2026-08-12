import type { GeneratedImage, GenerateRequest, NanoModelId, ProviderId, Quality, Resolution, UploadedImage } from "../types";

export interface NanoModelInfo {
  id: NanoModelId;
  label: string;
  selectLabel: string;
  shortLabel: string;
  description: string;
  useCase: string;
  supportsQuality: boolean;
  textEndpoint?: string;
  editEndpoint: string;
  prices: Record<Resolution, number>;
  priceNote?: string;
}

export const providerLabels: Record<ProviderId, string> = {
  nanobanana: "nanobanana",
  image2: "image2",
  grok: "Grok",
  kling: "Kling",
};

export const qualityLabels: Record<Quality, string> = {
  low: "草稿",
  medium: "标准",
  high: "精修",
};

export const resolutionLabels: Record<Resolution, string> = {
  "1k": "1K",
  "2k": "2K",
  "4k": "4K",
};

export const qualityUseCases: Record<Quality, string> = {
  low: "快速试图、提示词探索、低成本批量。",
  medium: "日常商用图、社媒、电商内容。",
  high: "广告主图、海报和更精细的视觉。",
};

export const nanoModels: NanoModelInfo[] = [
  {
    id: "nano-banana-2-fast",
    label: "Nano Banana 2 Fast",
    selectLabel: "Nano Banana 2 Fast · 快速便宜版 · 批量试图、草稿、提示词测试、日常社媒图",
    shortLabel: "2 Fast",
    description: "最低成本、速度优先。",
    useCase: "适合批量测试、初稿、社媒日常图。",
    supportsQuality: false,
    textEndpoint: "google/nano-banana-2/text-to-image-fast",
    editEndpoint: "google/nano-banana-2/edit-fast",
    prices: { "1k": 0.045, "2k": 0.045, "4k": 0.05 },
  },
  {
    id: "nano-banana-2",
    label: "Nano Banana 2",
    selectLabel: "Nano Banana 2 · 标准版 · 常规商用图、人物图、产品图、需要稳定一点的结果",
    shortLabel: "2",
    description: "标准性价比档。",
    useCase: "适合常规商用图、人物一致性、产品图。",
    supportsQuality: false,
    textEndpoint: "google/nano-banana-2/text-to-image",
    editEndpoint: "google/nano-banana-2/edit",
    prices: { "1k": 0.07, "2k": 0.07, "4k": 0.07 },
    priceNote: "4K 暂按起价预估，实际以 WaveSpeedAI 任务记录为准。",
  },
  {
    id: "nano-banana-pro",
    label: "Nano Banana Pro",
    selectLabel: "Nano Banana Pro · 高质量版 · 主视觉、广告图、复杂构图、文字布局、需要更精致的图",
    shortLabel: "Pro",
    description: "高质量、复杂画面优先。",
    useCase: "适合复杂文字、构图、布局、广告海报和精修图。",
    supportsQuality: false,
    textEndpoint: "google/nano-banana-pro/text-to-image",
    editEndpoint: "google/nano-banana-pro/edit",
    prices: { "1k": 0.14, "2k": 0.14, "4k": 0.24 },
  },
  {
    id: "nano-banana-pro-edit-multi",
    label: "Nano Banana Pro Edit Multi",
    selectLabel: "Nano Banana Pro Edit Multi · 多图编辑/多变体编辑专用 · 上传参考图后，基于参考图做多版本编辑",
    shortLabel: "Pro Multi",
    description: "多张编辑变体。",
    useCase: "适合一张或多张参考图批量出多个版本，不用于纯文生图。",
    supportsQuality: false,
    editEndpoint: "google/nano-banana-pro/edit-multi",
    prices: { "1k": 0.07, "2k": 0.07, "4k": 0.07 },
    priceNote: "按起价预估，实际以 WaveSpeedAI 任务记录为准。",
  },
];

export const grokModels: NanoModelInfo[] = [
  {
    id: "grok-2-image",
    label: "Grok 2 Image",
    selectLabel: "Grok 2 Image · 文生图 · 快速创作",
    shortLabel: "Grok 2",
    description: "文本直接生成图片。",
    useCase: "适合快速概念图和日常图像创作。",
    supportsQuality: false,
    editEndpoint: "x-ai/grok-2-image",
    prices: { "1k": 0.07, "2k": 0.07, "4k": 0.07 },
  },
  {
    id: "grok-imagine-image-edit",
    label: "Grok Imagine Image Edit",
    selectLabel: "Grok Imagine Image Edit · 单图编辑",
    shortLabel: "Grok Edit",
    description: "根据提示词编辑一张参考图。",
    useCase: "适合局部修改、替换背景和画面重绘。",
    supportsQuality: false,
    editEndpoint: "x-ai/grok-imagine-image/edit",
    prices: { "1k": 0.025, "2k": 0.025, "4k": 0.025 },
  },
  {
    id: "grok-imagine-image-quality",
    label: "Grok Imagine Image Quality",
    selectLabel: "Grok Imagine Image Quality · 高质量文生图",
    shortLabel: "Grok Quality",
    description: "带比例和清晰度控制的高质量文生图。",
    useCase: "适合需要更稳定构图的产品图和视觉主图。",
    supportsQuality: false,
    editEndpoint: "x-ai/grok-imagine-image-quality/text-to-image",
    prices: { "1k": 0.06, "2k": 0.08, "4k": 0.08 },
  },
];

export const klingModels: NanoModelInfo[] = [
  {
    id: "kling-image-v3-edit",
    label: "Kling Image V3 Edit",
    selectLabel: "Kling Image V3 Edit · 单图图生图 · 可批量输出多张结果",
    shortLabel: "V3 Edit",
    description: "单图编辑与图生图",
    useCase: "适合换背景、改产品、改服装和局部重绘。",
    supportsQuality: false,
    editEndpoint: "kwaivgi/kling-image-v3/edit",
    prices: { "1k": 0.028, "2k": 0.028, "4k": 0.028 },
  },
  {
    id: "kling-image-o3-edit",
    label: "Kling Image O3 Edit",
    selectLabel: "Kling Image O3 Edit · 多图融合 · 支持最高 4K",
    shortLabel: "O3 Edit",
    description: "多图参考融合与高级编辑",
    useCase: "适合将人物、产品、风格或场景从多张参考图融合到一起。",
    supportsQuality: false,
    editEndpoint: "kwaivgi/kling-image-o3/edit",
    prices: { "1k": 0.028, "2k": 0.028, "4k": 0.056 },
  },
  {
    id: "kling-image-o1",
    label: "Kling Image O1",
    selectLabel: "Kling Image O1 · 多参考图编辑 · 保持主体一致性",
    shortLabel: "O1",
    description: "多模态参考图编辑",
    useCase: "适合人物、产品、IP 和系列内容的一致性创作。",
    supportsQuality: false,
    editEndpoint: "kwaivgi/kling-image-o1",
    prices: { "1k": 0.028, "2k": 0.028, "4k": 0.028 },
  },
];

export const image2TextPrices: Record<Quality, Record<Resolution, number>> = {
  low: { "1k": 0.01, "2k": 0.02, "4k": 0.03 },
  medium: { "1k": 0.06, "2k": 0.12, "4k": 0.18 },
  high: { "1k": 0.22, "2k": 0.44, "4k": 0.66 },
};

export const image2EditPrices: Record<Quality, Record<Resolution, number>> = {
  low: { "1k": 0.03, "2k": 0.06, "4k": 0.09 },
  medium: { "1k": 0.06, "2k": 0.12, "4k": 0.18 },
  high: { "1k": 0.22, "2k": 0.44, "4k": 0.66 },
};

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nanoModelInfo(nanoModel: NanoModelId) {
  return [...nanoModels, ...grokModels, ...klingModels].find((item) => item.id === nanoModel) ?? nanoModels[0];
}

export function imageModelsForProvider(provider: ProviderId) {
  if (provider === "grok") return grokModels;
  if (provider === "kling") return klingModels;
  return nanoModels;
}

export function supportsQuality(provider: ProviderId) {
  return provider === "image2";
}

export function unitPriceFor(request: Pick<GenerateRequest, "provider" | "nanoModel" | "images" | "quality" | "resolution">) {
  if (request.provider === "image2") {
    const table = request.images.length > 0 ? image2EditPrices : image2TextPrices;
    return table[request.quality][request.resolution];
  }
  return nanoModelInfo(request.nanoModel).prices[request.resolution];
}

export function estimateCost(request: Pick<GenerateRequest, "provider" | "nanoModel" | "images" | "quality" | "resolution" | "count">) {
  const unit = unitPriceFor(request);
  return {
    unit,
    total: unit * Math.max(1, request.count),
  };
}

export function priceNoteFor(request: Pick<GenerateRequest, "provider" | "nanoModel">) {
  if (request.provider === "image2") return "预估价，实际以 WaveSpeedAI 任务记录为准。";
  return nanoModelInfo(request.nanoModel).priceNote ?? "预估价，实际以 WaveSpeedAI 任务记录为准。";
}

export function formatUsd(value: number) {
  return `$${value.toFixed(value < 0.1 ? 3 : 2)}`;
}

interface WorkbenchImageTask {
  id: string;
  kind: "image";
  status: "queued" | "running" | "done" | "error" | "cancel_requested" | "cancelled";
  results: Array<{ url?: string }>;
  error: string;
}

interface StagedImage {
  id: string;
  fileName: string;
  mimeType: string;
  size?: number;
  stagedUploadId: string;
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 413) throw new Error("上传图片太大，请压缩图片或减少参考图数量后再试。");
    throw new Error(body?.message ?? body?.error ?? `API request failed with ${response.status} ${response.statusText}`);
  }
  return body;
}

async function createImageTask(request: GenerateRequest, images: Array<UploadedImage | StagedImage>) {
  const body = await requestJson("/workbench/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, kind: "image", images }),
  });
  if (!body?.task?.id) throw new Error("图片任务创建成功，但没有返回任务 ID。");
  return body.task as WorkbenchImageTask;
}

async function stageImageMedia(media: UploadedImage): Promise<StagedImage> {
  const body = await requestJson("/workbench/stage-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media }),
  });
  if (!body?.media?.stagedUploadId) throw new Error("图片暂存成功，但没有返回上传凭证。");
  return body.media as StagedImage;
}

async function waitForImageTask(id: string): Promise<GeneratedImage[]> {
  for (let attempt = 0; attempt < 450; attempt += 1) {
    const body = await requestJson("/workbench/tasks");
    const task = Array.isArray(body?.tasks) ? body.tasks.find((item: { id?: unknown }) => item?.id === id) as WorkbenchImageTask | undefined : undefined;
    if (!task) throw new Error("图片任务不存在或已无权访问。");
    if (task.status === "done") {
      const images = task.results
        .map((result) => result?.url)
        .filter((url): url is string => typeof url === "string" && url.length > 0)
        .map((url) => ({ id: createId(), url, source: "url" as const }));
      if (images.length > 0) return images;
      throw new Error("WaveSpeedAI 任务完成，但没有返回图片结果。");
    }
    if (task.status === "error" || task.status === "cancelled") throw new Error(task.error || "图片任务生成失败。");
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error("图片任务等待超时，请稍后刷新任务列表查看结果。");
}

export async function generateImage(request: GenerateRequest): Promise<GeneratedImage[]> {
  const normalized = { ...request, count: Math.max(1, Math.min(8, request.count)) };
  const images: StagedImage[] = [];
  for (const image of normalized.images) images.push(await stageImageMedia(image));
  const task = await createImageTask(normalized, images);
  return waitForImageTask(task.id);
}

async function pollPrediction(id: string, request: GenerateRequest): Promise<GeneratedImage[]> {
  const query = new URLSearchParams({ provider: request.provider, nanoModel: request.nanoModel });
  for (let attempt = 0; attempt < 420; attempt += 1) {
    const response = await fetch(`/wavespeed/predictions/${encodeURIComponent(id)}/result?${query.toString()}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.message ?? `Unable to check image task (${response.status}).`);
    const status = String(body?.data?.status || "").toLowerCase();
    const error = body?.data?.error || body?.error;
    const urls = outputUrls(body);
    if (status === "completed" || status === "succeeded" || status === "success") {
      if (urls.length > 0) return urls.map((url) => ({ id: createId(), url, source: "url" }));
      throw new Error("WaveSpeedAI completed without an image result.");
    }
    if (status === "failed" || status === "error" || error) throw new Error(error || "WaveSpeedAI could not generate the image.");
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error("Image generation timed out. Please try again later.");
}

function outputUrls(body: any): string[] {
  const outputs = body?.data?.outputs ?? body?.data?.output ?? body?.outputs ?? [];
  if (Array.isArray(outputs)) {
    return outputs
      .map((item) => (typeof item === "string" ? item : item?.url))
      .filter((url): url is string => typeof url === "string" && url.length > 0);
  }
  return typeof outputs === "string" ? [outputs] : [];
}

export async function importImageFromUrl(url: string): Promise<UploadedImage> {
  const response = await fetch("/wavespeed/import-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 413) {
      throw new Error("图片太大，请压缩图片或换成本地上传。");
    }
    throw new Error(body?.message ?? body?.error ?? "图片链接无法读取，请换成本地上传或检查链接是否可公开访问。");
  }

  if (!body?.image?.dataUrl) {
    throw new Error("图片链接已读取，但没有得到可用图片。");
  }

  return body.image as UploadedImage;
}
