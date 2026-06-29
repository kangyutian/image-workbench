import type { GeneratedImage, GenerateRequest } from "../types";

const sizeByQuality: Record<string, Record<string, string>> = {
  standard: {
    "1:1": "1024x1024",
    "3:4": "1024x1536",
    "4:3": "1536x1024",
    "16:9": "1792x1024",
    "9:16": "1024x1792",
  },
  hd: {
    "1:1": "1536x1536",
    "3:4": "1536x2048",
    "4:3": "2048x1536",
    "16:9": "2048x1152",
    "9:16": "1152x2048",
  },
  "2k": {
    "1:1": "2048x2048",
    "3:4": "1536x2048",
    "4:3": "2048x1536",
    "16:9": "2048x1152",
    "9:16": "1152x2048",
  },
  "4k": {
    "1:1": "4096x4096",
    "3:4": "3072x4096",
    "4:3": "4096x3072",
    "16:9": "4096x2304",
    "9:16": "2304x4096",
  },
};

const imageSizeByQuality = {
  standard: "1K",
  hd: "2K",
  "2k": "2K",
  "4k": "4K",
} as const;

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanApiKey(rawKey: string) {
  const keyMatch = rawKey.match(/sk-[A-Za-z0-9._-]+/);
  const cleaned = (keyMatch?.[0] ?? rawKey)
    .replace(/^Bearer\s+/i, "")
    .replace(/[\s​-‍﻿]/g, "")
    .trim();

  if (!cleaned) return "";
  if (!/^[!-~]+$/.test(cleaned)) {
    throw new Error("API Key 里包含中文、全角符号或不可见字符，请只粘贴 sk- 开头的令牌本体，不要带说明文字。");
  }
  return cleaned;
}

function requestHeaders(request: GenerateRequest, json = false) {
  const apiKey = cleanApiKey(request.apiKey);
  const headers: Record<string, string> = {
    "x-image-provider": request.provider,
  };
  if (json) headers["Content-Type"] = "application/json";
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function outputSizeFor(request: GenerateRequest) {
  return sizeByQuality[request.quality]?.[request.aspectRatio] ?? sizeByQuality.standard["1:1"];
}

function apiQualityFor(request: GenerateRequest) {
  return request.quality === "standard" ? "medium" : "high";
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

function toBrowserEndpoint(url: string) {
  return url
    .replace(/^https:\/\/api\.gemai\.cc\/v1beta/, "/gemai/v1beta")
    .replace(/^https:\/\/api\.gemai\.cc\/v1/, "/gemai/v1");
}

function dataUrlToBase64(dataUrl: string) {
  return dataUrl.split(",")[1] ?? dataUrl;
}

function openAiEndpointFor(baseUrl: string, hasImages: boolean) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith("/images/generations") || normalized.endsWith("/images/edits")) {
    return toBrowserEndpoint(normalized);
  }
  return toBrowserEndpoint(`${normalized}${hasImages ? "/images/edits" : "/images/generations"}`);
}

function geminiEndpointFor(baseUrl: string, model: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith(":generateContent")) {
    return toBrowserEndpoint(normalized);
  }
  return toBrowserEndpoint(`${normalized}/models/${encodeURIComponent(model)}:generateContent`);
}

function parseImages(payload: unknown): GeneratedImage[] {
  const data = payload as {
    data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
    images?: Array<{ url?: string; b64_json?: string }>;
    output?: Array<{ url?: string; b64_json?: string }>;
    output_image?: { data?: string; mime_type?: string; mimeType?: string };
    outputImage?: { data?: string; mime_type?: string; mimeType?: string };
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
          inline_data?: { data?: string; mime_type?: string };
        }>;
      };
    }>;
  };
  const geminiImage = data.output_image ?? data.outputImage;
  if (geminiImage?.data) {
    const mimeType = geminiImage.mime_type ?? geminiImage.mimeType ?? "image/png";
    return [
      {
        id: createId(),
        url: `data:${mimeType};base64,${geminiImage.data}`,
        source: "base64",
      },
    ];
  }
  const inlineImages =
    data.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.inlineData ?? part.inline_data)
      .filter((part): part is { data?: string; mimeType?: string; mime_type?: string } => Boolean(part?.data)) ?? [];
  if (inlineImages.length > 0) {
    return inlineImages.map((image) => ({
      id: createId(),
      url: `data:${image.mimeType ?? image.mime_type ?? "image/png"};base64,${image.data}`,
      source: "base64",
    }));
  }
  const candidates = data.data ?? data.images ?? data.output ?? [];
  return candidates
    .map((item, index) => {
      if (item.url) {
        return { id: createId(), url: item.url, source: "url" as const };
      }
      if (item.b64_json) {
        return {
          id: createId(),
          url: `data:image/png;base64,${item.b64_json}`,
          source: "base64" as const,
        };
      }
      return {
        id: createId(),
        url: createMockSvg(`Result ${index + 1}`, "No image field returned"),
        source: "mock" as const,
      };
    })
    .filter(Boolean);
}

export async function generateImage(request: GenerateRequest): Promise<GeneratedImage[]> {
  const prompt = [request.prompt, request.negativePrompt ? `Negative prompt: ${request.negativePrompt}` : ""]
    .filter(Boolean)
    .join("\n\n");
  const outputCount = Math.max(1, Math.min(8, request.count));

  if (request.baseUrl.trim().toLowerCase() === "mock") {
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    return Array.from({ length: outputCount }, (_, index) => ({
      id: createId(),
      url: createMockSvg(`${request.provider} ${index + 1}`, request.prompt),
      source: "mock" as const,
    }));
  }

  const singleImageRequest = { ...request, count: 1 };
  const generator = request.provider === "nanobanana" ? generateGeminiImage : generateOpenAiImage;
  const batches = await Promise.all(
    Array.from({ length: outputCount }, () => generator(singleImageRequest, prompt)),
  );
  return batches.flat();
}

async function generateOpenAiImage(request: GenerateRequest, prompt: string) {
  const hasImages = request.images.length > 0;
  const endpoint = openAiEndpointFor(request.baseUrl, hasImages);
  const quality = apiQualityFor(request);
  const size = outputSizeFor(request);
  const imageSize = imageSizeByQuality[request.quality];

  const response = hasImages
    ? await fetch(endpoint, {
        method: "POST",
        headers: requestHeaders(request),
        body: openAiEditFormData(request, prompt, quality, size, imageSize),
      })
    : await fetch(endpoint, {
        method: "POST",
        headers: requestHeaders(request, true),
        body: JSON.stringify({
          model: request.model,
          prompt,
          n: request.count,
          size,
          quality,
          image_size: imageSize,
        }),
      });

  return parseImageResponse(response);
}

function openAiEditFormData(
  request: GenerateRequest,
  prompt: string,
  quality: string,
  size: string,
  imageSize: string,
) {
  const form = new FormData();
  form.append("model", request.model);
  form.append("prompt", prompt);
  form.append("n", String(request.count));
  form.append("size", size);
  form.append("quality", quality);
  form.append("image_size", imageSize);
  request.images.forEach((image) => {
    form.append("image", dataUrlToBlob(image.dataUrl, image.mimeType), image.fileName);
  });
  return form;
}

async function generateGeminiImage(request: GenerateRequest, prompt: string) {
  const response = await fetch(geminiEndpointFor(request.baseUrl, request.model), {
    method: "POST",
    headers: requestHeaders(request, true),
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: addAspectHint(prompt, request.aspectRatio) },
            ...request.images.map((image) => ({
              inlineData: {
                mimeType: image.mimeType,
                data: dataUrlToBase64(image.dataUrl),
              },
            })),
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  return parseImageResponse(response);
}

function addAspectHint(prompt: string, aspectRatio: string) {
  if (!aspectRatio) return prompt;
  return `${prompt}

??? ${aspectRatio} ??????`;
}

async function parseImageResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage =
      body?.error?.message ??
      body?.message ??
      `API request failed with ${response.status} ${response.statusText}`;
    throw new Error(errorMessage);
  }

  const images = parseImages(body);
  if (images.length === 0) {
    throw new Error("API responded successfully but no image URL or base64 image was found.");
  }
  return images;
}

function dataUrlToBlob(dataUrl: string, mimeType: string) {
  const base64 = dataUrlToBase64(dataUrl);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function createMockSvg(title: string, prompt: string) {
  const safeTitle = escapeXml(title);
  const safePrompt = escapeXml(prompt.slice(0, 120));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <rect width="1024" height="1024" fill="#f6f7f8"/>
      <rect x="70" y="70" width="884" height="884" rx="36" fill="#ffffff" stroke="#d8dde3" stroke-width="3"/>
      <circle cx="798" cy="202" r="96" fill="#56c2b7" opacity=".9"/>
      <rect x="148" y="170" width="470" height="32" rx="16" fill="#1d2935"/>
      <rect x="148" y="244" width="708" height="18" rx="9" fill="#8b99a8"/>
      <rect x="148" y="284" width="610" height="18" rx="9" fill="#b4bec9"/>
      <path d="M146 742 C260 610 338 596 450 702 C560 808 656 456 878 742 L878 860 L146 860 Z" fill="#253241"/>
      <path d="M146 776 C300 654 390 682 498 762 C620 852 704 620 878 770 L878 860 L146 860 Z" fill="#56c2b7" opacity=".82"/>
      <text x="148" y="414" font-family="Arial, sans-serif" font-size="46" font-weight="700" fill="#1d2935">${safeTitle}</text>
      <text x="148" y="478" font-family="Arial, sans-serif" font-size="26" fill="#5c6a78">${safePrompt}</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
