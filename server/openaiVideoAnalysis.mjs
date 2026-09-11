import { VIDEO_REMIX_LIMITS, validateVideoRemixDraft } from "../shared/videoRemixModels.mjs";

const DEFAULT_MODEL = process.env.OPENAI_VIDEO_ANALYSIS_MODEL || "gpt-5.6-terra";
const RESPONSES_URL = "https://api.openai.com/v1/responses";

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "overallScript", "shots"],
  properties: {
    title: { type: "string" },
    overallScript: { type: "string" },
    shots: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["startSeconds", "endSeconds", "sceneSummary", "imagePrompt", "videoPrompt"],
        properties: {
          startSeconds: { type: "number", minimum: 0 },
          endSeconds: { type: "number", exclusiveMinimum: 0 },
          sceneSummary: { type: "string" },
          imagePrompt: { type: "string" },
          videoPrompt: { type: "string" },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = "Analyze only the visual track. Preserve shot order, pacing, camera language, and marketing intent, but do not copy brands, faces, logos, written claims, or unrelated products. Return 3–8 shots covering the source duration. Write product-neutral Chinese prompts that can later substitute the user's reference product. Each image prompt must describe composition, camera, lighting, environment, and product role. Each video prompt must describe only five seconds of motion and camera behavior.";

function responseText(body) {
  if (typeof body?.output_text === "string") return body.output_text;
  const text = body?.output
    ?.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    ?.map((item) => item?.text)
    ?.find((value) => typeof value === "string");
  return text || "";
}

function parseAnalysis(body) {
  try {
    const parsed = JSON.parse(responseText(body));
    if (!parsed || typeof parsed !== "object") throw new Error("not-object");
    return parsed;
  } catch {
    throw new Error("GPT 结构化分析结果无效，请重试。");
  }
}

function normalizeAnalysis(parsed, durationSeconds) {
  const shots = Array.isArray(parsed.shots) ? parsed.shots : [];
  if (shots.length < VIDEO_REMIX_LIMITS.minShots || shots.length > VIDEO_REMIX_LIMITS.maxShots) throw new Error("GPT 分析出的分镜数量必须为 3–8 个。");
  let previousEnd = 0;
  const normalizedShots = shots.map((shot, index) => {
    const startSeconds = Number(shot.startSeconds);
    const endSeconds = Number(shot.endSeconds);
    const imagePrompt = String(shot.imagePrompt || "").trim();
    const videoPrompt = String(shot.videoPrompt || "").trim();
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) throw new Error(`第 ${index + 1} 个分镜时间无效。`);
    if (startSeconds < previousEnd - 0.001) throw new Error(`第 ${index + 1} 个分镜与上一个分镜时间重叠。`);
    if (endSeconds > durationSeconds + 0.001) throw new Error(`第 ${index + 1} 个分镜超过视频时长。`);
    if (!imagePrompt) throw new Error(`第 ${index + 1} 个分镜缺少图像提示词。`);
    if (!videoPrompt) throw new Error(`第 ${index + 1} 个分镜缺少视频提示词。`);
    previousEnd = endSeconds;
    return {
      id: `shot-${String(index + 1).padStart(2, "0")}`,
      order: index + 1,
      startSeconds,
      endSeconds,
      sceneSummary: String(shot.sceneSummary || "").trim(),
      imagePrompt,
      videoPrompt,
      imageStatus: "idle",
      imageTaskId: "",
      imageResultUrl: "",
      imageError: "",
      imageApprovedAt: null,
      videoStatus: "idle",
      videoTaskId: "",
      videoResultUrl: "",
      videoError: "",
    };
  });
  const errors = validateVideoRemixDraft({
    aspectRatio: "9:16",
    imageModelId: "gpt-image-2.5-sunburst",
    videoModelId: "seedance-2-fast-image-to-video",
    clipDuration: 5,
    shots: normalizedShots,
  });
  if (errors.some((error) => /分镜数量|图像提示词|视频提示词/.test(error))) throw new Error("GPT 分析结果缺少必需的分镜字段。");
  return {
    title: String(parsed.title || "视频再生项目").trim().slice(0, 160),
    overallScript: String(parsed.overallScript || "").trim().slice(0, 10000),
    shots: normalizedShots,
  };
}

export async function analyzeVideoFrames({ frames = [], durationSeconds, aspectRatio, apiKey = process.env.OPENAI_API_KEY, model = DEFAULT_MODEL, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error("服务器未配置 OPENAI_API_KEY。");
  if (!Array.isArray(frames) || frames.length === 0) throw new Error("没有可供 GPT 分析的关键帧。");
  const input = frames.map((frame) => ({
    role: "user",
    content: [
      { type: "input_text", text: `这是源视频在 ${Number(frame.timestampSeconds).toFixed(2)} 秒处的画面。输出比例要求：${aspectRatio || "9:16"}。` },
      { type: "input_image", image_url: frame.dataUrl, detail: "low" },
    ],
  }));
  const body = {
    model,
    instructions: SYSTEM_PROMPT,
    input,
    text: { format: { type: "json_schema", name: "video_remix_analysis", strict: true, schema: ANALYSIS_SCHEMA } },
  };
  let response;
  try {
    response = await fetchImpl(RESPONSES_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
  } catch {
    throw new Error("OpenAI 分析服务连接失败，请稍后重试。");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("OpenAI 鉴权失败，请检查服务器 OPENAI_API_KEY。");
    if (response.status === 404) throw new Error(`OpenAI 模型不可用：${model}。`);
    throw new Error(`OpenAI 分析失败（HTTP ${response.status}）。`);
  }
  return normalizeAnalysis(parseAnalysis(payload), Number(durationSeconds));
}

export { ANALYSIS_SCHEMA, DEFAULT_MODEL, SYSTEM_PROMPT };
