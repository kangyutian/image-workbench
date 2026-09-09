import { buildModelReferencePrompt } from "./modelReferenceAnalysis.mjs";

export const PRODUCT_SUITE_SLOTS = [
  { slot: "product-3d", label: "产品 3D 展示图", fileName: "01-product-3d.jpg" },
  { slot: "model-front", label: "欧美模特正面上身图", fileName: "02-model-front.jpg" },
  { slot: "model-angle", label: "欧美模特角度上身图", fileName: "03-model-angle.jpg" },
  { slot: "model-back", label: "欧美模特背面上身展示图", fileName: "04-model-back.jpg" },
];

export const PRODUCT_SUITE_MODELS = [
  { id: "kling", label: "Kling Image O3 Edit", provider: "kling", nanoModel: "kling-image-o3-edit" },
  { id: "nanobanana", label: "Nano Banana Pro", provider: "nanobanana", nanoModel: "nano-banana-pro" },
  { id: "image2", label: "Image 2", provider: "image2", nanoModel: "gpt-image-2" },
];

export const PRODUCT_SUITE_MAX_PRODUCT_IMAGES = 10;

const GENDERS = new Set(["female", "male"]);
const BODY_TYPES = new Set(["slim", "balanced", "athletic", "muscular", "plus", "curvy", "hourglass"]);
const AGE_RANGES = new Set(["18-24", "25-35", "36-45", "46-55", "56-plus"]);
const HAIR_STYLES = new Set(["natural-loose", "long-straight", "long-wavy", "low-ponytail", "high-ponytail", "short", "bob"]);
const HAIR_COLORS = new Set(["natural", "black", "dark-brown", "light-brown", "blonde", "copper-red", "silver-gray"]);
const SKIN_TONES = new Set(["natural", "fair", "medium", "tan", "deep"]);
const NATURAL_SKIN_DIRECTION = "皮肤有自然微光，画面干净但不过度精修，保留真实皮肤纹理、唇纹，自然毛孔和真实肤色过渡，不要塑料皮肤，不要明显 AI 感。";
const MODEL_PROPORTION_DIRECTION = "肩宽是头宽的 2 倍。";
const PRODUCT_SUITE_MODEL_SLOTS = new Set(["model-front", "model-angle", "model-back"]);
const PRODUCT_SUITE_IDENTITY_DEPENDENT_SLOTS = new Set(["model-angle", "model-back"]);

const product3dTemplate = "根据我提供的服装产品图，生成一张高真实感3D立体服装展示图。画面中只展示服装，不出现真人模特、不出现人体、不出现衣架。使用 Ghost Mannequin / Invisible Mannequin 隐形模特效果，让衣服像穿在一个看不见的人体上，自然撑开，保持完整立体结构。严格按照我上传的服装参考图还原实际商品，上传什么就生成什么，只生成参考图中明确存在的服装单品，不增加、补全、猜测或替换任何未出现的服装。若参考图只有上衣、背心、T恤等上装，只展示该上装，画面中不得出现裤子、裙子、短裤、下装或其他未上传的服装；只有在参考图明确包含上下装时，才分别展示其中实际存在的每一件服装。准确还原每件商品的颜色、领口、袖型、袖长、肩线、衣长、腰线、下摆、剪裁、缝线、包边、图案、印花、面料纹理和整体比例。不要擅自改变服装版型，不增加装饰，不改变颜色。服装具有真实的3D立体体积感，胸口、肩部、袖子、腰部等服装结构形成自然立体弧度，但内部为空，不显示任何身体。袖子自然向下垂落，衣服边缘略微弯曲，形成真实穿着状态。面料需要呈现真实厚度、柔软度和轻微弹性，布料表面纹理清晰，带自然细小褶皱和真实缝线，不要做成塑料材质。使用柔和的专业商品摄影灯光，从正面偏侧方打光，服装表面有自然高光与柔和阴影，增强立体感。只允许单一正面正视图，镜头与服装正面平行，机位与服装中心基本齐平，只展示服装正面。禁止背面、侧面、三分之二视角、斜下方45度角、侧后方视角或前后同时展示。禁止俯拍、仰拍、旋转透视和多角度拼图。多张商品参考图只用于核对同一商品的版型、细节、颜色和材质，不得复制参考图的拍摄角度、姿态或构图。{{product3dBackground}}画面整体风格：premium ecommerce product photography, 3D apparel render, floating clothing, ghost mannequin, invisible mannequin, clean fashion catalog, realistic fabric simulation, minimal luxury product presentation。保持正面正视图，居中构图，服装完整展示，高级电商产品视觉，高真实感，高清细节。商品名称：{{productName}}。商品信息：{{sellingPoints}}。不参考或带入任何其他参考商品，不添加额外产品、文字、水印或 logo。";

const defaultModelTemplates = {
  "model-front": "画面中是一位年轻{{gender}}模特。模特年龄为{{ageRange}}，体型严格按照用户选择的{{bodyType}}生成。模特{{hairStyle}}，发色为{{hairColor}}。五官精致自然，眉毛清晰，裸色哑光唇妆，妆容非常干净简约，肤色为{{skinTone}}，皮肤保留真实毛孔和自然肤质，不要过度磨皮。模特穿的衣服必须严格参考我上传的产品图片，包括：颜色、版型、领口、肩带/袖子结构、衣长、腰线、下摆、图案、印花位置、刺绣、纽扣、缝线、面料纹理以及整体比例全部尽可能准确还原。不要自行改变衣服设计，不增加不存在的装饰，不修改原本图案，不改变颜色。服装自然贴合模特身体，并根据真实布料产生合理褶皱和垂坠感。模特正面面对镜头站立，身体保持笔直，双腿自然靠近，一条腿可以轻微向前。双手自然向下放置在身体两侧偏后的位置，肩膀放松，表情冷静、自信、略带高级感，眼睛直视镜头。摄影机位与人物胸口基本平齐，使用约50–70mm人像镜头视角，人物位于画面正中央，保持对称、简洁的商业广告构图。人物从头部一直拍摄到脚部／全身，避免夸张广角透视。使用大型柔光箱从人物侧前方打光，形成柔和但清晰的面部与身体阴影，另一侧轻微补光。皮肤呈现自然柔和的光泽，服装纹理清晰。整体呈现：90年代末至2000年代初服装广告、Y2K fashion campaign、minimal studio fashion photography、clean editorial lookbook、真实品牌官网模特图、略带胶片颗粒感。画面真实自然，不要明显 AI 感，不要塑料皮肤，不要夸张磨皮，不要过度锐化。高真实感摄影、真实人体比例、真实皮肤纹理、自然阴影、professional fashion campaign photography。商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：高级电商摄影，真实、干净、突出商品。用户上传的商品图片是唯一的服装来源，不复制任何其他参考图中的人物或服装。{{backgroundDescription}}不添加文字、logo或水印。",
  "model-angle": "角度商品目录展示图。必须使用正面图中的同一位{{ageRange}}欧美{{gender}}模特作为人物身份参考，保持完全相同的脸型、五官、眼睛、鼻子、嘴型、发型（{{hairStyle}}）、发色（{{hairColor}}）、肤色（{{skinTone}}）、妆容、年龄、体型（{{bodyType}}）和肩宽比例，只改变拍摄角度，不重新生成或更换模特。正面成品图仅用于锁定人物身份、发型和妆容，不作为服装设计来源；服装必须严格参考用户上传的商品图片，用户上传的商品图片是唯一的服装来源。侧面只展示用户商品真实的轮廓、厚度、垂坠感、贴合度和结构，不复制其他参考图中的人物或服装。以90度侧身或自然三分之二侧身姿态展示商品，手臂自然放松，不遮挡商品主体。商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：高级电商摄影，真实、干净、突出商品。{{backgroundDescription}}与正面图保持相同的背景、光线、色温和商业摄影质感，不添加文字、logo或水印。",
  "model-back": "背面商品目录展示图。必须使用正面图中的同一位{{ageRange}}欧美{{gender}}模特作为人物身份参考，保持完全相同的脸型、五官、眼睛、鼻子、嘴型、发型（{{hairStyle}}）、发色（{{hairColor}}）、肤色（{{skinTone}}）、妆容、年龄、体型（{{bodyType}}）和肩宽比例，只改变拍摄角度，不重新生成或更换模特。正面成品图仅用于锁定人物身份、发型和妆容，不作为服装设计来源；服装必须严格参考用户上传的商品图片，用户上传的商品图片是唯一的服装来源。完整展示商品后背结构、后片比例、肩部、袖部、领口、下摆、缝线和材质，不复制其他参考图中的人物或服装。模特背对镜头自然站立，可以轻微转头但不能遮挡商品背面。商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：高级电商摄影，真实、干净、突出商品。{{backgroundDescription}}与正面图、侧面图保持相同的模特身份、商品、背景、光线、色温和商业摄影质感，不添加文字、logo或水印。",
};

const referenceModelTemplates = {
  "model-front": "模特参考图为人物唯一身份与外观来源。画面中使用上传的模特参考图作为人物唯一身份和外观来源。{{modelReferenceDirection}}先分析并锁定参考图中可见的脸型、五官、年龄观感、性别呈现、肤色、发型、发长、发质、发色、身材轮廓、肩宽比例、腰臀比例、四肢比例和整体气质，生成同一位欧美成年模特。模特正面面对镜头站立，身体保持笔直，双腿自然靠近，一条腿可以轻微向前，双手自然向下放置在身体两侧偏后的位置，肩膀放松，表情冷静、自信、略带高级感，眼睛直视镜头。使用约50–70mm人像镜头视角，人物位于画面正中央，保持对称、简洁的商业广告构图，人物从头部一直拍摄到脚部／全身，避免夸张广角透视。模特穿的衣服必须严格参考我上传的产品图片，用户上传的商品图片是唯一的服装来源，不得复制模特参考图中的服装。{{productReferenceDirection}}{{backgroundDescription}}不添加文字、logo或水印。",
  "model-angle": "使用上传的模特参考图和已完成的正面图共同锁定同一位模特。模特参考图是人物身份与外观的唯一来源，正面成品图只用于校验同一人物的脸部、发型、发色、肤色、体型和比例。{{modelReferenceDirection}}先分析并保持参考图中可见的脸型、五官、年龄观感、性别呈现、肤色、发型、发长、发质、发色、身材轮廓、肩宽比例、腰臀比例、四肢比例和整体气质，只改变拍摄角度和姿态，不重新生成或更换模特。以90度侧身或自然三分之二侧身姿态展示商品，手臂自然放松，不遮挡商品主体。服装必须严格参考用户上传的商品图片，用户上传的商品图片是唯一的服装来源，不得复制模特参考图中的服装。商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：高级电商摄影，真实、干净、突出商品。{{backgroundDescription}}与正面图保持相同的模特身份、商品、背景、光线、色温和商业摄影质感，不添加文字、logo或水印。",
  "model-back": "使用上传的模特参考图、已完成的正面图和侧面图共同锁定同一位模特。模特参考图是人物身份与外观的唯一来源，正面和侧面成品图只用于校验同一人物的脸部、发型、发色、肤色、体型和比例。{{modelReferenceDirection}}先分析并保持参考图中可见的脸型、五官、年龄观感、性别呈现、肤色、发型、发长、发质、发色、身材轮廓、肩宽比例、腰臀比例、四肢比例和整体气质，只改变拍摄角度和姿态，不重新生成或更换模特。模特背对镜头自然站立，可以轻微转头但不能遮挡商品背面，完整展示商品后背结构、后片比例、肩部、袖部、领口、下摆、缝线和材质。服装必须严格参考用户上传的商品图片，用户上传的商品图片是唯一的服装来源，不得复制模特参考图中的服装。商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：高级电商摄影，真实、干净、突出商品。{{backgroundDescription}}与正面图、侧面图保持相同的模特身份、商品、背景、光线、色温和商业摄影质感，不添加文字、logo或水印。",
};

const genderLabels = { female: "女性", male: "男性" };
const bodyLabels = {
  slim: "身材纤细偏瘦，线条自然，腰臀比例协调，双腿修长",
  balanced: "身材健康匀称、略带自然曲线感，腰臀比例自然，双腿修长",
  athletic: "身材运动紧实，肌肉线条自然，比例匀称，双腿修长",
  muscular: "身材肌肉感明显但自然，肩背和四肢线条清晰，比例协调",
  plus: "身材丰润偏胖，身体曲线自然，比例协调",
  curvy: "身材丰满，腰臀曲线明显但自然，比例协调",
  hourglass: "身材沙漏曲线，肩腰臀比例协调，曲线自然",
};
const ageLabels = { "18-24": "18至24岁（成年）", "25-35": "25至35岁", "36-45": "36至45岁", "46-55": "46至55岁", "56-plus": "56岁以上" };
const hairLabels = {
  "natural-loose": "头发蓬松但整洁，带有轻微凌乱碎发感的自然披发",
  "long-straight": "长发自然披肩，发丝整洁顺滑",
  "long-wavy": "长发自然大波浪，发丝蓬松但整洁",
  "low-ponytail": "头发整洁地扎成低马尾，保留少量自然碎发",
  "high-ponytail": "头发整洁地扎成高马尾，保留少量自然碎发",
  short: "利落自然的短发，发丝有轻微蓬松感",
  bob: "整洁自然的中短波波头，发尾轻微蓬松",
};
const hairColorLabels = {
  natural: "自然发色，不额外改变参考观感",
  black: "自然黑色",
  "dark-brown": "深棕色",
  "light-brown": "浅棕色",
  blonde: "金色",
  "copper-red": "红棕色或铜色",
  "silver-gray": "灰银色",
};
const skinLabels = { natural: "自然真实肤色，不额外限定色调", fair: "自然浅肤色", medium: "自然中等肤色", tan: "自然小麦肤色", deep: "自然深肤色" };

export function normalizeProductSuiteInput(input = {}) {
  const gender = GENDERS.has(input.gender) ? input.gender : "female";
  const bodyType = BODY_TYPES.has(input.bodyType) ? input.bodyType : "balanced";
  const ageRange = AGE_RANGES.has(input.ageRange) ? input.ageRange : "25-35";
  const hairStyle = HAIR_STYLES.has(input.hairStyle) ? input.hairStyle : "natural-loose";
  const hairColor = HAIR_COLORS.has(input.hairColor) ? input.hairColor : "natural";
  const skinTone = SKIN_TONES.has(input.skinTone) ? input.skinTone : "natural";
  const model = PRODUCT_SUITE_MODELS.some((item) => item.id === input.model) ? input.model : "kling";
  const imageModel = productSuiteImageModel(model);
  return {
    mode: "product-detail-suite",
    model,
    nanoModel: imageModel.nanoModel,
    gender,
    bodyType,
    ageRange,
    hairStyle,
    hairColor,
    skinTone,
    hasModelReference: Boolean(input.modelReferenceImage || input.hasModelReference || input.modelReferenceAnalysis),
    modelReferenceAnalysis: input.modelReferenceAnalysis && typeof input.modelReferenceAnalysis === "object" ? input.modelReferenceAnalysis : null,
    aspectRatio: "4:5",
    resolution: "2k",
    backgroundMode: input.backgroundMode === "custom" ? "custom" : "white",
    backgroundImages: Array.isArray(input.backgroundImages) ? input.backgroundImages.slice(0, 1) : [],
    productName: String(input.productName || "").trim().slice(0, 120),
    sellingPoints: String(input.sellingPoints || "").trim().slice(0, 600),
    prompts: input.prompts && typeof input.prompts === "object" ? { ...input.prompts } : {},
  };
}

export function productSuiteImageModel(model = "kling") {
  const selected = PRODUCT_SUITE_MODELS.find((item) => item.id === model) || PRODUCT_SUITE_MODELS[0];
  return { provider: selected.provider, nanoModel: selected.nanoModel };
}

export function validateProductSuiteInput(input = {}, images = []) {
  const errors = [];
  if (!Array.isArray(images) || images.length === 0) errors.push("商品套图至少上传 1 张商品图片。");
  else if (images.length > PRODUCT_SUITE_MAX_PRODUCT_IMAGES) errors.push(`商品套图最多上传 ${PRODUCT_SUITE_MAX_PRODUCT_IMAGES} 张商品图片。`);
  if (!GENDERS.has(input.gender)) errors.push("模特性别参数无效。");
  if (!BODY_TYPES.has(input.bodyType)) errors.push("模特体型参数无效。");
  if (!AGE_RANGES.has(input.ageRange)) errors.push("模特年龄参数无效。");
  if (!HAIR_STYLES.has(input.hairStyle)) errors.push("模特发型参数无效。");
  if (!HAIR_COLORS.has(input.hairColor)) errors.push("模特发色参数无效。");
  if (!SKIN_TONES.has(input.skinTone)) errors.push("模特肤色参数无效。");
  if (!["white", "custom"].includes(input.backgroundMode)) errors.push("背景只能选择纯白或自定义背景。");
  if (input.backgroundMode === "custom" && (!Array.isArray(input.backgroundImages) || input.backgroundImages.length !== 1)) errors.push("选择自定义背景时必须上传 1 张背景图片。");
  if (input.modelReferenceImage !== undefined && input.modelReferenceImage !== null && typeof input.modelReferenceImage !== "object") errors.push("模特参考图参数无效。");
  if (String(input.productName || "").length > 120) errors.push("商品名称不能超过 120 个字符。");
  if (String(input.sellingPoints || "").length > 600) errors.push("商品信息不能超过 600 个字符。");
  return errors;
}

export function defaultProductSuitePrompts(input = {}) {
  const normalized = normalizeProductSuiteInput(input);
  const referenceDirection = normalized.modelReferenceAnalysis ? buildModelReferencePrompt(normalized.modelReferenceAnalysis) : "模特参考图为人物唯一身份与外观来源。请严格分析并保持参考图中的可见脸部、五官、年龄观感、肤色、发型、发色、体型轮廓和整体气质；模特参考图仅用于人物身份和外观参考，不得复制模特参考图中的服装。";
  const values = {
    productName: normalized.productName || "待识别商品",
    sellingPoints: normalized.sellingPoints || "突出商品真实材质、结构和卖点",
    gender: genderLabels[normalized.gender],
    bodyType: bodyLabels[normalized.bodyType],
    ageRange: ageLabels[normalized.ageRange],
    hairStyle: hairLabels[normalized.hairStyle],
    hairColor: hairColorLabels[normalized.hairColor],
    skinTone: skinLabels[normalized.skinTone],
    productReferenceDirection: "服装自然贴合模特身体，严格还原商品颜色、版型、结构、图案、缝线、面料纹理和整体比例。",
    modelReferenceDirection: referenceDirection,
    backgroundDescription: normalized.backgroundMode === "custom" ? "背景使用用户上传的统一背景图，并与整套图片保持一致，最终合成中保持底图不变。" : "背景为浅灰偏白色无缝摄影棚背景，干净柔和，没有家具、复杂装饰或明显地平线。",
    product3dBackground: normalized.backgroundMode === "custom" ? "背景使用用户上传的统一背景图，并与整套图片保持一致，最终合成中保持底图不变。" : "背景为浅灰偏白色无缝摄影棚背景，干净柔和，没有家具、复杂装饰或明显地平线。",
  };
  return Object.fromEntries(PRODUCT_SUITE_SLOTS.map(({ slot }) => [slot, renderPrompt(slot, values, normalized.hasModelReference)]));
}

function renderPrompt(slot, values, hasModelReference = false) {
  const template = slot === "product-3d" ? product3dTemplate : hasModelReference ? referenceModelTemplates[slot] : defaultModelTemplates[slot];
  const rendered = template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || "");
  if (slot === "product-3d") return rendered;
  return `${rendered} ${NATURAL_SKIN_DIRECTION} ${MODEL_PROPORTION_DIRECTION}`.trim();
}

export function buildProductSuitePrompts(input = {}) {
  const defaults = defaultProductSuitePrompts(input);
  const custom = input.prompts && typeof input.prompts === "object" ? input.prompts : {};
  return Object.fromEntries(PRODUCT_SUITE_SLOTS.map(({ slot }) => [slot, String(custom[slot] || defaults[slot]).trim()]));
}

export function productSuiteModelProfilePrompt(input = {}) {
  const normalized = normalizeProductSuiteInput(input);
  if (normalized.hasModelReference) return normalized.modelReferenceAnalysis ? buildModelReferencePrompt(normalized.modelReferenceAnalysis) : "模特参考图为人物唯一身份与外观来源，分析并锁定参考图中可见的人物特征。参考图仅用于人物身份和外观，不得复制参考图中的服装；如果自定义提示词与模特参考图冲突，以模特参考图为准。";
  return `当前模特配置（优先级最高）：性别为${genderLabels[normalized.gender]}，年龄为${ageLabels[normalized.ageRange]}，体型为${bodyLabels[normalized.bodyType]}，发型为${hairLabels[normalized.hairStyle]}，发色为${hairColorLabels[normalized.hairColor]}，肤色为${skinLabels[normalized.skinTone]}。如果自定义提示词与当前模特配置冲突时，以当前模特配置为准。`;
}

export function productSuiteGenerationPrompt(slot, input = {}, prompt = "") {
  const base = String(prompt || buildProductSuitePrompts(input)[slot] || "").trim();
  if (!PRODUCT_SUITE_MODEL_SLOTS.has(slot)) return base;
  return `${base} ${productSuiteModelProfilePrompt(input)}`.trim();
}

export function productSuiteSlot(slot) {
  return PRODUCT_SUITE_SLOTS.find((item) => item.slot === slot) || null;
}

export function productSuiteGenerationPlan(items = [], retrySlot = "") {
  const activeSlots = new Set(PRODUCT_SUITE_SLOTS.map(({ slot }) => slot));
  const activeItems = (Array.isArray(items) ? items : []).filter((item) => activeSlots.has(item.slot));
  const targetItems = retrySlot === "model-front"
    ? activeItems.filter((item) => PRODUCT_SUITE_MODEL_SLOTS.has(item.slot) && item.status !== "done")
    : retrySlot
      ? activeItems.filter((item) => item.slot === retrySlot)
      : activeItems.filter((item) => item.status !== "done");

  return {
    independent: targetItems.filter((item) => !PRODUCT_SUITE_MODEL_SLOTS.has(item.slot)),
    front: targetItems.find((item) => item.slot === "model-front") || null,
    identityDependent: targetItems.filter((item) => PRODUCT_SUITE_IDENTITY_DEPENDENT_SLOTS.has(item.slot)),
  };
}

export function productSuiteReferenceImages(slot, productUrl, backgroundUrl = "", frontImageUrl = "", modelReferenceUrl = "", productReferenceUrls = []) {
  const references = [{ url: productUrl, fileName: "product-cutout.png" }];
  const reservedReferences = [backgroundUrl, PRODUCT_SUITE_MODEL_SLOTS.has(slot) && modelReferenceUrl, PRODUCT_SUITE_IDENTITY_DEPENDENT_SLOTS.has(slot) && frontImageUrl].filter(Boolean).length;
  const maxProductReferences = Math.max(0, PRODUCT_SUITE_MAX_PRODUCT_IMAGES - reservedReferences - 1);
  const productReferences = (Array.isArray(productReferenceUrls) ? productReferenceUrls : []).filter((url) => Boolean(url) && url !== productUrl).slice(0, maxProductReferences);
  for (const [index, url] of productReferences.entries()) {
    references.push({ url, fileName: `product-reference-${index + 1}.png` });
  }
  if (backgroundUrl) references.push({ url: backgroundUrl, fileName: "suite-background.png" });
  if (PRODUCT_SUITE_MODEL_SLOTS.has(slot) && modelReferenceUrl) references.push({ url: modelReferenceUrl, fileName: "model-reference.png" });
  if (PRODUCT_SUITE_IDENTITY_DEPENDENT_SLOTS.has(slot) && frontImageUrl) references.push({ url: frontImageUrl, fileName: "model-front-identity.png" });
  return references;
}
