const DEFAULT_BASE_URL = "https://llm.wavespeed.ai/v1";
const DEFAULT_MODEL = "openai/gpt-5.6-sol";

const ANALYSIS_SYSTEM_PROMPT = "你是商品摄影中的模特一致性分析助手。只分析上传参考图中可见、可用于生成一致人物的外观与摄影特征，不识别姓名或身份，不推断不可见或敏感信息，不描述服装设计，不输出任何生成指令。必须只返回 JSON。";

const ANALYSIS_USER_PROMPT = `请分析这张模特参考图，并严格按照以下 JSON 结构返回。所有字段都使用简洁中文，只描述参考图中可见信息：
{
  "ageAppearance": "年龄观感",
  "genderPresentation": "性别呈现",
  "face": "脸型、五官比例和面部特征",
  "skin": "肤色和自然肤色过渡",
  "hair": { "style": "发型", "length": "发长", "texture": "发质和蓬松度", "color": "发色" },
  "body": { "silhouette": "身材轮廓", "shoulder": "肩宽与头宽的比例观感", "waistHips": "腰臀比例观感", "limbs": "四肢比例" },
  "expression": "表情和整体气质",
  "pose": "参考图中的姿态",
  "camera": "镜头距离、角度和构图观感"
}`;

function cleanText(value, fallback = "参考图中未明确显示") {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 400) || fallback;
}

function normalizeAnalysis(value = {}) {
  const hair = value?.hair && typeof value.hair === "object" ? value.hair : {};
  const body = value?.body && typeof value.body === "object" ? value.body : {};
  return {
    ageAppearance: cleanText(value?.ageAppearance),
    genderPresentation: cleanText(value?.genderPresentation),
    face: cleanText(value?.face),
    skin: cleanText(value?.skin),
    hair: {
      style: cleanText(hair.style),
      length: cleanText(hair.length),
      texture: cleanText(hair.texture),
      color: cleanText(hair.color),
    },
    body: {
      silhouette: cleanText(body.silhouette),
      shoulder: cleanText(body.shoulder),
      waistHips: cleanText(body.waistHips),
      limbs: cleanText(body.limbs),
    },
    expression: cleanText(value?.expression),
    pose: cleanText(value?.pose),
    camera: cleanText(value?.camera),
  };
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => typeof part === "string" ? part : part?.text || part?.content || "").join("");
}

export function parseModelReferenceAnalysis(value) {
  const raw = contentText(value).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("人物参考分析结果不是有效的 JSON。", { cause: "invalid-json" });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("人物参考分析结果格式无效。", { cause: "invalid-shape" });
  return normalizeAnalysis(parsed);
}

export function modelReferenceAnalysisConfig({ baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL } = {}) {
  const normalizedBaseUrl = String(baseUrl).replace(/\/$/, "");
  return { baseUrl: normalizedBaseUrl, endpoint: `${normalizedBaseUrl}/chat/completions`, model };
}

export function buildModelReferencePrompt(analysis = {}) {
  const normalized = normalizeAnalysis(analysis);
  return `模特参考图为人物唯一身份与外观来源。请先分析并锁定参考图中可见的人物特征，再生成同一位模特：年龄观感：${normalized.ageAppearance}；性别呈现：${normalized.genderPresentation}；脸型和五官：${normalized.face}；肤色：${normalized.skin}；发型：${normalized.hair.style}；发长：${normalized.hair.length}；发质：${normalized.hair.texture}；发色：${normalized.hair.color}；身材轮廓：${normalized.body.silhouette}；肩宽比例：${normalized.body.shoulder}；腰臀比例：${normalized.body.waistHips}；四肢比例：${normalized.body.limbs}；表情气质：${normalized.expression}；参考姿态：${normalized.pose}；镜头构图：${normalized.camera}。正面、侧面、背面必须保持同一人物身份、脸部特征、发型、发色、肤色、体型和比例，只改变视角、姿态与构图。模特参考图仅用于人物身份和外观参考，用户上传的商品图片是唯一的服装来源，不得复制模特参考图中的服装，不得改变用户商品的颜色、版型、图案或材质。`;
}

export async function analyzeModelReferenceImage(imageUrl, { apiKey = process.env.WAVESPEED_MODEL_ANALYSIS_KEY, fetchImpl = fetch, baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL } = {}) {
  if (!String(apiKey || "").trim()) throw Object.assign(new Error("服务器未配置模特参考分析模型 API Key。"), { statusCode: 503 });
  if (!/^https?:\/\/|^data:image\//i.test(String(imageUrl || ""))) throw Object.assign(new Error("模特参考图不是可用的图片地址。"), { statusCode: 400 });
  const config = modelReferenceAnalysisConfig({ baseUrl, model });
  const response = await fetchImpl(config.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${String(apiKey).trim()}` },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: [{ type: "text", text: ANALYSIS_USER_PROMPT }, { type: "image_url", image_url: { url: imageUrl } }] },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });
  const rawBody = await response.text();
  let body = {};
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { body = {}; }
  if (!response.ok) throw Object.assign(new Error(body?.error?.message || body?.error || body?.message || `模特参考分析请求失败（${response.status}）。`), { statusCode: response.status });
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw Object.assign(new Error("模特参考分析没有返回内容。"), { statusCode: 502 });
  const usage = body?.usage && typeof body.usage === "object" ? {
    ...(Number.isFinite(Number(body.usage.prompt_tokens)) ? { prompt_tokens: Number(body.usage.prompt_tokens) } : {}),
    ...(Number.isFinite(Number(body.usage.completion_tokens)) ? { completion_tokens: Number(body.usage.completion_tokens) } : {}),
    ...(Number.isFinite(Number(body.usage.total_tokens)) ? { total_tokens: Number(body.usage.total_tokens) } : {}),
  } : null;
  return { analysis: parseModelReferenceAnalysis(content), usage };
}
