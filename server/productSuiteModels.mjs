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

const GENDERS = new Set(["female", "male"]);
const BODY_TYPES = new Set(["slim", "balanced", "athletic", "muscular", "plus", "curvy", "hourglass"]);
const AGE_RANGES = new Set(["18-24", "25-35", "36-45", "46-55", "56-plus"]);
const HAIR_STYLES = new Set(["natural-loose", "long-straight", "long-wavy", "low-ponytail", "high-ponytail", "short", "bob"]);
const SKIN_TONES = new Set(["natural", "fair", "medium", "tan", "deep"]);
const NATURAL_SKIN_DIRECTION = "皮肤有自然微光，画面干净但不过度精修，保留真实皮肤纹理、唇纹，自然毛孔和真实肤色过渡，不要塑料皮肤，不要明显 AI 感。";
const MODEL_PROPORTION_DIRECTION = "肩宽是头宽的 2 倍。";
const PRODUCT_SUITE_MODEL_SLOTS = new Set(["model-front", "model-angle", "model-back"]);
const PRODUCT_SUITE_IDENTITY_DEPENDENT_SLOTS = new Set(["model-angle", "model-back"]);

const legacySlotTemplates = {
  "product-3d": "根据我提供的服装产品图，生成一张高真实感3D立体服装展示图。画面中只展示服装，不出现真人模特、不出现人体、不出现衣架。使用 Ghost Mannequin / Invisible Mannequin 隐形模特效果，让衣服像穿在一个看不见的人体上，自然撑开，保持完整立体结构。服装上下装分开悬浮展示，位置排列整齐：上衣位于画面上方，下装位于画面下方，中间保留适当间距。严格按照我上传的服装参考图还原产品，包括：颜色、领口、袖型、袖长、肩线、衣长、腰线、裤腰高度、裤腿长度、剪裁、缝线、包边、图案、印花、面料纹理和整体比例。不要擅自改变服装版型，不增加装饰，不改变颜色。服装具有真实的3D立体体积感，胸口、肩部、袖子、腰部和裤裆位置形成自然人体弧度，但内部为空，不显示任何身体。袖子自然向下垂落，衣服边缘略微弯曲，形成真实穿着状态。面料需要呈现真实厚度、柔软度和轻微弹性，布料表面纹理清晰，带自然细小褶皱和真实缝线，不要做成塑料材质。使用柔和的专业商品摄影灯光，从正面偏侧方打光，服装表面有自然高光与柔和阴影，增强立体感。{{product3dBackground}}画面整体风格：premium ecommerce product photography, 3D apparel render, floating clothing, ghost mannequin, invisible mannequin, clean fashion catalog, realistic fabric simulation, minimal luxury product presentation。正面视角，居中构图，服装完整展示，高级电商产品视觉，高真实感，高清细节。商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：{{style}}。不参考或带入任何其他参考商品，不添加额外产品、文字、水印或 logo。",
  "model-front": "画面中是一位年轻{{gender}}模特，身材健康匀称、略带自然曲线感，腰臀比例自然，双腿修长。模特年龄为25至35岁，体型严格按照用户选择的{{bodyType}}生成。模特头发蓬松但整洁，带有轻微凌乱碎发感。五官精致自然，眉毛清晰，裸色哑光唇妆，妆容非常干净简约，皮肤保留真实毛孔和自然肤质，不要过度磨皮。模特穿的衣服必须严格参考我上传的产品图片，包括：颜色、版型、领口、肩带/袖子结构、衣长、腰线、下摆、图案、印花位置、刺绣、纽扣、缝线、面料纹理以及整体比例全部尽可能准确还原。不要自行改变衣服设计，不增加不存在的装饰，不修改原本图案，不改变颜色。服装自然贴合模特身体，并根据真实布料产生合理褶皱和垂坠感。模特正面面对镜头站立，身体保持笔直，双腿自然靠近，一条腿可以轻微向前。双手自然向下放置在身体两侧偏后的位置，肩膀放松，表情冷静、自信、略带高级感，眼睛直视镜头。摄影机位与人物胸口基本平齐，使用约50–70mm人像镜头视角，人物位于画面正中央，保持对称、简洁的商业广告构图。人物从头部一直拍摄到脚部／全身，避免夸张广角透视。使用大型柔光箱从人物侧前方打光，形成柔和但清晰的面部与身体阴影，另一侧轻微补光。皮肤呈现自然柔和的光泽，服装纹理清晰。整体呈现：90年代末至2000年代初时尚内衣广告、Y2K fashion campaign、minimal studio fashion photography、clean editorial lookbook、真实品牌官网模特图、略带胶片颗粒感。画面真实自然，不要明显 AI 感，不要塑料皮肤，不要夸张磨皮，不要过度锐化。高真实感摄影、真实人体比例、真实皮肤纹理、真实布料纹理、自然阴影、professional fashion campaign photography。商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：{{style}}。用户上传的商品图片是唯一的服装来源，不复制任何其他参考图中的人物或服装。{{backgroundDescription}}不添加文字、logo或水印。",
  "model-angle": "侧面商品目录展示图。必须使用正面图中的同一位25至35岁欧美{{gender}}模特作为人物身份参考，保持完全相同的脸型、五官、眼睛、鼻子、嘴型、发型、发色、肤色、妆容、年龄、体型{{bodyType}}和肩宽比例，只改变拍摄角度，不重新生成或更换模特。正面成品图仅用于锁定人物身份、发型和妆容，不作为服装设计来源；服装必须严格参考用户上传的商品图片，用户上传的商品图片是唯一的服装来源。侧面只展示用户商品真实的轮廓、厚度、垂坠感、贴合度和结构，不复制其他参考图中的人物或服装。以90度侧身或自然三分之二侧身姿态展示商品，手臂自然放松，不遮挡商品主体。商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：{{style}}。{{backgroundDescription}}与正面图保持相同的背景、光线、色温和商业摄影质感，不添加文字、logo或水印。",
  "model-back": "背面商品目录展示图。必须使用正面图中的同一位25至35岁欧美{{gender}}模特作为人物身份参考，保持完全相同的脸型、五官、眼睛、鼻子、嘴型、发型、发色、肤色、妆容、年龄、体型{{bodyType}}和肩宽比例，只改变拍摄角度，不重新生成或更换模特。正面成品图仅用于锁定人物身份、发型和妆容，不作为服装设计来源；服装必须严格参考用户上传的商品图片，用户上传的商品图片是唯一的服装来源。完整展示商品后背结构、后片比例、肩部、袖部、领口、下摆、缝线和材质，不复制其他参考图中的人物或服装。模特背对镜头自然站立，可以轻微转头但不能遮挡商品背面。商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：{{style}}。{{backgroundDescription}}与正面图、侧面图保持相同的模特身份、商品、背景、光线、色温和商业摄影质感，不添加文字、logo或水印。",
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
const skinLabels = { natural: "自然真实肤色，不额外限定色调", fair: "自然浅肤色", medium: "自然中等肤色", tan: "自然小麦肤色", deep: "自然深肤色" };

const slotTemplates = {
  "product-3d": legacySlotTemplates["product-3d"].replace("商品名称：{{productName}}。商品信息：{{sellingPoints}}。整体风格：{{style}}。", "商品名称：{{productName}}。商品信息：{{sellingPoints}}。").replace("画面整体风格：", ""),
  "model-front": "画面中是一位年轻{{gender}}模特。模特年龄为{{ageRange}}，体型为{{bodyType}}。模特{{hairStyle}}。肤色为{{skinTone}}，五官精致自然，眉毛清晰，裸色哑光唇妆，妆容非常干净简约，皮肤保留真实毛孔和自然肤质，不要过度磨皮。模特穿的衣服必须严格参考我上传的产品图片，包括：颜色、版型、领口、肩带/袖子结构、衣长、腰线、下摆、图案、印花位置、刺绣、纽扣、缝线、面料纹理以及整体比例全部尽可能准确还原。不要自行改变衣服设计，不增加不存在的装饰，不修改原本图案，不改变颜色。服装自然贴合模特身体，并根据真实布料产生合理褶皱和垂坠感。模特正面面对镜头站立，身体保持笔直，双腿自然靠近，一条腿可以轻微向前。双手自然向下放置在身体两侧偏后的位置，肩膀放松，表情冷静、自信、略带高级感，眼睛直视镜头。摄影机位与人物胸口基本平齐，使用约50–70mm人像镜头视角，人物位于画面正中央，保持对称、简洁的商业广告构图。人物从头部一直拍摄到脚部／全身，避免夸张广角透视。使用大型柔光箱从人物侧前方打光，形成柔和但清晰的面部与身体阴影，另一侧轻微补光。皮肤呈现自然柔和的光泽，服装纹理清晰。整体呈现：90年代末至2000年代初时尚内衣广告、Y2K fashion campaign、minimal studio fashion photography、clean editorial lookbook、真实品牌官网模特图、略带胶片颗粒感。画面真实自然，不要明显 AI 感，不要塑料皮肤，不要夸张磨皮，不要过度锐化。高真实感摄影、真实人体比例、真实皮肤纹理、自然阴影、professional fashion campaign photography。商品名称：{{productName}}。商品信息：{{sellingPoints}}。用户上传的商品图片是唯一的服装来源，不复制任何其他参考图中的人物或服装。{{backgroundDescription}}不添加文字、logo或水印。",
  "model-angle": "角度商品目录展示图。必须使用正面图中的同一位{{ageRange}}欧美{{gender}}模特作为人物身份参考，保持完全相同的脸型、五官、眼睛、鼻子、嘴型、发型（{{hairStyle}}）、发色、肤色（{{skinTone}}）、妆容、年龄、体型（{{bodyType}}）和肩宽比例，只改变拍摄角度，不重新生成或更换模特。正面成品图仅用于锁定人物身份、发型和妆容，不作为服装设计来源；服装必须严格参考用户上传的商品图片，用户上传的商品图片是唯一的服装来源。侧面只展示用户商品真实的轮廓、厚度、垂坠感、贴合度和结构，不复制其他参考图中的人物或服装。以90度侧身或自然三分之二侧身姿态展示商品，手臂自然放松，不遮挡商品主体。商品名称：{{productName}}。商品信息：{{sellingPoints}}。{{backgroundDescription}}与正面图保持相同的背景、光线、色温和商业摄影质感，不添加文字、logo或水印。",
  "model-back": "背面商品目录展示图。必须使用正面图中的同一位{{ageRange}}欧美{{gender}}模特作为人物身份参考，保持完全相同的脸型、五官、眼睛、鼻子、嘴型、发型（{{hairStyle}}）、发色、肤色（{{skinTone}}）、妆容、年龄、体型（{{bodyType}}）和肩宽比例，只改变拍摄角度，不重新生成或更换模特。正面成品图仅用于锁定人物身份、发型和妆容，不作为服装设计来源；服装必须严格参考用户上传的商品图片，用户上传的商品图片是唯一的服装来源。完整展示商品后背结构、后片比例、肩部、袖部、领口、下摆、缝线和材质，不复制其他参考图中的人物或服装。模特背对镜头自然站立，可以轻微转头但不能遮挡商品背面。商品名称：{{productName}}。商品信息：{{sellingPoints}}。{{backgroundDescription}}与正面图、侧面图保持相同的模特身份、商品、背景、光线、色温和商业摄影质感，不添加文字、logo或水印。",
};

export function normalizeProductSuiteInput(input = {}) {
  const gender = GENDERS.has(input.gender) ? input.gender : "female";
  const bodyType = BODY_TYPES.has(input.bodyType) ? input.bodyType : "balanced";
  const ageRange = AGE_RANGES.has(input.ageRange) ? input.ageRange : "25-35";
  const hairStyle = HAIR_STYLES.has(input.hairStyle) ? input.hairStyle : "natural-loose";
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
    skinTone,
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
  if (!Array.isArray(images) || images.length !== 1) errors.push("商品套图必须上传 1 张商品图片。");
  if (!GENDERS.has(input.gender)) errors.push("模特性别参数无效。");
  if (!BODY_TYPES.has(input.bodyType)) errors.push("模特体型参数无效。");
  if (!AGE_RANGES.has(input.ageRange)) errors.push("模特年龄参数无效。");
  if (!HAIR_STYLES.has(input.hairStyle)) errors.push("模特发型参数无效。");
  if (!SKIN_TONES.has(input.skinTone)) errors.push("模特肤色参数无效。");
  if (!["white", "custom"].includes(input.backgroundMode)) errors.push("背景只能选择纯白或自定义背景。");
  if (input.backgroundMode === "custom" && (!Array.isArray(input.backgroundImages) || input.backgroundImages.length !== 1)) errors.push("选择自定义背景时必须上传 1 张背景图片。");
  if (String(input.productName || "").length > 120) errors.push("商品名称不能超过 120 个字符。");
  if (String(input.sellingPoints || "").length > 600) errors.push("商品信息不能超过 600 个字符。");
  return errors;
}

export function defaultProductSuitePrompts(input = {}) {
  const normalized = normalizeProductSuiteInput(input);
  const values = {
    productName: normalized.productName || "待识别商品",
    sellingPoints: normalized.sellingPoints || "突出商品真实材质、结构和卖点",
    gender: genderLabels[normalized.gender],
    bodyType: bodyLabels[normalized.bodyType],
    ageRange: ageLabels[normalized.ageRange],
    hairStyle: hairLabels[normalized.hairStyle],
    skinTone: skinLabels[normalized.skinTone],
    backgroundDescription: normalized.backgroundMode === "custom" ? "背景使用用户上传的统一背景图，并与整套图片保持一致。" : "背景为浅灰偏白色无缝摄影棚背景，干净柔和，没有家具、复杂装饰或明显地平线。",
    product3dBackground: normalized.backgroundMode === "custom" ? "背景使用用户上传的统一背景图，并与整套图片保持一致。" : "背景为暖米灰色 / 浅米色渐变摄影棚背景，简洁干净，没有任何其他物品。",
  };
  return Object.fromEntries(PRODUCT_SUITE_SLOTS.map(({ slot }) => [slot, renderPrompt(slot, values)]));
}

function renderPrompt(slot, values) {
  const rendered = slotTemplates[slot].replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || "");
  if (slot === "product-3d") return rendered;
  if (slot.startsWith("model-")) return `${rendered} ${NATURAL_SKIN_DIRECTION} ${MODEL_PROPORTION_DIRECTION}`;
  return rendered;
}

export function buildProductSuitePrompts(input = {}) {
  const defaults = defaultProductSuitePrompts(input);
  const custom = input.prompts && typeof input.prompts === "object" ? input.prompts : {};
  return Object.fromEntries(PRODUCT_SUITE_SLOTS.map(({ slot }) => [slot, String(custom[slot] || defaults[slot]).trim()]));
}

export function productSuiteModelProfilePrompt(input = {}) {
  const normalized = normalizeProductSuiteInput(input);
  return `当前模特配置（优先级最高）：性别为${genderLabels[normalized.gender]}，年龄为${ageLabels[normalized.ageRange]}，体型为${bodyLabels[normalized.bodyType]}，发型为${hairLabels[normalized.hairStyle]}，肤色为${skinLabels[normalized.skinTone]}。如果自定义提示词与当前模特配置冲突时，以当前模特配置为准。`;
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

export function productSuiteReferenceImages(slot, productUrl, backgroundUrl = "", frontImageUrl = "") {
  const references = [{ url: productUrl, fileName: "product-cutout.png" }];
  if (backgroundUrl) references.push({ url: backgroundUrl, fileName: "suite-background.png" });
  if (PRODUCT_SUITE_IDENTITY_DEPENDENT_SLOTS.has(slot) && frontImageUrl) references.push({ url: frontImageUrl, fileName: "model-front-identity.png" });
  return references;
}
