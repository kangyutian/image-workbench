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
const PRINT_EXTRACTION_PROMPT =
  "请从参考服装图片中提取衣服正中央的印花图案，只保留印花本身，不要保留衣服、褶皱、布料纹理、模特、背景、阴影和拍摄光线。请尽量还原印花的线条、颜色、文字、卡通形象和图形细节。输出为居中构图的高清 2K 图案素材，优先透明背景；如果无法透明背景，请使用纯白背景。不要重新设计，不要改变图案内容，不要添加额外元素。";

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
  return provider === "nanobanana" && nanoModel === "nano-banana-pro-edit-multi";
}

function isGrokEdit(provider: ProviderId, nanoModel: NanoModelId) {
  return provider === "grok" && nanoModel === "grok-imagine-image-edit";
}

function isGrokQuality(provider: ProviderId, nanoModel: NanoModelId) {
  return provider === "grok" && nanoModel === "grok-imagine-image-quality";
}

function supportsReferenceImages(provider: ProviderId, nanoModel: NanoModelId) {
  return provider !== "grok" || isGrokEdit(provider, nanoModel);
}

function defaultModelForProvider(provider: ProviderId, current: NanoModelId) {
  if (provider === "grok") return current.startsWith("grok-") ? current : DEFAULT_GROK_MODEL;
  return current.startsWith("grok-") ? DEFAULT_NANO_MODEL : current;
}

function aspectOptionsFor(provider: ProviderId, nanoModel: NanoModelId) {
  if (isGrokQuality(provider, nanoModel)) return grokQualityAspectOptions;
  if (provider === "grok") return [];
  return isEditMulti(provider, nanoModel) ? editMultiAspectOptions : aspectOptions;
}

function resolutionOptionsFor(provider: ProviderId, nanoModel: NanoModelId) {
  if (isGrokQuality(provider, nanoModel)) return resolutionOptions.filter((item) => item.value !== "4k");
  if (provider === "grok") return [];
  if (isEditMulti(provider, nanoModel)) {
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
  if (isEditMulti(provider, nanoModel)) return 2;
  if (isGrokEdit(provider, nanoModel)) return 1;
  if (provider === "grok") return clampNumber(value, 1, 4);
  return clampNumber(value, 1, 8);
}

function draftCount(provider: ProviderId, nanoModel: NanoModelId, rawValue: string, fallback: number) {
  if (isEditMulti(provider, nanoModel)) return 2;
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

function App() {
  const [provider, setProvider] = useState<ProviderId>("image2");
  const [nanoModel, setNanoModel] = useState<NanoModelId>(DEFAULT_NANO_MODEL);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [count, setCount] = useState(1);
  const [resolution, setResolution] = useState<Resolution>("2k");
  const [quality, setQuality] = useState<Quality>("medium");
  const [tasks, setTasks] = useState<ImageTask[]>([]);
  const [creationKind, setCreationKind] = useState<"image" | "video">("image");
  const [videoTasks, setVideoTasks] = useState<VideoTask[]>([]);
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
  const [isDraggingTask, setIsDraggingTask] = useState("");
  const bulkPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const printFileInputRef = useRef<HTMLInputElement | null>(null);
  const videoStartImageInputRef = useRef<HTMLInputElement | null>(null);
  const videoEndImageInputRef = useRef<HTMLInputElement | null>(null);
  const motionVideoInputRef = useRef<HTMLInputElement | null>(null);
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

  function updateVideoTask(next: VideoTask) {
    setVideoTasks((current) => [next, ...current.filter((task) => task.id !== next.id)]);
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
              images: isGrokEdit(task.provider, task.nanoModel) ? [...task.images, ...loaded].slice(0, 1) : [...task.images, ...loaded],
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AI Image Workbench</p>
          <h1>AI 图片生成工作台</h1>
        </div>
        <div className="status-strip">
          <span>{providerLabels[provider]}</span>
          <span>{tasks.length}/{MAX_TASKS} 个任务</span>
          <span>{resultCount} 张结果图</span>
          <span>图片生成中 {activeImageCount}</span>
          <span>视频进行中 {activeVideoCount}</span>
        </div>
      </header>

      <div className="creation-switch segmented compact-segmented" aria-label="创作类型">
        <button className={creationKind === "image" ? "active" : ""} aria-pressed={creationKind === "image"} onClick={() => setCreationKind("image")} type="button">图片任务</button>
        <button className={creationKind === "video" ? "active" : ""} aria-pressed={creationKind === "video"} onClick={() => setCreationKind("video")} type="button"><Video size={16} />视频任务</button>
      </div>

      {creationKind === "image" ? <section className="panel batch-panel">
        <div className="batch-heading">
          <div>
            <p className="eyebrow">Batch</p>
            <h2>批量任务创建</h2>
          </div>
          <div className="batch-actions">
            <button className="primary" type="button" onClick={applyBulkToTasks}>
              <Wand2 size={16} />
              批量添加
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

        <div className="batch-grid">
          <div className="batch-prompt">
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
            <div className="print-extraction-box">
              <div className="print-extraction-heading">
                <div>
                  <p className="eyebrow">Print Extract</p>
                  <h3>服装印花提取</h3>
                </div>
                <span>nanobanana · 2K · 1:1</span>
              </div>
              <p>上传衣服正面图，系统会提取中间印花并输出 2K 高清素材。</p>
              <div className="print-link-row">
                <input
                  value={printImageUrl}
                  onChange={(event) => {
                    setPrintImageUrl(event.target.value);
                    setPrintError("");
                  }}
                  placeholder="粘贴服装图片链接，例如 https://...jpg"
                  type="url"
                />
                <button className="secondary" type="button" onClick={() => void createPrintTaskFromUrl()} disabled={isImportingPrint || remainingSlots === 0}>
                  {isImportingPrint ? <Loader2 className="spin" size={16} /> : <Scissors size={16} />}
                  创建提取任务
                </button>
              </div>
              <div className="print-action-row">
                <button className="ghost print-upload-button" type="button" onClick={() => printFileInputRef.current?.click()} disabled={remainingSlots === 0}>
                  <ImagePlus size={16} />
                  上传服装图
                </button>
                <span>可一次上传多张，每张图创建一个 task，最多 {MAX_TASKS} 个。</span>
              </div>
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
              {printError && <div className="inline-error">{printError}</div>}
            </div>
          </div>

          <div className="batch-controls">
            <div className="model-selector-block">
              <p className="eyebrow">Model</p>
              <div className="segmented compact-segmented" aria-label="选择模型">
                {(["nanobanana", "image2", "grok"] as ProviderId[]).map((item) => (
                  <button
                    className={provider === item ? "active" : ""}
                    key={item}
                    onClick={() => changeBatchProvider(item)}
                    type="button"
                  >
                    {providerLabels[item]}
                  </button>
                ))}
              </div>
            </div>

            {provider !== "image2" && (
              <label className="field">
                <span>{provider === "grok" ? "Grok 图片模型" : "Nano 模型档位"}</span>
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
                  max={provider === "grok" ? 4 : 8}
                  value={count}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setCount(draftCount(provider, nanoModel, event.target.value, count))}
                  onBlur={() => setCount((current) => normalizeCount(provider, nanoModel, current))}
                  disabled={isEditMulti(provider, nanoModel) || isGrokEdit(provider, nanoModel)}
                  type="number"
                />
                {isEditMulti(provider, nanoModel) ? <small>Edit Multi 固定一次输出 2 张。</small> : isGrokEdit(provider, nanoModel) ? <small>单图编辑固定输出 1 张。</small> : <small>{provider === "grok" ? "1-4 张图片" : "1-8 张图片"}</small>}
              </label>

              {currentAspectOptions.length > 0 && <label className="field">
                  <span>图片比例</span>
                  <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
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

        <div className="batch-foot">
          <span>先添加任务，再用“批量添加”把顶部文案和参数同步到所有任务。剩余可添加 {remainingSlots} 个，最多 {MAX_TASKS} 个。</span>
          {bulkError && <strong>{bulkError}</strong>}
        </div>
      </section> : <section className="panel video-create-panel">
        <div className="batch-heading"><div><p className="eyebrow">Video creation</p><h2>视频任务创建</h2><span>图片与视频任务独立创建、共享服务器并发队列。</span></div><button className="primary" type="button" disabled={isCreatingVideo} onClick={() => void submitVideoTask()}>{isCreatingVideo ? <Loader2 className="spin" size={18} /> : <Video size={18} />}{isCreatingVideo ? "正在提交..." : "创建视频任务"}</button></div>
        <div className="video-create-grid">
          <div className="video-fields">
            <label className="field"><span>视频模型</span><select value={videoModel} onChange={(event) => { const next = event.target.value as VideoModelId; videoEndImageReadGuardRef.current.cancel(); setVideoModel(next); if (!supportsVideoEndFrame(next)) setVideoEndImage(null); setVideoDuration(videoDurationOptions(next)[0]); setVideoResolution(videoResolutionOptions(next)[0] ?? "720p"); setVideoError(""); }}><option value="seedance-2-mini-image-to-video">Seedance 2.0 Mini · 图生视频 · 低成本试片</option><option value="seedance-2-fast-image-to-video">Seedance 2.0 Fast · 图生视频 · 快速成片</option><option value="seedance-2-image-to-video">Seedance 2.0 · 图生视频 · 正式成片</option><option value="kling-3-std-image-to-video">Kling 3.0 Standard · 图生视频</option><option value="kling-3-pro-image-to-video">Kling 3.0 Pro · 图生视频 · 高质量成片</option><option value="kling-3-std-motion-control">Kling 3.0 Standard · 动作控制</option><option value="grok-imagine-video-v1.5-image-to-video">Grok Imagine Video v1.5 · 图生视频</option></select></label>
            <label className="field"><span>{isMotionControlVideo(videoModel) ? "可选动作提示词" : videoNeedsPrompt(videoModel) ? "运动提示词" : "可选运动提示词"}</span><textarea value={videoPrompt} onChange={(event) => setVideoPrompt(event.target.value)} placeholder="描述动作、镜头、节奏和氛围..." rows={4} /></label>
            {isMotionControlVideo(videoModel) ? <div className="param-grid video-param-grid"><label className="field"><span>角色方向</span><select value={videoOrientation} onChange={(event) => setVideoOrientation(event.target.value as "image" | "video")}><option value="image">以人物图片方向为准</option><option value="video">以动作视频方向为准</option></select></label><label className="field"><span>保留参考音频</span><select value={keepOriginalSound ? "yes" : "no"} onChange={(event) => setKeepOriginalSound(event.target.value === "yes")}><option value="yes">保留</option><option value="no">不保留</option></select></label></div> : <div className="param-grid video-param-grid"><label className="field"><span>时长</span><select value={videoDuration} onChange={(event) => setVideoDuration(Number(event.target.value))}>{videoDurationOptions(videoModel).map((item) => <option key={item} value={item}>{item} 秒</option>)}</select></label>{videoSupportsAspectRatio(videoModel) && <label className="field"><span>画面比例</span><select value={videoAspectRatio} onChange={(event) => setVideoAspectRatio(event.target.value)}>{aspectOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}{videoResolutionOptions(videoModel).length > 0 && <label className="field"><span>分辨率</span><select value={videoResolution} onChange={(event) => setVideoResolution(event.target.value)}>{videoResolutionOptions(videoModel).map((item) => <option key={item} value={item}>{item === "4k" ? "4K" : item}</option>)}</select></label>}{videoSupportsAudio(videoModel) && <label className="field"><span>生成音频</span><select value={videoAudio ? "yes" : "no"} onChange={(event) => setVideoAudio(event.target.value === "yes")}><option value="yes">生成</option><option value="no">关闭</option></select></label>}</div>}
          </div>
          <div className="video-media-grid">
            <div className={`video-frame-slots ${videoAllowsEndFrame ? "with-end-frame" : ""}`}>
              <div className="video-frame-slot dropzone compact-dropzone">
                <ImagePlus size={24} />
                <strong>首帧图片（必填）</strong>
                {videoStartImage ? <img className="video-reference-preview" src={videoStartImage.dataUrl} alt="视频首帧图片" /> : <span>可上传图片或从已有图片结果带入</span>}
                <div className="video-frame-actions">
                  <button className="secondary" type="button" onClick={() => videoStartImageInputRef.current?.click()}>{videoStartImage ? "替换图片" : "选择图片"}</button>
                  {videoStartImage && <button className="ghost" type="button" onClick={() => { videoStartImageReadGuardRef.current.cancel(); setVideoStartImage(null); }}><Trash2 size={16} />移除</button>}
                </div>
                <input ref={videoStartImageInputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) readVideoImage(file, videoStartImageReadGuardRef.current, setVideoStartImage); event.currentTarget.value = ""; }} />
              </div>
              {videoAllowsEndFrame && <div className="video-frame-slot dropzone compact-dropzone">
                <ImagePlus size={24} />
                <strong>尾帧图片（可选）</strong>
                {videoEndImage ? <img className="video-reference-preview" src={videoEndImage.dataUrl} alt="视频尾帧图片" /> : <span>可上传图片作为视频结束画面</span>}
                <div className="video-frame-actions">
                  <button className="secondary" type="button" onClick={() => videoEndImageInputRef.current?.click()}>{videoEndImage ? "替换图片" : "选择图片"}</button>
                  {videoEndImage && <button className="ghost" type="button" onClick={() => { videoEndImageReadGuardRef.current.cancel(); setVideoEndImage(null); }}><Trash2 size={16} />移除</button>}
                </div>
                <input ref={videoEndImageInputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) readVideoImage(file, videoEndImageReadGuardRef.current, setVideoEndImage); event.currentTarget.value = ""; }} />
              </div>}
            </div>
            {isMotionControlVideo(videoModel) && <div className="dropzone compact-dropzone"><Video size={24} /><strong>动作参考视频（必填）</strong><span>{motionVideo?.fileName ?? "MP4、WebM 或 MOV"}</span><button className="secondary" type="button" onClick={() => motionVideoInputRef.current?.click()}>选择动作视频</button><input ref={motionVideoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void readMedia(file).then(setMotionVideo).catch(() => setVideoError("视频读取失败。")); event.currentTarget.value = ""; }} /></div>}
          </div>
        </div>
        {videoError && <div className="error-box">{videoError}</div>}
      </section>}

      <section className="task-workspace">
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
          <div className="task-list">
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
                        </select>
                        <button className="icon-button" type="button" title="删除任务" onClick={() => removeTask(task.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="task-param-controls" aria-label="任务生成参数">
                      {task.provider !== "image2" && (
                        <label className="mini-field wide-mini-field">
                          <span>{task.provider === "grok" ? "Grok 图片模型" : "Nano 模型档位"}</span>
                          <select
                            className="nano-model-select"
                            value={task.nanoModel}
                            onChange={(event) => {
                              const nextNanoModel = event.target.value as NanoModelId;
                              updateTask(task.id, {
                                nanoModel: nextNanoModel,
                                images: supportsReferenceImages(task.provider, nextNanoModel) ? task.images.slice(0, isGrokEdit(task.provider, nextNanoModel) ? 1 : task.images.length) : [],
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
                          max={task.provider === "grok" ? 4 : 8}
                          value={task.count}
                          onChange={(event) =>
                            updateTask(task.id, { count: draftCount(task.provider, task.nanoModel, event.target.value, task.count) })
                          }
                          onFocus={(event) => event.currentTarget.select()}
                          onBlur={() => updateTask(task.id, { count: normalizeCount(task.provider, task.nanoModel, task.count) })}
                          disabled={isEditMulti(task.provider, task.nanoModel) || isGrokEdit(task.provider, task.nanoModel)}
                          type="number"
                        />
                        {isEditMulti(task.provider, task.nanoModel) ? <small>固定 2 张</small> : isGrokEdit(task.provider, task.nanoModel) ? <small>固定 1 张</small> : <small>{task.provider === "grok" ? "1-4 张图片" : "1-8 张图片"}</small>}
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
                      <strong>{isGrokEdit(task.provider, task.nanoModel) ? "上传一张参考图" : "拖拽图片到这里"}</strong>
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
                        multiple={!isGrokEdit(task.provider, task.nanoModel)}
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
    </main>
  );
}

export default App;
