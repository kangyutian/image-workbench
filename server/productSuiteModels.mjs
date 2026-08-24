export const PRODUCT_SUITE_SLOTS = [
  { slot: "product-3d", label: "产品 3D 展示图", fileName: "01-product-3d.jpg" },
  { slot: "model-front", label: "欧美模特正面上身图", fileName: "02-model-front.jpg" },
  { slot: "model-angle", label: "欧美模特角度上身图", fileName: "03-model-angle.jpg" },
  { slot: "model-back", label: "欧美模特背面上身展示图", fileName: "04-model-back.jpg" },
  { slot: "product-detail", label: "产品细节特写图", fileName: "05-product-detail.jpg" },
];

const GENDERS = new Set(["female", "male"]);
const BODY_TYPES = new Set(["slim", "muscular", "plus", "curvy", "hourglass"]);

const slotTemplates = {
  "product-3d": "产品3D展示效果图。用户上传的商品图片是唯一的商品来源，完整保留商品主体，生成真实立体透视、自然光影和高级电商展示效果。商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：{{style}}。商品结构、颜色、材质必须与用户上传的商品一致，使用{{background}}，画面干净，不参考或带入任何其他参考商品，不添加额外产品、文字、水印或 logo。",
  "model-front": "正面商品目录展示图。生成一位25至35岁的欧美{{gender}}模特，体型严格按照用户选择的{{bodyType}}生成，正面对镜头自然站立。用户上传的商品图片是唯一的服装来源，完整展示商品正面版型、颜色、材质和穿着效果，不复制任何其他参考图中的人物或服装。商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：{{style}}。模特双臂自然放松，不遮挡商品主体，使用{{background}}，保持同一模特设定供侧面和背面图片使用，不添加文字、logo或水印。",
  "model-angle": "侧面商品目录展示图。使用与正面图完全相同的25至35岁欧美{{gender}}模特，体型严格按照用户选择的{{bodyType}}生成，以90度侧身或轻微三分之二侧身姿态展示商品。用户上传的商品图片是唯一的服装来源，侧面只参考用户商品的真实轮廓、厚度、垂坠感、贴合度和结构，不复制任何其他参考图中的人物、颜色或服装。商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：{{style}}。手臂自然放松，不遮挡商品，使用{{background}}，保持与正面图相同的脸部、发型、肤色、体型和妆容，不添加文字、logo或水印。",
  "model-back": "背面商品目录展示图。使用与正面图和侧面图完全相同的25至35岁欧美{{gender}}模特，体型严格按照用户选择的{{bodyType}}生成，背对镜头自然站立。用户上传的商品图片是唯一的服装来源，完整展示商品后背结构、后片比例、肩部、袖部、领口、下摆、缝线和材质，不复制任何其他参考图中的人物、颜色或服装。商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：{{style}}。模特可以轻微转头但不能遮挡商品背面，使用{{background}}，保持与正面、侧面图相同的模特、商品、背景和灯光，不添加文字、logo或水印。",
  "product-detail": "产品细节特写图。用户上传的商品图片是唯一的商品来源，生成商品局部高清特写，准确保留商品真实颜色、材质、结构和细节。商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：{{style}}。重点展示材质、纹理、缝线、工艺或功能细节，使用{{background}}，构图干净，适合电商详情页，不参考或带入其他参考图中的商品，不添加文字、logo或水印。",
};

const genderLabels = { female: "女性", male: "男性" };
const bodyLabels = { slim: "偏瘦", muscular: "肌肉感", plus: "偏胖", curvy: "丰满", hourglass: "身体曲线好" };

export function normalizeProductSuiteInput(input = {}) {
  const gender = GENDERS.has(input.gender) ? input.gender : "female";
  const bodyType = BODY_TYPES.has(input.bodyType) ? input.bodyType : "slim";
  const model = input.model === "nanobanana" ? "nanobanana" : "kling";
  return {
    mode: "product-detail-suite",
    model,
    nanoModel: model === "nanobanana" ? "nano-banana-pro" : "kling-image-o3-edit",
    gender,
    bodyType,
    aspectRatio: "4:5",
    resolution: "2k",
    backgroundMode: input.backgroundMode === "custom" ? "custom" : "white",
    backgroundImages: Array.isArray(input.backgroundImages) ? input.backgroundImages.slice(0, 1) : [],
    productName: String(input.productName || "").trim().slice(0, 120),
    sellingPoints: String(input.sellingPoints || "").trim().slice(0, 600),
    style: String(input.style || "高级电商摄影，真实、干净、突出商品").trim().slice(0, 240),
    prompts: input.prompts && typeof input.prompts === "object" ? { ...input.prompts } : {},
  };
}

export function validateProductSuiteInput(input = {}, images = []) {
  const errors = [];
  if (!Array.isArray(images) || images.length !== 1) errors.push("商品套图必须上传 1 张商品图片。");
  if (!GENDERS.has(input.gender)) errors.push("模特性别参数无效。");
  if (!BODY_TYPES.has(input.bodyType)) errors.push("模特体型参数无效。");
  if (!["white", "custom"].includes(input.backgroundMode)) errors.push("背景只能选择纯白或自定义背景。");
  if (input.backgroundMode === "custom" && (!Array.isArray(input.backgroundImages) || input.backgroundImages.length !== 1)) errors.push("选择自定义背景时必须上传 1 张背景图片。");
  if (String(input.productName || "").length > 120) errors.push("商品名称不能超过 120 个字符。");
  if (String(input.sellingPoints || "").length > 600) errors.push("商品信息不能超过 600 个字符。");
  if (String(input.style || "").length > 240) errors.push("整体风格不能超过 240 个字符。");
  return errors;
}

export function defaultProductSuitePrompts(input = {}) {
  const normalized = normalizeProductSuiteInput(input);
  const values = {
    productName: normalized.productName || "待识别商品",
    sellingPoints: normalized.sellingPoints || "突出商品真实材质、结构和卖点",
    style: normalized.style,
    gender: genderLabels[normalized.gender],
    bodyType: bodyLabels[normalized.bodyType],
    background: normalized.backgroundMode === "custom" ? "用户上传的统一背景图" : "纯白背景",
  };
  return Object.fromEntries(PRODUCT_SUITE_SLOTS.map(({ slot }) => [slot, renderPrompt(slot, values)]));
}

function renderPrompt(slot, values) {
  return slotTemplates[slot].replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || "");
}

export function buildProductSuitePrompts(input = {}) {
  const defaults = defaultProductSuitePrompts(input);
  const custom = input.prompts && typeof input.prompts === "object" ? input.prompts : {};
  return Object.fromEntries(PRODUCT_SUITE_SLOTS.map(({ slot }) => [slot, String(custom[slot] || defaults[slot]).trim()]));
}

export function productSuiteSlot(slot) {
  return PRODUCT_SUITE_SLOTS.find((item) => item.slot === slot) || null;
}
