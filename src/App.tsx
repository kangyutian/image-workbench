import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCcw,
  Scissors,
  Trash2,
  UploadCloud,
  Wand2,
  Video,
  X,
} from "lucide-react";
import { cancelVideoTask, createVideoTask, loadVideoTasks, retryVideoTask, uploadVideoMedia, type VideoMedia, type VideoModelId, type VideoTask } from "./lib/videoApi";
import { createCutoutTask, loadCutoutTasks, type CutoutBackgroundMode, type CutoutTask } from "./lib/cutoutApi";
import { createProductSuite, loadProductSuites, productSuiteZipUrl, recoverProductSuiteBackground as recoverProductSuiteBackgroundApi, retryProductSuiteItem, updateProductSuitePrompts } from "./lib/productSuiteApi";
import type { ProductSuite, ProductSuiteAgeRange, ProductSuiteBodyType, ProductSuiteGender, ProductSuiteHairStyle, ProductSuiteMedia, ProductSuiteSkinTone, ProductSuiteSlot } from "./productSuiteTypes";
import { maxVideoReferenceImages, orderedVideoReferences, supportsVideoEndFrame } from "../shared/videoFramePolicy";
import { createLatestRequestGuard, type LatestRequestGuard } from "../shared/latestRequestGuard";
import {
  estimateCost,
  formatUsd,
  generateImage,
  imageModelsForProvider,
  importImageFromUrl,
  nanoModelInfo,
  nanoModels,
  priceNoteFor,
  providerLabels,
  qualityLabels,
  qualityUseCases,
  resolutionLabels,
  supportsQuality,
} from "./lib/imageApi";
import type {
  GeneratedImage,
  GenerationMode,
  NanoModelId,
  ProviderId,
  Quality,
  Resolution,
  TaskPreset,
  UploadedImage,
} from "./types";

const MAX_TASKS = 10;
const CONCURRENCY = 3;
const DEFAULT_NANO_MODEL: NanoModelId = "nano-banana-2-fast";
const DEFAULT_GROK_MODEL: NanoModelId = "grok-2-image";
const DEFAULT_KLING_MODEL: NanoModelId = "kling-image-v3-edit";
const PRINT_EXTRACTION_PROMPT =
  "请从参考服装图片中提取衣服正中央的印花图案，只保留印花本身，不要保留衣服、褶皱、布料纹理、模特、背景、阴影和拍摄光线。请尽量还原印花的线条、颜色、文字、卡通形象和图形细节。输出为居中构图的高清 2K 图案素材，优先透明背景；如果无法透明背景，请使用纯白背景。不要重新设计，不要改变图案内容，不要添加额外元素。";

const productSuiteSlots: Array<{ slot: ProductSuiteSlot; label: string; eyebrow: string; template: string }> = [
  { slot: "product-3d", label: "产品 3D 展示图", eyebrow: "01 · Product 3D", template: "完整保留商品主体，生成真实立体透视、自然光影和高级电商展示效果。" },
  { slot: "model-front", label: "欧美模特正面上身图", eyebrow: "02 · Model Front", template: "欧美模特正面站姿上身展示商品，完整展示商品版型、颜色、材质和穿着效果。" },
  { slot: "model-angle", label: "欧美模特角度上身图", eyebrow: "03 · Model Angle", template: "同一位欧美模特以三分之二角度或自然侧身姿态展示商品，突出轮廓、剪裁和版型。" },
  { slot: "model-back", label: "欧美模特背面上身展示图", eyebrow: "04 · Model Back", template: "同一位欧美模特背对镜头展示商品背面，完整展示后背结构、肩带、扣位、轮廓和版型。" },
  { slot: "product-detail", label: "产品细节特写图", eyebrow: "05 · Product Detail", template: "商品局部高清细节特写，展示材质、纹理、缝线、工艺或功能细节。" },
];

const productSuiteGenderLabels: Record<ProductSuiteGender, string> = { female: "女性", male: "男性" };
const productSuiteBodyLabels: Record<ProductSuiteBodyType, string> = { slim: "纤细偏瘦", balanced: "健康匀称", athletic: "运动型", muscular: "肌肉型", plus: "丰润偏胖", curvy: "丰满曲线", hourglass: "沙漏曲线" };
const productSuiteAgeLabels: Record<ProductSuiteAgeRange, string> = { "18-24": "18–24岁（成年）", "25-35": "25–35岁", "36-45": "36–45岁", "46-55": "46–55岁", "56-plus": "56岁以上" };
const productSuiteHairLabels: Record<ProductSuiteHairStyle, string> = { "natural-loose": "蓬松自然披发", "long-straight": "长发直发披肩", "long-wavy": "长发自然卷", "low-ponytail": "低马尾", "high-ponytail": "高马尾", short: "短发", bob: "中短波波头" };
const productSuiteSkinLabels: Record<ProductSuiteSkinTone, string> = { natural: "自然真实肤色", fair: "自然浅肤色", medium: "自然中等肤色", tan: "自然小麦肤色", deep: "自然深肤色" };

const modeLabels: Record<GenerationMode, string> = {
  "text-to-image": "文生图",
  "image-to-image": "图生图",
  "multi-image-fusion": "多图融合",
};

const aspectOptions = [
  { value: "1:1", label: "1:1 方图" },
  { value: "4:3", label: "4:3 横图" },
  { value: "3:4", label: "3:4 竖图" },
  { value: "16:9", label: "16:9 宽屏" },
  { value: "9:16", label: "9:16 竖屏" },
];

const image2AspectOptions = [
  { value: "1:1", label: "1:1 方图" },
  { value: "1:2", label: "1:2 超长竖图" },
  { value: "2:1", label: "2:1 超宽横图" },
  { value: "1:3", label: "1:3 极长竖图" },
  { value: "3:1", label: "3:1 极宽横图" },
  { value: "2:3", label: "2:3 竖图" },
  { value: "3:2", label: "3:2 横图" },
  { value: "3:4", label: "3:4 竖图" },
  { value: "4:3", label: "4:3 横图" },
  { value: "4:5", label: "4:5 竖图" },
  { value: "5:4", label: "5:4 横图" },
  { value: "9:16", label: "9:16 竖屏" },
  { value: "16:9", label: "16:9 宽屏" },
  { value: "9:21", label: "9:21 超长竖屏" },
  { value: "21:9", label: "21:9 超宽屏" },
];

const editMultiAspectOptions = [
  { value: "4:3", label: "4:3 横图" },
  { value: "3:4", label: "3:4 竖图" },
];

const grokQualityAspectOptions = [
  { value: "1:1", label: "1:1 方图" },
  { value: "16:9", label: "16:9 宽屏" },
  { value: "9:16", label: "9:16 竖屏" },
  { value: "4:3", label: "4:3 横图" },
  { value: "3:4", label: "3:4 竖图" },
  { value: "3:2", label: "3:2 横图" },
  { value: "2:3", label: "2:3 竖图" },
];

const resolutionOptions = [
  { value: "1k" as Resolution, label: "1K" },
  { value: "2k" as Resolution, label: "2K" },
  { value: "4k" as Resolution, label: "4K" },
];

const videoModelLabels: Record<VideoModelId, string> = {
  "seedance-2-mini-image-to-video": "Seedance 2.0 Mini",
  "seedance-2-fast-image-to-video": "Seedance 2.0 Fast",
  "seedance-2-image-to-video": "Seedance 2.0",
  "kling-3-std-image-to-video": "Kling 3.0 Standard",
  "kling-3-pro-image-to-video": "Kling 3.0 Pro",
  "kling-3-std-motion-control": "Kling 3.0 Standard 动作控制",
  "grok-imagine-video-v1.5-image-to-video": "Grok Imagine Video v1.5",
};

function isMotionControlVideo(model: VideoModelId) {
  return model === "kling-3-std-motion-control";
}

function isKlingImageToVideo(model: VideoModelId) {
  return model === "kling-3-std-image-to-video" || model === "kling-3-pro-image-to-video";
}

function videoNeedsPrompt(model: VideoModelId) {
  return !isKlingImageToVideo(model) && !isMotionControlVideo(model);
}

function videoDurationOptions(model: VideoModelId) {
  if (model === "grok-imagine-video-v1.5-image-to-video") return Array.from({ length: 15 }, (_, index) => index + 1);
  if (isKlingImageToVideo(model)) return [3, 5, 10, 15];
  return [4, 5, 6, 8, 10, 12, 15];
}

function videoSupportsAspectRatio(model: VideoModelId) {
  return model.startsWith("seedance-");
}

function videoResolutionOptions(model: VideoModelId) {
  if (model === "grok-imagine-video-v1.5-image-to-video") return ["480p", "720p"];
  if (model === "seedance-2-image-to-video") return ["720p"];
  if (model === "seedance-2-fast-image-to-video") return ["480p", "720p", "1080p"];
  if (model === "seedance-2-mini-image-to-video") return ["480p", "720p", "1080p", "4k"];
  return [];
}

function videoSupportsAudio(model: VideoModelId) {
  return model.startsWith("seedance-");
}

type TaskStatus = "idle" | "running" | "done" | "error";

interface ImageTask {
  id: string;
  provider: ProviderId;
  nanoModel: NanoModelId;
  prompt: string;
  images: UploadedImage[];
  aspectRatio: string;
  count: number;
  resolution: Resolution;
  quality: Quality;
  status: TaskStatus;
  results: GeneratedImage[];
  error: string;
  preset?: TaskPreset;
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function createTask(
  provider: ProviderId,
  prompt = "",
  settings: Pick<ImageTask, "nanoModel" | "aspectRatio" | "count" | "resolution" | "quality"> = {
    nanoModel: DEFAULT_NANO_MODEL,
    aspectRatio: "9:16",
    count: 1,
    resolution: "2k",
    quality: "medium",
  },
): ImageTask {
  return {
    id: createId(),
    provider,
    prompt,
    images: [],
    ...settings,
    status: "idle",
    results: [],
    error: "",
  };
}

function resolveMode(imageCount: number): GenerationMode {
  if (imageCount === 0) return "text-to-image";
  if (imageCount === 1) return "image-to-image";
  return "multi-image-fusion";
}

function isEditMulti(provider: ProviderId, nanoModel: NanoModelId) {
  return isNanoEditMulti(provider, nanoModel) || isKlingMultiEdit(provider, nanoModel);
}

function isNanoEditMulti(provider: ProviderId, nanoModel: NanoModelId) {
  return provider === "nanobanana" && nanoModel === "nano-banana-pro-edit-multi";
}

function isKlingMultiEdit(provider: ProviderId, nanoModel: NanoModelId) {
  return provider === "kling" && nanoModel === "kling-image-o3-edit";
}

function isGrokEdit(provider: ProviderId, nanoModel: NanoModelId) {
  return provider === "grok" && nanoModel === "grok-imagine-image-edit";
}

function isGrokQuality(provider: ProviderId, nanoModel: NanoModelId) {
  return provider === "grok" && nanoModel === "grok-imagine-image-quality";
}

function isKlingSingleEdit(provider: ProviderId, nanoModel: NanoModelId) {
  return provider === "kling" && nanoModel === "kling-image-v3-edit";
}

function isKlingImageModel(provider: ProviderId) {
  return provider === "kling";
}

function supportsReferenceImages(provider: ProviderId, nanoModel: NanoModelId) {
  return provider !== "grok" || isGrokEdit(provider, nanoModel) || isKlingImageModel(provider);
}

function defaultModelForProvider(provider: ProviderId, current: NanoModelId) {
  if (provider === "grok") return current.startsWith("grok-") ? current : DEFAULT_GROK_MODEL;
  if (provider === "kling") return current.startsWith("kling-") ? current : DEFAULT_KLING_MODEL;
  return current.startsWith("grok-") || current.startsWith("kling-") ? DEFAULT_NANO_MODEL : current;
}

function aspectOptionsFor(provider: ProviderId, nanoModel: NanoModelId) {
  if (isGrokQuality(provider, nanoModel)) return grokQualityAspectOptions;
  if (provider === "grok") return [];
  if (provider === "image2") return image2AspectOptions;
  return isNanoEditMulti(provider, nanoModel) ? editMultiAspectOptions : aspectOptions;
}

function resolutionOptionsFor(provider: ProviderId, nanoModel: NanoModelId) {
  if (isGrokQuality(provider, nanoModel)) return resolutionOptions.filter((item) => item.value !== "4k");
  if (provider === "grok") return [];
  if (provider === "kling") {
    return nanoModel === "kling-image-o3-edit" ? resolutionOptions : resolutionOptions.filter((item) => item.value !== "4k");
  }
  if (isNanoEditMulti(provider, nanoModel)) {
    return [];
  }
  if (provider === "nanobanana" && nanoModel === "nano-banana-2-fast") {
    return resolutionOptions.filter((item) => item.value !== "1k");
  }
  return resolutionOptions;
}

function normalizeAspect(provider: ProviderId, nanoModel: NanoModelId, value: string) {
  const options = aspectOptionsFor(provider, nanoModel);
  if (options.length === 0) return value;
  return options.some((item) => item.value === value) ? value : options[0].value;
}

function normalizeResolution(provider: ProviderId, nanoModel: NanoModelId, value: Resolution) {
  const options = resolutionOptionsFor(provider, nanoModel);
  if (options.length === 0) return value;
  return options.some((item) => item.value === value) ? value : options[0].value;
}

function normalizeCount(provider: ProviderId, nanoModel: NanoModelId, value: number) {
  if (isNanoEditMulti(provider, nanoModel)) return 2;
  if (isGrokEdit(provider, nanoModel)) return 1;
  if (isKlingSingleEdit(provider, nanoModel)) return clampNumber(value, 1, 9);
  if (isKlingImageModel(provider)) return clampNumber(value, 1, 9);
  if (provider === "grok") return clampNumber(value, 1, 4);
  return clampNumber(value, 1, 8);
}

function draftCount(provider: ProviderId, nanoModel: NanoModelId, rawValue: string, fallback: number) {
  if (isNanoEditMulti(provider, nanoModel)) return 2;
  if (isGrokEdit(provider, nanoModel)) return 1;
  if (rawValue.trim() === "") return 0;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function statusLabel(status: TaskStatus) {
  if (status === "running") return "生成中";
  if (status === "done") return "已完成";
  if (status === "error") return "失败";
  return "待生成";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function readImages(fileList: FileList | File[]) {
  const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  return Promise.all(
    files.map(
      (file) =>
        new Promise<UploadedImage>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              id: createId(),
              fileName: file.name,
              dataUrl: String(reader.result),
              mimeType: file.type,
              size: file.size,
            });
          reader.onerror = () => reject(new Error(`无法读取图片：${file.name}`));
          reader.readAsDataURL(file);
        }),
    ),
  );
}

function readMedia(file: File): Promise<VideoMedia> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: createId(), fileName: file.name, dataUrl: String(reader.result), mimeType: file.type, size: file.size });
    reader.onerror = () => reject(new Error(`无法读取文件：${file.name}`));
    reader.readAsDataURL(file);
  });
}

interface VideoDraft {
  id: string;
  modelId: VideoModelId;
  prompt: string;
  startImage: VideoMedia | null;
  endImage: VideoMedia | null;
  motionVideo: VideoMedia | null;
  status: "idle" | "submitting";
  error: string;
}

function createVideoDraft(): VideoDraft {
  return { id: createId(), modelId: "seedance-2-mini-image-to-video", prompt: "", startImage: null, endImage: null, motionVideo: null, status: "idle", error: "" };
}

function App() {
  const [provider, setProvider] = useState<ProviderId>("image2");
  const [nanoModel, setNanoModel] = useState<NanoModelId>(DEFAULT_NANO_MODEL);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [count, setCount] = useState(1);
  const [resolution, setResolution] = useState<Resolution>("2k");
  const [quality, setQuality] = useState<Quality>("medium");
  const [tasks, setTasks] = useState<ImageTask[]>([]);
  const [creationKind, setCreationKind] = useState<"image" | "video" | "cutout" | "print" | "suite">("image");
  const [cutoutTasks, setCutoutTasks] = useState<CutoutTask[]>([]);
  const [cutoutImage, setCutoutImage] = useState<UploadedImage | null>(null);
  const [cutoutPrompt, setCutoutPrompt] = useState("main product");
  const [cutoutBackground, setCutoutBackground] = useState<CutoutBackgroundMode>("transparent");
  const [cutoutAutocrop, setCutoutAutocrop] = useState(true);
  const [cutoutEdgeRefinement, setCutoutEdgeRefinement] = useState(true);
  const [cutoutError, setCutoutError] = useState("");
  const [isCreatingCutout, setIsCreatingCutout] = useState(false);
  const [videoTasks, setVideoTasks] = useState<VideoTask[]>([]);
  const [videoDrafts, setVideoDrafts] = useState<VideoDraft[]>([createVideoDraft()]);
  const [videoModel, setVideoModel] = useState<VideoModelId>("seedance-2-mini-image-to-video");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoStartImage, setVideoStartImage] = useState<VideoMedia | null>(null);
  const [videoEndImage, setVideoEndImage] = useState<VideoMedia | null>(null);
  const [motionVideo, setMotionVideo] = useState<VideoMedia | null>(null);
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoAspectRatio, setVideoAspectRatio] = useState("9:16");
  const [videoResolution, setVideoResolution] = useState("720p");
  const [videoAudio, setVideoAudio] = useState(true);
  const [videoOrientation, setVideoOrientation] = useState<"image" | "video">("image");
  const [keepOriginalSound, setKeepOriginalSound] = useState(true);
  const [videoError, setVideoError] = useState("");
  const [isCreatingVideo, setIsCreatingVideo] = useState(false);
  const [taskFilter, setTaskFilter] = useState<"all" | "image" | "video">("all");
  const [bulkPrompt, setBulkPrompt] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [printImageUrl, setPrintImageUrl] = useState("");
  const [printError, setPrintError] = useState("");
  const [isImportingPrint, setIsImportingPrint] = useState(false);
  const [productSuites, setProductSuites] = useState<ProductSuite[]>([]);
  const [suiteImage, setSuiteImage] = useState<ProductSuiteMedia | null>(null);
  const [suiteBackground, setSuiteBackground] = useState<ProductSuiteMedia | null>(null);
  const [suiteModel, setSuiteModel] = useState<"kling" | "nanobanana">("kling");
  const [suiteGender, setSuiteGender] = useState<ProductSuiteGender>("female");
  const [suiteBodyType, setSuiteBodyType] = useState<ProductSuiteBodyType>("balanced");
  const [suiteAgeRange, setSuiteAgeRange] = useState<ProductSuiteAgeRange>("25-35");
  const [suiteHairStyle, setSuiteHairStyle] = useState<ProductSuiteHairStyle>("natural-loose");
  const [suiteSkinTone, setSuiteSkinTone] = useState<ProductSuiteSkinTone>("natural");
  const [suiteBackgroundMode, setSuiteBackgroundMode] = useState<"white" | "custom">("white");
  const [suiteProductName, setSuiteProductName] = useState("");
  const [suiteSellingPoints, setSuiteSellingPoints] = useState("");
  const [suiteError, setSuiteError] = useState("");
  const [suiteSubmitting, setSuiteSubmitting] = useState(false);
  const [suiteRecoveringId, setSuiteRecoveringId] = useState("");
  const suiteImageInputRef = useRef<HTMLInputElement | null>(null);
  const suiteBackgroundInputRef = useRef<HTMLInputElement | null>(null);
  const suiteRecoveryInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [isDraggingTask, setIsDraggingTask] = useState("");
  const bulkPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const printFileInputRef = useRef<HTMLInputElement | null>(null);
  const videoStartImageInputRef = useRef<HTMLInputElement | null>(null);
  const videoEndImageInputRef = useRef<HTMLInputElement | null>(null);
  const cutoutFileInputRef = useRef<HTMLInputElement | null>(null);
  const motionVideoInputRef = useRef<HTMLInputElement | null>(null);
  const videoDraftInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const videoStartImageReadGuardRef = useRef(createLatestRequestGuard());
  const videoEndImageReadGuardRef = useRef(createLatestRequestGuard());

  const isAnyRunning = tasks.some((task) => task.status === "running");
  const activeImageCount = tasks.filter((task) => task.status === "running").length;
  const activeVideoCount = videoTasks.filter((task) => task.status === "queued" || task.status === "running" || task.status === "cancel_requested").length;
  const videoAllowsEndFrame = maxVideoReferenceImages(videoModel) === 2;
  const resultCount = tasks.reduce((sum, task) => sum + task.results.length, 0);
  const remainingSlots = Math.max(0, MAX_TASKS - tasks.length);
  const currentAspectOptions = aspectOptionsFor(provider, nanoModel);
  const currentResolutionOptions = resolutionOptionsFor(provider, nanoModel);
  const batchEstimate = estimateCost({
    provider,
    nanoModel,
    images: [],
    quality,
    resolution,
    count: Math.max(1, tasks.length || 1) * count,
  });

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      try {
        const next = await loadVideoTasks();
        if (mounted) setVideoTasks(next);
      } catch {
        // The workbench remains usable if a transient task refresh fails.
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      try {
        const next = await loadProductSuites();
        if (mounted) setProductSuites(next);
      } catch {
        // Keep the suite form usable if the task refresh is temporarily unavailable.
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      try {
        const next = await loadCutoutTasks();
        if (mounted) setCutoutTasks(next);
      } catch {
        // Keep the creation form usable during a transient refresh failure.
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  function updateVideoTask(next: VideoTask) {
    setVideoTasks((current) => [next, ...current.filter((task) => task.id !== next.id)]);
  }

  function updateVideoDraft(id: string, next: Partial<VideoDraft>) {
    setVideoDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...next } : draft));
  }

  async function readSuiteFile(file: File): Promise<ProductSuiteMedia> {
    const [image] = await readImages([file]);
    if (!image) throw new Error("图片读取失败。");
    return image;
  }

  async function submitProductSuite() {
    if (!suiteImage) { setSuiteError("请先上传商品图片。"); return; }
    if (suiteBackgroundMode === "custom" && !suiteBackground) { setSuiteError("请选择一张自定义背景图片。"); return; }
    setSuiteSubmitting(true);
    setSuiteError("");
    try {
      const suite = await createProductSuite({
        images: [suiteImage],
        ...(suiteBackground ? { backgroundImages: [suiteBackground] } : {}),
        model: suiteModel,
        gender: suiteGender,
        bodyType: suiteBodyType,
        ageRange: suiteAgeRange,
        hairStyle: suiteHairStyle,
        skinTone: suiteSkinTone,
        backgroundMode: suiteBackgroundMode,
        productName: suiteProductName,
        sellingPoints: suiteSellingPoints,
        prompts: {},
      });
      setProductSuites((current) => [suite, ...current.filter((item) => item.id !== suite.id)]);
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    } catch (error) {
      setSuiteError(error instanceof Error ? error.message : "商品套图任务创建失败。");
    } finally {
      setSuiteSubmitting(false);
    }
  }

  async function retryProductSuiteSlot(suiteId: string, slot: ProductSuiteSlot) {
    try {
      const next = await retryProductSuiteItem(suiteId, slot);
      setProductSuites((current) => [next, ...current.filter((item) => item.id !== next.id)]);
    } catch (error) {
      setSuiteError(error instanceof Error ? error.message : "单张图片重试失败。");
    }
  }

  async function recoverProductSuiteBackground(suiteId: string, file: File) {
    setSuiteRecoveringId(suiteId);
    setSuiteError("");
    try {
      const background = await readSuiteFile(file);
      const next = await recoverProductSuiteBackgroundApi(suiteId, background);
      setProductSuites((current) => [next, ...current.filter((item) => item.id !== next.id)]);
    } catch (error) {
      setSuiteError(error instanceof Error ? error.message : "背景补传失败。");
    } finally {
      setSuiteRecoveringId("");
    }
  }

  async function saveProductSuitePrompt(suiteId: string, slot: ProductSuiteSlot, prompt: string) {
    try {
      const next = await updateProductSuitePrompts(suiteId, { [slot]: prompt });
      setProductSuites((current) => current.map((item) => item.id === next.id ? next : item));
    } catch (error) {
      setSuiteError(error instanceof Error ? error.message : "文案保存失败。");
    }
  }

  function addVideoDraft() {
    if (videoDrafts.length >= MAX_TASKS) return;
    setVideoDrafts((current) => [...current, createVideoDraft()]);
  }

  function removeVideoDraft(id: string) {
    setVideoDrafts((current) => current.length === 1 ? current : current.filter((draft) => draft.id !== id));
  }

  async function submitVideoDraft(draft: VideoDraft) {
    if (!draft.startImage) { updateVideoDraft(draft.id, { error: "请先上传首帧图片。" }); return; }
    if (videoNeedsPrompt(draft.modelId) && !draft.prompt.trim()) { updateVideoDraft(draft.id, { error: "请先输入运动提示词。" }); return; }
    if (draft.endImage && !supportsVideoEndFrame(draft.modelId)) { updateVideoDraft(draft.id, { error: "当前模型不支持尾帧图片。" }); return; }
    if (isMotionControlVideo(draft.modelId) && !draft.motionVideo) { updateVideoDraft(draft.id, { error: "动作控制模型需要上传动作参考视频。" }); return; }
    updateVideoDraft(draft.id, { status: "submitting", error: "" });
    try {
      const [startUrl, endUrl] = await Promise.all([
        uploadVideoMedia(draft.startImage, "image", draft.modelId),
        draft.endImage ? uploadVideoMedia(draft.endImage, "image", draft.modelId) : Promise.resolve(""),
      ]);
      const motionUrl = draft.motionVideo ? await uploadVideoMedia(draft.motionVideo, "video", draft.modelId) : undefined;
      const referenceImages = orderedVideoReferences(startUrl, endUrl, draft.modelId).map((item, index) => ({ ...item, fileName: index === 0 ? draft.startImage?.fileName : draft.endImage?.fileName }));
      const task = await createVideoTask({ modelId: draft.modelId, prompt: draft.prompt, referenceImages, ...(motionUrl ? { motionVideo: { url: motionUrl, fileName: draft.motionVideo?.fileName }, characterOrientation: "image", keepOriginalSound: true } : {}), duration: 5, ...(draft.modelId.startsWith("seedance-") ? { aspectRatio: "9:16", resolution: draft.modelId === "seedance-2-mini-image-to-video" ? "720p" : "480p", generateAudio: true } : {}) });
      updateVideoTask(task);
      updateVideoDraft(draft.id, { status: "idle", prompt: "", startImage: null, endImage: null, motionVideo: null, error: "" });
    } catch (cause) {
      updateVideoDraft(draft.id, { status: "idle", error: cause instanceof Error ? cause.message : "视频任务创建失败。" });
    }
  }

  async function submitCutoutTask() {
    if (!cutoutImage) { setCutoutError("请先上传产品图片。"); return; }
    setIsCreatingCutout(true);
    setCutoutError("");
    try {
      const task = await createCutoutTask({
        mode: "product-cutout",
        prompt: cutoutPrompt.trim() || "main product",
        backgroundMode: cutoutBackground,
        autocrop: cutoutAutocrop,
        forceBackgroundRemoval: cutoutEdgeRefinement,
      }, cutoutImage);
      setCutoutTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
      setCutoutImage(null);
    } catch (cause) {
      setCutoutError(cause instanceof Error ? cause.message : "抠图任务创建失败。");
    } finally {
      setIsCreatingCutout(false);
    }
  }

  function readVideoImage(file: File, guard: LatestRequestGuard, setImage: (media: VideoMedia) => void) {
    const token = guard.begin();
    void readMedia(file)
      .then((media) => {
        if (guard.isCurrent(token)) setImage(media);
      })
      .catch(() => {
        if (guard.isCurrent(token)) setVideoError("图片读取失败。");
      });
  }

  async function submitVideoTask() {
    if (!videoStartImage) { setVideoError("请先上传参考图。"); return; }
    if (videoNeedsPrompt(videoModel) && !videoPrompt.trim()) { setVideoError("请先输入运动提示词。"); return; }
    if (isMotionControlVideo(videoModel) && !motionVideo) { setVideoError("请上传动作参考视频。"); return; }
    setIsCreatingVideo(true); setVideoError("");
    try {
      const [startUrl, endUrl] = await Promise.all([
        uploadVideoMedia(videoStartImage, "image", videoModel),
        videoEndImage ? uploadVideoMedia(videoEndImage, "image", videoModel) : Promise.resolve(""),
      ]);
      const motionUrl = motionVideo ? await uploadVideoMedia(motionVideo, "video", videoModel) : undefined;
      const isMotion = isMotionControlVideo(videoModel);
      const referenceImages = orderedVideoReferences(startUrl, endUrl, videoModel).map((item, index) => ({
        ...item,
        fileName: index === 0 ? videoStartImage.fileName : videoEndImage?.fileName,
      }));
      const task = await createVideoTask({
        modelId: videoModel,
        prompt: videoPrompt,
        referenceImages,
        ...(motionUrl ? { motionVideo: { url: motionUrl, fileName: motionVideo?.fileName } } : {}),
        ...(isMotion ? { characterOrientation: videoOrientation, keepOriginalSound } : isKlingImageToVideo(videoModel) ? { duration: videoDuration } : videoModel === "grok-imagine-video-v1.5-image-to-video" ? { duration: videoDuration, resolution: videoResolution } : { duration: videoDuration, aspectRatio: videoAspectRatio, resolution: videoResolution, generateAudio: videoAudio }),
      });
      updateVideoTask(task);
      setVideoPrompt("");
    } catch (cause) { setVideoError(cause instanceof Error ? cause.message : "视频任务创建失败。"); }
    finally { setIsCreatingVideo(false); }
  }

  function useImageForVideo(image: GeneratedImage) {
    videoStartImageReadGuardRef.current.cancel();
    setVideoStartImage({ id: createId(), fileName: "generated-input.png", dataUrl: image.url, mimeType: "image/png" });
    setCreationKind("video"); setTaskFilter("all"); setVideoError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateTask(taskId: string, next: Partial<ImageTask>) {
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, ...next } : task)));
  }

  function changeBatchProvider(nextProvider: ProviderId) {
    const nextModel = defaultModelForProvider(nextProvider, nanoModel);
    setProvider(nextProvider);
    setNanoModel(nextModel);
    setAspectRatio((current) => normalizeAspect(nextProvider, nextModel, current));
    setResolution((current) => normalizeResolution(nextProvider, nextModel, current));
    setCount((current) => normalizeCount(nextProvider, nextModel, current));
  }

  function changeBatchNanoModel(nextNanoModel: NanoModelId) {
    setNanoModel(nextNanoModel);
    setAspectRatio((current) => normalizeAspect(provider, nextNanoModel, current));
    setResolution((current) => normalizeResolution(provider, nextNanoModel, current));
    setCount((current) => normalizeCount(provider, nextNanoModel, current));
  }

  function addTask() {
    if (remainingSlots <= 0) {
      setBulkError(`最多只能添加 ${MAX_TASKS} 个任务。`);
      return;
    }
    setTasks((current) => [
      ...current,
      createTask(provider, "", {
        nanoModel,
        aspectRatio,
        count,
        resolution,
        quality,
      }),
    ]);
    setBulkError("");
  }

  function applyBulkToTasks() {
    const prompt = (bulkPromptRef.current?.value ?? bulkPrompt).trim();
    setBulkPrompt(prompt);
    if (!prompt) {
      setBulkError("请输入批量提示词。");
      return;
    }
    if (tasks.length === 0) {
      setBulkError("请先点击“添加任务”，再用“批量添加”同步文案和参数。");
      return;
    }

    setTasks((current) =>
      current.map((task) =>
        task.status === "running"
          ? task
          : {
              ...task,
              provider,
              nanoModel,
              prompt,
              aspectRatio,
              count,
              resolution,
              quality,
              preset: undefined,
              status: "idle",
              results: [],
              error: "",
            },
      ),
    );
    setBulkError("");
  }

  function applyGlobalSettingsToTasks() {
    setTasks((current) => current.map((task) => task.status === "running" ? task : {
      ...task,
      provider,
      nanoModel,
      aspectRatio,
      count,
      resolution,
      quality,
      status: "idle",
      results: [],
      error: "",
    }));
    setBulkError("");
  }

  function changeBatchAspectRatio(nextAspectRatio: string) {
    setAspectRatio(nextAspectRatio);
    setTasks((current) => current.map((task) => task.status === "running" ? task : {
      ...task,
      aspectRatio: normalizeAspect(task.provider, task.nanoModel, nextAspectRatio),
      status: "idle",
      results: [],
      error: "",
    }));
    setBulkError("");
  }

  function applyVideoGlobalSettings() {
    setVideoDrafts((current) => current.map((draft) => ({
      ...draft,
      modelId: videoModel,
      endImage: supportsVideoEndFrame(videoModel) ? draft.endImage : null,
      error: "",
    })));
  }

  function removeTask(taskId: string) {
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setBulkError("");
  }

  function clearAllTasks() {
    setTasks([]);
    setBulkError("");
  }

  function clearCompletedResults() {
    setTasks((current) =>
      current.map((task) =>
        task.status === "done" || task.status === "error"
          ? { ...task, results: [], error: "", status: "idle" }
          : task,
      ),
    );
  }

  function createPrintExtractionTask(image: UploadedImage) {
    const task = createTask("nanobanana", PRINT_EXTRACTION_PROMPT, {
      nanoModel: DEFAULT_NANO_MODEL,
      aspectRatio: "1:1",
      count: 1,
      resolution: "2k",
      quality: "medium",
    });
    task.images = [image];
    task.preset = "print-extraction";
    return task;
  }

  function addPrintExtractionTasks(images: UploadedImage[]) {
    if (images.length === 0) {
      setPrintError("请先上传服装图片，或填写可公开访问的图片链接。");
      return;
    }

    if (remainingSlots <= 0) {
      setPrintError(`最多 ${MAX_TASKS} 个任务，请先删除一些任务后再添加。`);
      return;
    }

    const accepted = images.slice(0, remainingSlots);
    setTasks((current) => [...current, ...accepted.map(createPrintExtractionTask)]);
    setPrintError(images.length > accepted.length ? `已添加 ${accepted.length} 个任务；最多 ${MAX_TASKS} 个任务，剩余图片未添加。` : "");
  }

  async function createPrintTasksFromFiles(fileList: FileList | File[]) {
    try {
      const loaded = await readImages(fileList);
      addPrintExtractionTasks(loaded);
    } catch {
      setPrintError("图片读取失败，请换一张图片再试。");
    }
  }

  async function createPrintTaskFromUrl() {
    const url = printImageUrl.trim();
    if (!url) {
      setPrintError("请先填写服装图片链接。");
      return;
    }

    setIsImportingPrint(true);
    setPrintError("");
    try {
      const image = await importImageFromUrl(url);
      addPrintExtractionTasks([image]);
      setPrintImageUrl("");
    } catch (cause) {
      setPrintError(cause instanceof Error ? cause.message : "图片链接无法读取，请换成本地上传或检查链接是否可公开访问。");
    } finally {
      setIsImportingPrint(false);
    }
  }

  async function addFiles(taskId: string, fileList: FileList | File[]) {
    const loaded = await readImages(fileList);
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              images: isGrokEdit(task.provider, task.nanoModel) || isKlingSingleEdit(task.provider, task.nanoModel)
                ? [...task.images, ...loaded].slice(0, 1)
                : [...task.images, ...loaded].slice(0, task.provider === "kling" ? 10 : undefined),
              error: "",
            }
          : task,
      ),
    );
  }

  function moveImage(taskId: string, index: number, direction: -1 | 1) {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) return task;
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= task.images.length) return task;
        const images = [...task.images];
        const [item] = images.splice(index, 1);
        images.splice(nextIndex, 0, item);
        return { ...task, images };
      }),
    );
  }

  function removeImage(taskId: string, imageId: string) {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, images: task.images.filter((image) => image.id !== imageId) } : task,
      ),
    );
  }

  async function runTask(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    if (!task.prompt.trim()) {
      updateTask(taskId, { error: "请先输入提示词。", status: "error" });
      return;
    }
    if (task.provider === "nanobanana" && task.nanoModel === "nano-banana-pro-edit-multi" && task.images.length === 0) {
      updateTask(taskId, { error: "Nano Banana Pro Edit Multi 需要先上传参考图。", status: "error" });
      return;
    }
    if (isGrokEdit(task.provider, task.nanoModel) && task.images.length !== 1) {
      updateTask(taskId, { error: "Grok Imagine Image Edit 需要恰好一张参考图。", status: "error" });
      return;
    }
    if (isKlingSingleEdit(task.provider, task.nanoModel) && task.images.length !== 1) {
      updateTask(taskId, { error: "Kling Image V3 Edit 只支持 1 张参考图。", status: "error" });
      return;
    }
    if (task.provider === "kling" && task.nanoModel === "kling-image-o3-edit" && task.images.length === 0) {
      updateTask(taskId, { error: "Kling Image O3 Edit 至少需要 1 张参考图。", status: "error" });
      return;
    }
    if (task.provider === "grok" && !isGrokEdit(task.provider, task.nanoModel) && task.images.length > 0) {
      updateTask(taskId, { error: "该 Grok 模型仅支持文生图，请先移除参考图。", status: "error" });
      return;
    }

    updateTask(taskId, { status: "running", error: "", results: [] });
    try {
      const generated = await generateImage({
        provider: task.provider,
        nanoModel: task.nanoModel,
        prompt: task.prompt,
        images: task.images,
        aspectRatio: task.aspectRatio,
        count: task.count,
        resolution: task.resolution,
        quality: task.quality,
      });

      updateTask(taskId, { status: "done", results: generated, error: "" });
    } catch (cause) {
      updateTask(taskId, {
        status: "error",
        error: cause instanceof Error ? cause.message : "生成失败，请检查服务器或 WaveSpeedAI 配置。",
      });
    }
  }

  async function runAllTasks() {
    const pending = tasks.filter((task) => task.status !== "running");
    let cursor = 0;

    async function worker() {
      while (cursor < pending.length) {
        const task = pending[cursor];
        cursor += 1;
        await runTask(task.id);
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  }

  async function copyImage(image: GeneratedImage) {
    await navigator.clipboard.writeText(image.url);
  }

  function downloadImage(image: GeneratedImage) {
    const opened = window.open(image.url, "_blank", "noopener,noreferrer");
    if (opened) return;

    const link = document.createElement("a");
    link.href = image.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  }

  function useAsNewTask(image: GeneratedImage) {
    if (tasks.length >= MAX_TASKS) {
      setBulkError(`最多只能添加 ${MAX_TASKS} 个任务。`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const task = createTask(provider, "", {
      nanoModel,
      aspectRatio,
      count,
      resolution,
      quality,
    });
    task.images = [
      {
        id: createId(),
        fileName: "generated-input.png",
        dataUrl: image.url,
        mimeType: "image/png",
      },
    ];
    setTasks((current) => [...current, task]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderPriceSummary(task: ImageTask) {
    const estimate = estimateCost(task);
    return (
      <div className="price-box">
        <strong>预计单张：{formatUsd(estimate.unit)}</strong>
        <span>
          本任务：{formatUsd(estimate.unit)} x {task.count} = {formatUsd(estimate.total)}
        </span>
        <small>{priceNoteFor(task)}</small>
      </div>
    );
  }

  function renderPrintExtractionPanel() {
    return (
      <section className="panel print-create-panel">
        <div className="batch-heading image-batch-command-row">
          <div>
            <p className="eyebrow">Print Extract</p>
            <h2>印花提取</h2>
            <span>从服装图片中提取中央印花，生成居中的高清图案素材。</span>
          </div>
          <span className="print-model-badge">nanobanana · 2K · 1:1</span>
        </div>
        <div className="print-create-grid">
          <div>
            <label className="field">
              <span>服装图片链接</span>
              <input
                value={printImageUrl}
                onChange={(event) => {
                  setPrintImageUrl(event.target.value);
                  setPrintError("");
                }}
                placeholder="粘贴可公开访问的图片链接，例如 https://...jpg"
                type="url"
              />
            </label>
            <div className="print-link-actions">
              <button className="primary" type="button" onClick={() => void createPrintTaskFromUrl()} disabled={isImportingPrint || remainingSlots === 0}>
                {isImportingPrint ? <Loader2 className="spin" size={16} /> : <Scissors size={16} />}
                创建提取任务
              </button>
              <button className="secondary" type="button" onClick={() => printFileInputRef.current?.click()} disabled={remainingSlots === 0}>
                <ImagePlus size={16} />
                上传服装图
              </button>
              <input
                ref={printFileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  if (event.target.files) void createPrintTasksFromFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </div>
            <p className="print-help">支持一次上传多张，每张图片创建一个任务，最多 {MAX_TASKS} 个任务。</p>
            {printError && <div className="inline-error">{printError}</div>}
          </div>
          <div className="print-guidance-card">
            <strong>处理说明</strong>
            <span>自动去除衣服、褶皱、背景和光线，只保留印花内容。</span>
            <span>结果会进入下方图片任务队列，可继续下载或重试。</span>
          </div>
        </div>
      </section>
    );
  }

  function renderProductSuitePanel() {
    return (
      <section className="panel product-suite-panel">
        <div className="batch-heading">
          <div><p className="eyebrow">Product Detail Suite</p><h2>商品详情页主图套图</h2><span>上传一张商品图，自动抠图并生成 5 张统一风格的详情页主图。</span></div>
          <span className="suite-spec-badge">4:5 · 2K · 5 张</span>
        </div>
        <div className="product-suite-form-grid">
          <div className="suite-upload-stack">
            <div className="dropzone suite-upload-zone">
              {suiteImage ? <img className="suite-source-preview" src={suiteImage.dataUrl} alt="商品原图" /> : <><ImagePlus size={30} /><strong>上传商品原图</strong><span>必填，支持 JPG、PNG、WebP</span></>}
              <button className="secondary" type="button" onClick={() => suiteImageInputRef.current?.click()}>{suiteImage ? "替换商品图" : "选择商品图"}</button>
              {suiteImage && <button className="ghost" type="button" onClick={() => setSuiteImage(null)}><Trash2 size={16} />移除</button>}
              <input ref={suiteImageInputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void readSuiteFile(file).then(setSuiteImage).catch((error) => setSuiteError(error.message)); event.currentTarget.value = ""; }} />
            </div>
            <div className="suite-background-card">
              <div className="suite-section-heading"><strong>统一背景</strong><span>默认浅灰偏白色无缝摄影棚背景，也可上传自定义背景</span></div>
              <div className="background-choice" role="radiogroup" aria-label="套图统一背景">
                <button type="button" className={suiteBackgroundMode === "white" ? "selected" : ""} onClick={() => setSuiteBackgroundMode("white")}><span className="white-preview" />浅灰偏白背景</button>
                <button type="button" className={suiteBackgroundMode === "custom" ? "selected" : ""} onClick={() => setSuiteBackgroundMode("custom")}><span className="checker-preview" />自定义背景</button>
              </div>
              {suiteBackground && <div className="suite-background-preview"><img src={suiteBackground.dataUrl} alt="自定义背景" /><button className="ghost" type="button" onClick={() => setSuiteBackground(null)}>移除背景</button></div>}
              <button className="secondary" type="button" onClick={() => suiteBackgroundInputRef.current?.click()}>{suiteBackground ? "替换背景图" : "上传背景图"}</button>
              <input ref={suiteBackgroundInputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void readSuiteFile(file).then(setSuiteBackground).catch((error) => setSuiteError(error.message)); event.currentTarget.value = ""; }} />
            </div>
          </div>
          <div className="suite-options-column">
            <div className="suite-option-grid">
              <label className="field"><span>生成模型</span><select value={suiteModel} onChange={(event) => setSuiteModel(event.target.value as "kling" | "nanobanana")}><option value="kling">Kling Image O3 Edit</option><option value="nanobanana">Nano Banana Pro</option></select></label>
              <label className="field"><span>模特性别</span><select value={suiteGender} onChange={(event) => setSuiteGender(event.target.value as ProductSuiteGender)}>{Object.entries(productSuiteGenderLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field"><span>模特体型</span><select value={suiteBodyType} onChange={(event) => setSuiteBodyType(event.target.value as ProductSuiteBodyType)}>{Object.entries(productSuiteBodyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field"><span>模特年龄</span><select value={suiteAgeRange} onChange={(event) => setSuiteAgeRange(event.target.value as ProductSuiteAgeRange)}>{Object.entries(productSuiteAgeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field"><span>模特发型</span><select value={suiteHairStyle} onChange={(event) => setSuiteHairStyle(event.target.value as ProductSuiteHairStyle)}>{Object.entries(productSuiteHairLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field"><span>模特肤色</span><select value={suiteSkinTone} onChange={(event) => setSuiteSkinTone(event.target.value as ProductSuiteSkinTone)}>{Object.entries(productSuiteSkinLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <label className="field"><span>商品名称</span><input value={suiteProductName} onChange={(event) => setSuiteProductName(event.target.value)} placeholder="例如：羊绒针织开衫" /></label>
            <label className="field"><span>商品卖点 / 材质 / 功能</span><textarea value={suiteSellingPoints} onChange={(event) => setSuiteSellingPoints(event.target.value)} placeholder="例如：柔软羊绒混纺，宽松版型，适合秋冬通勤" rows={3} /></label>
            <div className="suite-submit-row"><div><strong>自动抠图 + 5 张生成</strong><span>三视图共享同一位模特身份，失败后可单独重试。</span></div><button className="primary" type="button" disabled={suiteSubmitting} onClick={() => void submitProductSuite()}>{suiteSubmitting ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}{suiteSubmitting ? "提交中..." : "开始生成套图"}</button></div>
          </div>
        </div>
        {suiteError && <div className="error-box">{suiteError}</div>}
      </section>
    );
  }

  function renderProductSuiteQueue() {
    return <section className="product-suite-queue">
      <div className="mode-banner"><div><p className="eyebrow">Suite Queue</p><h2>商品套图任务</h2></div><span>固定 5 张，统一背景和模型；每张文案可独立编辑。</span></div>
      {productSuites.length === 0 ? <div className="panel empty-state task-empty-state"><ImagePlus size={30} /><strong>还没有商品套图任务</strong><span>上传商品图并开始生成后，结果会显示在这里。</span></div> : <div className="product-suite-list">{productSuites.map((suite) => <article className="panel product-suite-task-card" key={suite.id}>
        <div className="suite-task-heading"><div><p className="eyebrow">Product Detail Suite</p><h3>{suite.input.productName || "未命名商品"}</h3><span className={`status-pill status-${suite.status === "done" ? "done" : suite.status === "error" ? "error" : suite.status === "partial" ? "error" : "running"}`}>{suite.status === "queued" ? "排队中" : suite.status === "running" ? "生成中" : suite.status === "partial" ? "部分完成" : suite.status === "done" ? "已完成" : "失败"}</span></div><div className="suite-task-heading-actions">{suite.recovery?.canRecoverBackground && <><input ref={(element) => { suiteRecoveryInputRefs.current[suite.id] = element; }} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void recoverProductSuiteBackground(suite.id, file); event.currentTarget.value = ""; }} /><button className="secondary" type="button" disabled={suiteRecoveringId === suite.id} onClick={() => suiteRecoveryInputRefs.current[suite.id]?.click()}>{suiteRecoveringId === suite.id ? <Loader2 className="spin" size={16} /> : <UploadCloud size={16} />}补传背景并继续</button></>}{suite.items.some((item) => item.resultUrl) && <a className="secondary" href={productSuiteZipUrl(suite.id)}><Download size={16} />下载整套 ZIP</a>}</div></div>
        <div className="product-suite-item-grid">{productSuiteSlots.map((definition) => { const item = suite.items.find((candidate) => candidate.slot === definition.slot); if (!item) return null; return <article className="product-suite-item-card" key={item.slot}><div className="suite-item-heading"><div><p className="eyebrow">{definition.eyebrow}</p><h4>{definition.label}</h4></div><span className={`status-pill status-${item.status === "done" ? "done" : item.status === "error" ? "error" : "running"}`}>{item.status === "queued" ? "排队中" : item.status === "running" ? "生成中" : item.status === "done" ? "已完成" : "失败"}</span></div><textarea value={item.prompt} onChange={(event) => setProductSuites((current) => current.map((currentSuite) => currentSuite.id === suite.id ? { ...currentSuite, items: currentSuite.items.map((currentItem) => currentItem.slot === item.slot ? { ...currentItem, prompt: event.target.value } : currentItem) } : currentSuite))} onBlur={(event) => void saveProductSuitePrompt(suite.id, item.slot, event.target.value)} rows={4} /><div className="suite-item-actions"><button className="ghost" type="button" onClick={() => { const prompt = item.defaultPrompt || item.prompt; setProductSuites((current) => current.map((currentSuite) => currentSuite.id === suite.id ? { ...currentSuite, items: currentSuite.items.map((currentItem) => currentItem.slot === item.slot ? { ...currentItem, prompt } : currentItem) } : currentSuite)); void saveProductSuitePrompt(suite.id, item.slot, prompt); }}><RefreshCcw size={15} />恢复默认文案</button>{item.resultUrl && <a className="secondary" href={item.resultUrl} target="_blank" rel="noreferrer"><Download size={15} />下载图片</a>}{item.status === "error" && <button className="ghost" type="button" onClick={() => void retryProductSuiteSlot(suite.id, item.slot)}><RefreshCcw size={15} />{item.slot === "model-front" ? "重生成三视图" : "单张重试"}</button>}</div>{item.resultUrl ? <img className="suite-result-preview" src={item.resultUrl} alt={definition.label} /> : <div className="empty-state suite-result-empty"><Loader2 className={item.status === "running" || item.status === "queued" ? "spin" : ""} size={24} /><span>{item.status === "error" ? item.error || "生成失败" : item.status === "queued" ? "等待共享执行槽位" : "正在生成"}</span></div>}</article>; })}</div>
      </article>)}</div>}
    </section>;
  }

  const creationTitle = creationKind === "image" ? "图片创作" : creationKind === "video" ? "视频创作" : creationKind === "print" ? "印花提取" : creationKind === "suite" ? "商品套图" : "产品抠图";

  return (
    <main className={`app-shell creation-${creationKind}`}>
      <header className={`workbench-topbar ${creationKind === "image" ? "image-workbench-topbar" : ""}`}>
        {creationKind === "image" && <div className="image-workbench-brand"><span className="image-workbench-brand-mark"><ImagePlus size={14} /></span><strong>Batch Desk</strong></div>}
        <nav className="workbench-nav" aria-label="创作类型">
          <button className={creationKind === "image" ? "active" : ""} aria-pressed={creationKind === "image"} onClick={() => setCreationKind("image")} type="button">图片创作</button>
          <button className={creationKind === "video" ? "active" : ""} aria-pressed={creationKind === "video"} onClick={() => setCreationKind("video")} type="button">视频创作</button>
          <button className={creationKind === "cutout" ? "active" : ""} aria-pressed={creationKind === "cutout"} onClick={() => setCreationKind("cutout")} type="button">产品抠图</button>
          <button className={creationKind === "print" ? "active" : ""} aria-pressed={creationKind === "print"} onClick={() => setCreationKind("print")} type="button">印花提取</button>
          <button className={creationKind === "suite" ? "active" : ""} aria-pressed={creationKind === "suite"} onClick={() => setCreationKind("suite")} type="button">商品套图</button>
        </nav>
        <div className="workbench-top-actions"><span>使用指南</span><span className="balance-badge">余额&nbsp; 1,250</span><span className="account-orb">W</span></div>
      </header>
      <div className={`workbench-layout ${creationKind === "image" ? "image-workbench-layout" : ""}`}>
        <div className="workbench-main">
          <header className="topbar page-heading">
            <div><p className="eyebrow">AI Workbench</p><h1>{creationTitle}</h1><span className="page-subtitle">多任务并行创作，结果统一管理</span></div>
            <div className="status-strip"><span>{tasks.length + videoTasks.length + cutoutTasks.length}/{MAX_TASKS} 个任务</span><span>{resultCount} 张结果图</span><span>运行中 {activeImageCount + activeVideoCount}</span></div>
          </header>

      {creationKind === "image" ? <section className="image-batch-desk">
        <div className="batch-heading">
          <div>
            <p className="eyebrow">Batch</p>
            <h2>批量任务创建</h2>
          </div>
          <div className="batch-actions">
            <button className="primary" type="button" onClick={applyGlobalSettingsToTasks}>
              <Wand2 size={16} />
              应用到所有任务卡
            </button>
            <button className="secondary" type="button" onClick={addTask} disabled={remainingSlots === 0}>
              <Plus size={16} />
              添加任务
            </button>
            <button className="secondary" type="button" onClick={() => void runAllTasks()} disabled={isAnyRunning || tasks.length === 0}>
              {isAnyRunning ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
              全部开始
            </button>
            <button className="ghost" type="button" onClick={clearCompletedResults} disabled={tasks.length === 0}>
              <RefreshCcw size={16} />
              清空已完成
            </button>
            <button className="ghost danger-ghost" type="button" onClick={clearAllTasks} disabled={tasks.length === 0}>
              <Trash2 size={16} />
              清空全部
            </button>
          </div>
        </div>

        <div className="batch-grid image-batch-toolbar">
          <details className="batch-prompt image-bulk-prompt">
            <summary>批量提示词<span>展开后可同步到所有任务卡</span></summary>
            <label className="field">
              <span>批量提示词</span>
              <textarea
                ref={bulkPromptRef}
                value={bulkPrompt}
                onChange={(event) => {
                  setBulkPrompt(event.target.value);
                  setBulkError("");
                }}
                placeholder="输入一段文案，点击批量添加后会同步到下面所有 task..."
                rows={5}
              />
            </label>
          </details>

          <div className="batch-controls">
            <label className="field global-model-field"><span>模型</span><select value={`${provider}:${nanoModel}`} onChange={(event) => { const [nextProvider, nextModel] = event.target.value.split(":") as [ProviderId, NanoModelId]; changeBatchProvider(nextProvider); if (nextProvider !== "image2") changeBatchNanoModel(nextModel); }}><option value="image2:gpt-image-2">Image 2</option>{(["nanobanana", "grok", "kling"] as ProviderId[]).flatMap((item) => imageModelsForProvider(item).map((model) => <option key={`${item}:${model.id}`} value={`${item}:${model.id}`}>{model.label}</option>))}</select></label>

            {provider !== "image2" && (
              <label className="field">
                  <span>{provider === "grok" ? "Grok 图片模型" : provider === "kling" ? "Kling 图片模型" : "Nano 模型档位"}</span>
                <select className="nano-model-select" value={nanoModel} onChange={(event) => changeBatchNanoModel(event.target.value as NanoModelId)}>
                  {imageModelsForProvider(provider).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.selectLabel}
                    </option>
                  ))}
                </select>
                <small>
                  {nanoModelInfo(nanoModel).description} {nanoModelInfo(nanoModel).useCase}
                </small>
              </label>
            )}

            <div className="param-grid">
              <label className="field">
                <span>输出图片数量</span>
                <input
                  min={1}
                   max={provider === "grok" ? 4 : provider === "kling" ? 9 : 8}
                  value={count}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setCount(draftCount(provider, nanoModel, event.target.value, count))}
                  onBlur={() => setCount((current) => normalizeCount(provider, nanoModel, current))}
                   disabled={isNanoEditMulti(provider, nanoModel) || isGrokEdit(provider, nanoModel)}
                  type="number"
                />
                 {isEditMulti(provider, nanoModel) ? <small>多图编辑支持一次输出 1-9 张。</small> : isGrokEdit(provider, nanoModel) || isKlingSingleEdit(provider, nanoModel) ? <small>{isKlingSingleEdit(provider, nanoModel) ? "单图编辑，最多 9 张结果。" : "单图编辑固定输出 1 张。"}</small> : <small>{provider === "grok" ? "1-4 张图片" : provider === "kling" ? "1-9 张图片" : "1-8 张图片"}</small>}
              </label>

              {currentAspectOptions.length > 0 && <label className="field">
                  <span>图片比例</span>
                  <select value={aspectRatio} onChange={(event) => changeBatchAspectRatio(event.target.value)}>
                    {currentAspectOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>}

              {currentResolutionOptions.length > 0 ? (
                <label className="field">
                  <span>分辨率</span>
                  <select value={resolution} onChange={(event) => setResolution(event.target.value as Resolution)}>
                    {currentResolutionOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <small>当前接入模型不支持 720p / 1080p。</small>
                </label>
              ) : null}

              {supportsQuality(provider) && <label className="field">
                <span>质量</span>
                <select
                  value={quality}
                  onChange={(event) => setQuality(event.target.value as Quality)}
                  disabled={!supportsQuality(provider)}
                >
                  <option value="low">草稿</option>
                  <option value="medium">标准</option>
                  <option value="high">精修</option>
                </select>
                <small>{qualityUseCases[quality]}</small>
              </label>}
            </div>

            <div className="batch-price">
              <strong>预计批量总价：{formatUsd(batchEstimate.total)}</strong>
              <span>
                按当前 {tasks.length || 1} 个任务、每个 {count} 张预估。实际以 WaveSpeedAI 任务记录为准。
              </span>
            </div>
          </div>
        </div>

        <div className="batch-foot image-batch-footer">
          <span>全局设置可应用到所有待生成任务卡；每张卡仍可单独覆盖模型、提示词和参考图。</span>
          {bulkError && <strong>{bulkError}</strong>}
        </div>
      </section> : creationKind === "video" ? <section className="panel video-create-panel">
        <div className="batch-heading"><div><p className="eyebrow">Video creation</p><h2>视频创作</h2><span>每张卡独立配置；图片和视频任务共享服务器并发队列。</span></div><button className="secondary" type="button" onClick={addVideoDraft} disabled={videoDrafts.length >= MAX_TASKS}><Plus size={16} />添加视频任务</button></div>
        <div className="video-global-settings"><label className="field"><span>模型</span><select value={videoModel} onChange={(event) => setVideoModel(event.target.value as VideoModelId)}><option value="seedance-2-mini-image-to-video">Seedance 2.0 Mini</option><option value="seedance-2-fast-image-to-video">Seedance 2.0 Fast</option><option value="seedance-2-image-to-video">Seedance 2.0</option><option value="kling-3-std-image-to-video">Kling 3.0 Standard</option><option value="kling-3-pro-image-to-video">Kling 3.0 Pro</option><option value="kling-3-std-motion-control">Kling 3.0 Standard · 动作控制</option><option value="grok-imagine-video-v1.5-image-to-video">Grok Imagine Video v1.5</option></select></label><label className="field"><span>视频比例</span><select value={videoAspectRatio} onChange={(event) => setVideoAspectRatio(event.target.value)}><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></select></label><label className="field"><span>时长</span><select value={videoDuration} onChange={(event) => setVideoDuration(Number(event.target.value))}>{videoDurationOptions(videoModel).map((item) => <option key={item} value={item}>{item} 秒</option>)}</select></label><label className="field"><span>分辨率</span><select value={videoResolution} onChange={(event) => setVideoResolution(event.target.value)}>{videoResolutionOptions(videoModel).map((item) => <option key={item} value={item}>{item === "4k" ? "4K" : item}</option>)}</select></label><label className="toggle-field audio-toggle"><input type="checkbox" checked={videoAudio} onChange={(event) => setVideoAudio(event.target.checked)} /><span><strong>音频</strong><small>生成同步音频</small></span></label><button className="primary apply-video-button" type="button" onClick={applyVideoGlobalSettings}>应用到所有视频任务卡</button></div>
        <div className="video-draft-list">{videoDrafts.map((draft, index) => <article className="video-draft-card" key={draft.id}>
          <div className="task-heading"><div><p className="eyebrow">Video task {index + 1}</p><h3>视频任务卡</h3></div><button className="icon-button" type="button" title="删除任务" onClick={() => removeVideoDraft(draft.id)} disabled={videoDrafts.length === 1}><Trash2 size={16} /></button></div>
          <div className="video-draft-fields"><label className="field"><span>视频模型</span><select value={draft.modelId} onChange={(event) => updateVideoDraft(draft.id, { modelId: event.target.value as VideoModelId, endImage: null, error: "" })}><option value="seedance-2-mini-image-to-video">Seedance 2.0 Mini · 图生视频</option><option value="seedance-2-fast-image-to-video">Seedance 2.0 Fast · 图生视频</option><option value="seedance-2-image-to-video">Seedance 2.0 · 图生视频</option><option value="kling-3-std-image-to-video">Kling 3.0 Standard · 图生视频</option><option value="kling-3-pro-image-to-video">Kling 3.0 Pro · 图生视频</option><option value="kling-3-std-motion-control">Kling 3.0 Standard · 动作控制</option><option value="grok-imagine-video-v1.5-image-to-video">Grok Imagine Video v1.5 · 图生视频</option></select></label><label className="field"><span>{videoNeedsPrompt(draft.modelId) ? "运动提示词" : "可选运动提示词"}</span><textarea value={draft.prompt} onChange={(event) => updateVideoDraft(draft.id, { prompt: event.target.value, error: "" })} placeholder="描述动作、镜头、节奏和氛围..." rows={4} /></label></div>
          <div className={`video-frame-slots ${supportsVideoEndFrame(draft.modelId) ? "with-end-frame" : ""}`}><div className="video-frame-slot dropzone compact-dropzone"><ImagePlus size={22} /><strong>首帧图片（必填）</strong>{draft.startImage && <img className="video-reference-preview" src={draft.startImage.dataUrl} alt="视频首帧图片" />}<span>{draft.startImage?.fileName ?? "一张图片"}</span><button className="secondary" type="button" onClick={() => videoDraftInputRefs.current[`${draft.id}-start`]?.click()}>{draft.startImage ? "替换首帧" : "选择首帧"}</button><input ref={(element) => { videoDraftInputRefs.current[`${draft.id}-start`] = element; }} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void readMedia(file).then((media) => updateVideoDraft(draft.id, { startImage: media, error: "" })); event.currentTarget.value = ""; }} /></div>{supportsVideoEndFrame(draft.modelId) && <div className="video-frame-slot dropzone compact-dropzone"><ImagePlus size={22} /><strong>尾帧图片（可选，最多 1 张）</strong>{draft.endImage && <img className="video-reference-preview" src={draft.endImage.dataUrl} alt="视频尾帧图片" />}<span>{draft.endImage?.fileName ?? "可选一张结束画面"}</span><button className="secondary" type="button" onClick={() => videoDraftInputRefs.current[`${draft.id}-end`]?.click()}>{draft.endImage ? "替换尾帧" : "选择尾帧"}</button><input ref={(element) => { videoDraftInputRefs.current[`${draft.id}-end`] = element; }} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void readMedia(file).then((media) => updateVideoDraft(draft.id, { endImage: media, error: "" })); event.currentTarget.value = ""; }} /></div>}</div>
          {isMotionControlVideo(draft.modelId) && <div className="dropzone compact-dropzone motion-draft-upload"><Video size={22} /><strong>动作参考视频（必填）</strong><span>{draft.motionVideo?.fileName ?? "MP4、WebM 或 MOV"}</span><button className="secondary" type="button" onClick={() => videoDraftInputRefs.current[`${draft.id}-motion`]?.click()}>{draft.motionVideo ? "替换动作视频" : "选择动作视频"}</button><input ref={(element) => { videoDraftInputRefs.current[`${draft.id}-motion`] = element; }} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void readMedia(file).then((media) => updateVideoDraft(draft.id, { motionVideo: media, error: "" })); event.currentTarget.value = ""; }} /></div>}
          {draft.error && <div className="error-box">{draft.error}</div>}<div className="task-actions"><button className="primary" type="button" disabled={draft.status === "submitting"} onClick={() => void submitVideoDraft(draft)}>{draft.status === "submitting" ? <Loader2 className="spin" size={18} /> : <Video size={18} />}{draft.status === "submitting" ? "提交中..." : "创建此视频任务"}</button></div>
        </article>)}</div>
      </section> : creationKind === "print" ? renderPrintExtractionPanel() : creationKind === "suite" ? renderProductSuitePanel() : <section className="panel cutout-create-panel">
        <div className="batch-heading">
          <div><p className="eyebrow">Product cutout</p><h2>产品抠图</h2><span>把产品从原图中提取出来，输出透明底或纯白底素材。</span></div>
          <button className="primary" type="button" disabled={isCreatingCutout} onClick={() => void submitCutoutTask()}>{isCreatingCutout ? <Loader2 className="spin" size={18} /> : <Scissors size={18} />}{isCreatingCutout ? "正在提交..." : "创建抠图任务"}</button>
        </div>
        <div className="cutout-create-grid">
          <div className="cutout-upload-column">
            <div className="dropzone cutout-dropzone">
              {cutoutImage ? <img className="cutout-source-preview" src={cutoutImage.dataUrl} alt="产品原图" /> : <><Scissors size={30} /><strong>上传产品图</strong><span>支持单张 JPG、PNG、WebP</span></>}
              <button className="secondary" type="button" onClick={() => cutoutFileInputRef.current?.click()}>{cutoutImage ? "替换图片" : "选择产品图"}</button>
              {cutoutImage && <button className="ghost" type="button" onClick={() => setCutoutImage(null)}><Trash2 size={16} />移除</button>}
              <input ref={cutoutFileInputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImages([file]).then((images) => setCutoutImage(images[0] ?? null)).catch(() => setCutoutError("图片读取失败。")); event.currentTarget.value = ""; }} />
            </div>
          </div>
          <div className="cutout-options">
            <label className="field"><span>产品描述</span><input value={cutoutPrompt} onChange={(event) => setCutoutPrompt(event.target.value)} placeholder="例如：白色运动鞋、主产品" /></label>
            <div className="field"><span>输出背景</span><div className="background-choice" role="radiogroup" aria-label="输出背景"><button type="button" className={cutoutBackground === "transparent" ? "selected" : ""} onClick={() => setCutoutBackground("transparent")}><span className="checker-preview" />透明底</button><button type="button" className={cutoutBackground === "white" ? "selected" : ""} onClick={() => setCutoutBackground("white")}><span className="white-preview" />白底</button></div></div>
            <label className="toggle-field"><input type="checkbox" checked={cutoutAutocrop} onChange={(event) => setCutoutAutocrop(event.target.checked)} /><span><strong>自动裁切画布</strong><small>按产品边界收紧输出画布</small></span></label>
            <label className="toggle-field"><input type="checkbox" checked={cutoutEdgeRefinement} onChange={(event) => setCutoutEdgeRefinement(event.target.checked)} /><span><strong>边缘优化</strong><small>优先处理产品边缘和半透明区域</small></span></label>
            <div className="cutout-price"><strong>预计单张：$0.020</strong><span>使用 Bria 产品抠图模型，结果会进入下方任务队列。</span></div>
          </div>
        </div>
        {cutoutError && <div className="error-box">{cutoutError}</div>}
      </section>}

      <section className={`task-workspace ${creationKind === "image" ? "image-task-workspace" : ""}`}>
        <div className="mode-banner">
          <div>
            <p className="eyebrow">Task Queue</p>
            <h2>单独任务板块</h2>
          </div>
          <span>每个 task 都有独立提示词、参考图、参数、生成按钮和出图位置。</span>
        </div>

        {tasks.length === 0 ? (
          <div className="panel empty-state task-empty-state">
            <ImagePlus size={30} />
            <strong>还没有任务</strong>
            <span>先点击顶部“添加任务”，最多添加 10 个 task。</span>
          </div>
        ) : (
          <div className={`task-list ${creationKind === "image" ? "image-task-grid" : ""}`}>
            {tasks.map((task, taskIndex) => {
              const mode = resolveMode(task.images.length);
              const totalSize = task.images.reduce((sum, image) => sum + (image.size ?? 0), 0);
              const taskSupportsQuality = supportsQuality(task.provider);
              const selectedNano = nanoModelInfo(task.nanoModel);
              const taskAspectOptions = aspectOptionsFor(task.provider, task.nanoModel);
              const taskResolutionOptions = resolutionOptionsFor(task.provider, task.nanoModel);
              const taskAllowsImages = supportsReferenceImages(task.provider, task.nanoModel);
              return (
                <article className="panel task-card" key={task.id}>
                  <section className="task-edit-area">
                    <div className="task-heading">
                      <div>
                        <p className="eyebrow">Task {taskIndex + 1}</p>
                        <h3>{modeLabels[mode]}</h3>
                        {task.preset === "print-extraction" && <span className="preset-pill">印花提取预设</span>}
                      </div>
                      <div className="task-meta">
                        <span className={`status-pill status-${task.status}`}>{statusLabel(task.status)}</span>
                        <select
                          value={task.provider}
                          onChange={(event) => {
                            const nextProvider = event.target.value as ProviderId;
                            const nextModel = defaultModelForProvider(nextProvider, task.nanoModel);
                            updateTask(task.id, {
                              provider: nextProvider,
                              nanoModel: nextModel,
                              images: supportsReferenceImages(nextProvider, nextModel) ? task.images : [],
                              aspectRatio: normalizeAspect(nextProvider, nextModel, task.aspectRatio),
                              resolution: normalizeResolution(nextProvider, nextModel, task.resolution),
                              count: normalizeCount(nextProvider, nextModel, task.count),
                            });
                          }}
                        >
                          <option value="nanobanana">nanobanana</option>
                          <option value="image2">image2</option>
                          <option value="grok">Grok</option>
                          <option value="kling">Kling</option>
                        </select>
                        <button className="icon-button" type="button" title="删除任务" onClick={() => removeTask(task.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="task-param-controls" aria-label="任务生成参数">
                      {task.provider !== "image2" && (
                        <label className="mini-field wide-mini-field">
                            <span>{task.provider === "grok" ? "Grok 图片模型" : task.provider === "kling" ? "Kling 图片模型" : "Nano 模型档位"}</span>
                          <select
                            className="nano-model-select"
                            value={task.nanoModel}
                            onChange={(event) => {
                              const nextNanoModel = event.target.value as NanoModelId;
                              updateTask(task.id, {
                                nanoModel: nextNanoModel,
                                images: supportsReferenceImages(task.provider, nextNanoModel) ? task.images.slice(0, isGrokEdit(task.provider, nextNanoModel) || isKlingSingleEdit(task.provider, nextNanoModel) ? 1 : task.provider === "kling" ? 10 : task.images.length) : [],
                                aspectRatio: normalizeAspect(task.provider, nextNanoModel, task.aspectRatio),
                                resolution: normalizeResolution(task.provider, nextNanoModel, task.resolution),
                                count: normalizeCount(task.provider, nextNanoModel, task.count),
                              });
                            }}
                          >
                            {imageModelsForProvider(task.provider).map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.selectLabel}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      <label className="mini-field">
                        <span>输出图片数量</span>
                        <input
                          min={1}
                          max={task.provider === "grok" ? 4 : task.provider === "kling" ? 9 : 8}
                          value={task.count}
                          onChange={(event) =>
                            updateTask(task.id, { count: draftCount(task.provider, task.nanoModel, event.target.value, task.count) })
                          }
                          onFocus={(event) => event.currentTarget.select()}
                          onBlur={() => updateTask(task.id, { count: normalizeCount(task.provider, task.nanoModel, task.count) })}
                           disabled={isNanoEditMulti(task.provider, task.nanoModel) || isGrokEdit(task.provider, task.nanoModel)}
                          type="number"
                        />
                        {isEditMulti(task.provider, task.nanoModel) ? <small>多图编辑，1-9 张结果</small> : isGrokEdit(task.provider, task.nanoModel) ? <small>固定 1 张</small> : <small>{task.provider === "grok" ? "1-4 张图片" : task.provider === "kling" ? "1-9 张图片" : "1-8 张图片"}</small>}
                      </label>

                      {taskAspectOptions.length > 0 && <label className="mini-field">
                        <span>图片比例</span>
                        <select value={task.aspectRatio} onChange={(event) => updateTask(task.id, { aspectRatio: event.target.value })}>
                          {taskAspectOptions.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>}

                      {taskResolutionOptions.length > 0 ? (
                        <label className="mini-field">
                          <span>分辨率</span>
                          <select value={task.resolution} onChange={(event) => updateTask(task.id, { resolution: event.target.value as Resolution })}>
                            {taskResolutionOptions.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      {taskSupportsQuality && <label className="mini-field">
                        <span>质量</span>
                        <select
                          value={task.quality}
                          onChange={(event) => updateTask(task.id, { quality: event.target.value as Quality })}
                          disabled={!taskSupportsQuality}
                        >
                          <option value="low">草稿</option>
                          <option value="medium">标准</option>
                          <option value="high">精修</option>
                        </select>
                      </label>}
                    </div>

                    <div className="model-note">
                      {task.provider === "image2"
                        ? `${qualityLabels[task.quality]}：${qualityUseCases[task.quality]}`
                        : `${selectedNano.label}：${selectedNano.useCase}`}
                    </div>

                    {renderPriceSummary(task)}

                    <label className="field prompt-field">
                      <span>主提示词</span>
                      <textarea
                        value={task.prompt}
                        onChange={(event) => updateTask(task.id, { prompt: event.target.value, error: "" })}
                        placeholder="描述你想生成、改造或融合的画面..."
                        rows={5}
                      />
                    </label>

                    {taskAllowsImages ? <div
                      className={`dropzone compact-dropzone ${isDraggingTask === task.id ? "dragging" : ""}`}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setIsDraggingTask(task.id);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragLeave={() => setIsDraggingTask("")}
                      onDrop={(event) => {
                        event.preventDefault();
                        setIsDraggingTask("");
                        void addFiles(task.id, event.dataTransfer.files);
                      }}
                    >
                      <UploadCloud size={24} />
                        <strong>{isGrokEdit(task.provider, task.nanoModel) || isKlingSingleEdit(task.provider, task.nanoModel) ? "上传一张参考图" : task.provider === "kling" ? "拖拽 1-10 张参考图到这里" : "拖拽图片到这里"}</strong>
                      <span>
                        {task.images.length} 张参考图
                        {totalSize > 0 ? `，约 ${formatBytes(totalSize)}` : ""}
                      </span>
                      <button className="secondary" type="button" onClick={() => fileInputsRef.current[task.id]?.click()}>
                        <ImagePlus size={16} />
                        选择图片
                      </button>
                      <input
                        ref={(element) => {
                          fileInputsRef.current[task.id] = element;
                        }}
                        type="file"
                        accept="image/*"
                         multiple={!isGrokEdit(task.provider, task.nanoModel) && !isKlingSingleEdit(task.provider, task.nanoModel)}
                        hidden
                        onChange={(event) => {
                          if (event.target.files) void addFiles(task.id, event.target.files);
                          event.currentTarget.value = "";
                        }}
                      />
                    </div> : <div className="model-note">{selectedNano.label} 仅支持文生图，已隐藏参考图上传区。</div>}

                    {task.images.length > 0 && (
                      <div className="thumb-grid">
                        {task.images.map((image, imageIndex) => (
                          <article className="thumb-card" key={image.id}>
                            <img src={image.dataUrl} alt={image.fileName} />
                            <div className="thumb-meta">
                              <strong title={image.fileName}>
                                {imageIndex + 1}. {image.fileName}
                              </strong>
                              <span>
                                {image.mimeType}
                                {image.size ? ` · ${formatBytes(image.size)}` : ""}
                              </span>
                            </div>
                            <div className="thumb-actions">
                              <button type="button" title="上移" onClick={() => moveImage(task.id, imageIndex, -1)}>
                                <ArrowUp size={15} />
                              </button>
                              <button type="button" title="下移" onClick={() => moveImage(task.id, imageIndex, 1)}>
                                <ArrowDown size={15} />
                              </button>
                              <button type="button" title="删除" onClick={() => removeImage(task.id, image.id)}>
                                <X size={15} />
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}

                    {task.error && <div className="error-box">{task.error}</div>}

                    <div className="task-actions">
                      <button className="primary" type="button" onClick={() => void runTask(task.id)} disabled={task.status === "running"}>
                        {task.status === "running" ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
                        {task.status === "running" ? "生成中..." : "开始生成"}
                      </button>
                    </div>
                  </section>

                  <section className="task-output-area">
                    <div className="task-output-heading">
                      <div>
                        <p className="eyebrow">Output</p>
                        <h4>任务出图</h4>
                      </div>
                      <span>{task.results.length} 张 · {resolutionLabels[task.resolution]}</span>
                    </div>

                    {task.status === "running" && (
                      <div className="empty-state task-output-empty">
                        <Loader2 className="spin" size={28} />
                        <strong>正在生成</strong>
                        <span>请求已发送到 WaveSpeedAI 的 {providerLabels[task.provider]}。</span>
                      </div>
                    )}

                    {task.status !== "running" && task.results.length === 0 && (
                      <div className="empty-state task-output-empty">
                        <ImagePlus size={28} />
                        <strong>结果会显示在这里</strong>
                        <span>点击本任务的开始生成后查看结果。</span>
                      </div>
                    )}

                    {task.results.length > 0 && (
                      <div className="task-results">
                        {task.results.map((image, index) => (
                          <article className="result-card" key={image.id}>
                            <img src={image.url} alt={`任务 ${taskIndex + 1} 结果 ${index + 1}`} />
                            <div className="result-actions">
                              <button type="button" onClick={() => downloadImage(image)} title="下载">
                                <Download size={15} />
                              </button>
                              <button type="button" onClick={() => void copyImage(image)} title="复制图片链接">
                                <Copy size={15} />
                              </button>
                              <button type="button" onClick={() => useAsNewTask(image)} title="作为新任务参考图">
                                <ImagePlus size={15} />
                              </button>
                              <button type="button" onClick={() => useImageForVideo(image)} title="生成视频">
                                <Video size={15} />
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <section className="video-queue-section">
        <div className="mode-banner"><div><p className="eyebrow">Concurrent queue</p><h2>视频任务队列</h2></div><div className="task-filter" role="tablist" aria-label="任务类型筛选"><button className={taskFilter === "all" ? "active" : ""} onClick={() => setTaskFilter("all")} type="button">全部任务</button><button className={taskFilter === "image" ? "active" : ""} onClick={() => setTaskFilter("image")} type="button">图片任务</button><button className={taskFilter === "video" ? "active" : ""} onClick={() => setTaskFilter("video")} type="button">视频任务</button></div></div>
        {taskFilter !== "image" && (videoTasks.length === 0 ? <div className="panel empty-state task-empty-state"><Video size={30} /><strong>还没有视频任务</strong><span>创建后会在这里显示进度、预览和下载。</span></div> : <div className="video-task-list">{videoTasks.map((task) => <article className="panel video-task-card" key={task.id}><div><p className="eyebrow">Video task</p><h3>{videoModelLabels[task.input.modelId]}</h3><span className={`status-pill status-${task.status === "done" ? "done" : task.status === "error" || task.status === "cancelled" ? "error" : "running"}`}>{task.status === "queued" ? "排队中" : task.status === "running" ? "生成中" : task.status === "done" ? "已完成" : task.status === "cancelled" ? "已取消" : task.status === "cancel_requested" ? "取消处理中" : "失败"}</span><p className="muted">{task.input.prompt || "未填写动作提示词"}</p>{task.error && <div className="error-box">{task.error}</div>}<div className="task-actions">{task.status === "error" && <button className="secondary" type="button" onClick={() => void retryVideoTask(task.id).then(updateVideoTask).catch((error) => setVideoError(error.message))}><RefreshCcw size={16} />重试</button>}{(task.status === "queued" || task.status === "running") && <button className="ghost danger-ghost" type="button" onClick={() => void cancelVideoTask(task.id).then(updateVideoTask).catch((error) => setVideoError(error.message))}>取消</button>}</div></div><div className="video-output">{task.results[0]?.url ? <><video controls preload="metadata" src={task.results[0].url} /><a className="secondary" href={task.results[0].url} target="_blank" rel="noreferrer"><Download size={16} />下载视频</a></> : <div className="empty-state task-output-empty">{task.status === "running" || task.status === "queued" ? <Loader2 className="spin" size={28} /> : <Video size={28} />}<strong>{task.status === "queued" ? "等待共享执行槽位" : task.status === "running" ? "正在生成视频" : "结果会显示在这里"}</strong></div>}</div></article>)}</div>)}
      </section>
      {creationKind === "cutout" && <section className="video-queue-section cutout-queue-section">
        <div className="mode-banner"><div><p className="eyebrow">Cutout queue</p><h2>抠图任务队列</h2></div><span>每张产品图独立处理，可与图片和视频任务同时运行。</span></div>
        {cutoutTasks.length === 0 ? <div className="panel empty-state task-empty-state"><Scissors size={30} /><strong>还没有抠图任务</strong><span>上传产品图并创建任务后，结果会显示在这里。</span></div> : <div className="video-task-list">{cutoutTasks.map((task) => <article className="panel video-task-card cutout-task-card" key={task.id}><div><p className="eyebrow">Product cutout</p><h3>{task.input.backgroundMode === "white" ? "白底产品图" : "透明底产品图"}</h3><span className={`status-pill status-${task.status === "done" ? "done" : task.status === "error" ? "error" : "running"}`}>{task.status === "queued" ? "排队中" : task.status === "running" ? "抠图中" : task.status === "done" ? "已完成" : "失败"}</span><p className="muted">{task.input.prompt}</p>{task.error && <div className="error-box">{task.error}</div>}</div><div className={`cutout-output ${task.input.backgroundMode === "transparent" ? "checkerboard" : "whiteboard"}`}>{task.results[0]?.url ? <><img src={task.results[0].url} alt="抠图结果" /><a className="secondary" href={task.results[0].url} target="_blank" rel="noreferrer"><Download size={16} />下载图片</a></> : <div className="empty-state task-output-empty"><Scissors size={28} /><strong>{task.status === "queued" ? "等待共享执行槽位" : task.status === "running" ? "正在处理产品边缘" : "结果会显示在这里"}</strong></div>}</div></article>)}</div>}
      </section>}
      {creationKind === "suite" && renderProductSuiteQueue()}
        </div>
      </div>
    </main>
  );
}

export default App;
