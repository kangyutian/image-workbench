import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_SUITE_MAX_PRODUCT_IMAGES, PRODUCT_SUITE_SLOTS, buildProductSuitePrompts, normalizeProductSuiteInput, validateProductSuiteInput } from "./productSuiteModels.mjs";
import * as productSuiteHelpers from "./productSuiteModels.mjs";

test("product suite defaults to female balanced, white background, natural hair color, Kling O3 and four prompts", () => {
  const input = normalizeProductSuiteInput({});
  assert.deepEqual({ model: input.model, nanoModel: input.nanoModel, gender: input.gender, bodyType: input.bodyType, ageRange: input.ageRange, hairStyle: input.hairStyle, hairColor: input.hairColor, skinTone: input.skinTone, modelAppearance: input.modelAppearance, backgroundMode: input.backgroundMode, aspectRatio: input.aspectRatio, resolution: input.resolution }, { model: "kling", nanoModel: "kling-image-o3-edit", gender: "female", bodyType: "balanced", ageRange: "25-35", hairStyle: "natural-loose", hairColor: "natural", skinTone: "natural", modelAppearance: "unspecified", backgroundMode: "white", aspectRatio: "4:5", resolution: "2k" });
  const prompts = buildProductSuitePrompts(input);
  assert.deepEqual(Object.keys(prompts), PRODUCT_SUITE_SLOTS.map((item) => item.slot));
  assert.deepEqual(PRODUCT_SUITE_SLOTS.map((item) => item.slot), ["product-3d", "model-front", "model-angle", "model-back"]);
  assert.deepEqual(PRODUCT_SUITE_SLOTS.map((item) => item.fileName), ["01-product-3d.jpg", "02-model-front.jpg", "03-model-angle.jpg", "04-model-back.jpg"]);
  assert.equal(Object.hasOwn(prompts, "model-scene"), false);
  assert.equal(Object.hasOwn(prompts, "product-detail"), false);
  assert.match(prompts["model-back"], /model-back|背面|背对镜头/);
  assert.match(prompts["model-front"], /女性/);
  assert.match(prompts["model-front"], /身材健康匀称、略带自然曲线感，腰臀比例自然，双腿修长/);
  assert.match(prompts["model-front"], /25至35岁/);
  assert.match(prompts["model-front"], /头发蓬松但整洁，带有轻微凌乱碎发感/);
  assert.match(prompts["model-front"], /自然真实肤色/);
  assert.match(prompts["model-front"], /用户上传的商品图片/);
  assert.match(prompts["model-angle"], /90度侧身/);
  assert.match(prompts["model-back"], /用户上传的商品图片/);
});

test("product suite keeps model appearance independent from skin tone and renders it into model prompts", () => {
  const input = normalizeProductSuiteInput({ modelAppearance: "black", skinTone: "medium" });

  assert.equal(input.modelAppearance, "black");
  assert.equal(input.skinTone, "medium");
  assert.match(buildProductSuitePrompts(input)["model-front"], /黑人或非洲裔美国人外观/);
  assert.match(productSuiteHelpers.productSuiteModelProfilePrompt(input), /不将外观类型与固定肤色绑定/);
});

test("product suite requires a description for custom model appearance", () => {
  const input = normalizeProductSuiteInput({ modelAppearance: "custom" });
  assert.ok(validateProductSuiteInput(input, [{ dataUrl: "data:image/png;base64,AA==" }]).some((error) => error.includes("自定义模特外观")));

  const withDescription = normalizeProductSuiteInput({ modelAppearance: "custom", modelAppearanceCustom: "Afro-Latina with natural curly hair" });
  assert.equal(validateProductSuiteInput(withDescription, [{ dataUrl: "data:image/png;base64,AA==" }]).length, 0);
  assert.match(buildProductSuitePrompts(withDescription)["model-front"], /Afro-Latina with natural curly hair/);
});

test("product suite accepts Image 2 and maps it to the image2 provider", () => {
  const input = normalizeProductSuiteInput({ model: "image2" });

  assert.equal(input.model, "image2");
  assert.equal(input.nanoModel, "gpt-image-2");
  assert.deepEqual(productSuiteHelpers.productSuiteImageModel(input.model), { provider: "image2", nanoModel: "gpt-image-2" });
});

test("product suite accepts GPT Image 2.5 Sunburst", () => {
  const input = normalizeProductSuiteInput({ model: "image2.5-sunburst" });

  assert.equal(input.model, "image2.5-sunburst");
  assert.deepEqual(productSuiteHelpers.productSuiteImageModel(input.model), { provider: "image2", nanoModel: "gpt-image-2.5-sunburst" });
});

test("product suite accepts independent gender and body choices and custom background", () => {
  const input = normalizeProductSuiteInput({ gender: "male", bodyType: "hourglass", backgroundMode: "custom", backgroundImages: [{ dataUrl: "data:image/png;base64,AA==" }] });
  assert.equal(validateProductSuiteInput(input, [{ dataUrl: "data:image/png;base64,AA==" }]).length, 0);
  assert.match(buildProductSuitePrompts(input)["model-front"], /男性/);
  assert.match(buildProductSuitePrompts(input)["model-front"], /沙漏曲线/);
});

test("people-facing product suite prompts include the natural skin texture direction but 3D does not", () => {
  const skinDirection = "皮肤有自然微光，画面干净但不过度精修，保留真实皮肤纹理、唇纹，自然毛孔和真实肤色过渡，不要塑料皮肤，不要明显 AI 感。";
  const prompts = buildProductSuitePrompts(normalizeProductSuiteInput({}));

  for (const [slot, prompt] of Object.entries(prompts)) {
    if (slot === "product-3d") {
      assert.equal(prompt.includes(skinDirection), false);
    } else {
      assert.ok(prompt.includes(skinDirection), `missing skin direction in prompt: ${prompt}`);
    }
  }
});

test("model profile options replace the default identity directions", () => {
  const input = normalizeProductSuiteInput({
    gender: "male",
    bodyType: "athletic",
    ageRange: "36-45",
    hairStyle: "low-ponytail",
    hairColor: "copper-red",
    skinTone: "tan",
  });
  const prompts = buildProductSuitePrompts(input);

  for (const slot of ["model-front", "model-angle", "model-back"]) {
    assert.match(prompts[slot], /36至45岁/);
    assert.match(prompts[slot], /男性/);
    assert.match(prompts[slot], /运动紧实/);
    assert.match(prompts[slot], /低马尾/);
    assert.match(prompts[slot], /红棕色|铜色/);
    assert.match(prompts[slot], /自然小麦肤色/);
  }
  assert.equal(prompts["model-front"].includes("25至35岁"), false);
  assert.equal(prompts["model-front"].includes("头发蓬松但整洁"), false);
});

test("a model reference switches all model prompts to reference-locked mode", () => {
  const input = normalizeProductSuiteInput({
    modelReferenceImage: { fileName: "model.jpg", mimeType: "image/jpeg", dataUrl: "data:image/jpeg;base64,AAAA" },
    modelReferenceAnalysis: {
      ageAppearance: "28岁左右观感",
      genderPresentation: "女性",
      face: "鹅蛋脸，五官比例自然",
      skin: "浅暖肤色，过渡自然",
      hair: { style: "肩下自然披发", length: "中长发", texture: "柔软微蓬松", color: "浅金棕色" },
      body: { silhouette: "健康匀称", shoulder: "约为头宽2倍", waistHips: "腰臀比例自然", limbs: "四肢比例协调" },
      expression: "冷静自然",
      pose: "自然站立",
      camera: "正面棚拍",
    },
  });
  const prompts = buildProductSuitePrompts(input);

  for (const slot of ["model-front", "model-angle", "model-back"]) {
    assert.match(prompts[slot], /模特参考图为人物唯一身份与外观来源/);
    assert.match(prompts[slot], /不得复制模特参考图中的服装/);
    assert.match(prompts[slot], /28岁左右观感/);
    assert.match(prompts[slot], /浅金棕色/);
    assert.equal(prompts[slot].includes("体型为身材健康匀称、略带自然曲线感"), false);
  }
  assert.equal(prompts["product-3d"].includes("模特参考图"), false);
});

test("selected hair color is validated and rendered into model prompts", () => {
  const input = normalizeProductSuiteInput({ hairColor: "blonde" });
  assert.equal(validateProductSuiteInput(input, [{ dataUrl: "data:image/png;base64,AA==" }]).length, 0);
  assert.match(buildProductSuitePrompts(input)["model-front"], /金色/);
  assert.ok(validateProductSuiteInput({ ...input, hairColor: "unknown" }, [{ dataUrl: "data:image/png;base64,AA==" }]).some((error) => error.includes("发色")));
});

test("selected model profile remains authoritative over an edited model prompt", () => {
  const input = normalizeProductSuiteInput({ ageRange: "46-55", hairStyle: "short", skinTone: "deep", bodyType: "plus" });
  assert.equal(typeof productSuiteHelpers.productSuiteGenerationPrompt, "function");
  const prompt = productSuiteHelpers.productSuiteGenerationPrompt("model-front", input, "用户补充：模特偏瘦、长发披肩、浅肤色。保持原有构图。");

  assert.match(prompt, /当前模特配置（优先级最高）/);
  assert.match(prompt, /46至55岁/);
  assert.match(prompt, /短发/);
  assert.match(prompt, /自然深肤色/);
  assert.match(prompt, /丰润偏胖/);
  assert.match(prompt, /冲突时，以当前模特配置为准/);
});

test("model prompts include the requested shoulder-to-head proportion", () => {
  const proportionDirection = "肩宽是头宽的 2 倍";
  const prompts = buildProductSuitePrompts(normalizeProductSuiteInput({}));

  for (const slot of ["model-front", "model-angle", "model-back"]) {
    assert.ok(prompts[slot].includes(proportionDirection), `missing proportion direction in ${slot}`);
  }
  assert.equal(prompts["product-3d"].includes(proportionDirection), false);
});

test("front model prompt uses the detailed fashion direction and background-specific copy", () => {
  const whitePrompt = buildProductSuitePrompts(normalizeProductSuiteInput({}))["model-front"];
  assert.match(whitePrompt, /画面中是一位年轻女性模特。模特年龄为25至35岁，体型严格按照用户选择的身材健康匀称、略带自然曲线感，腰臀比例自然，双腿修长生成。/);
  assert.match(whitePrompt, /颜色、版型、领口、肩带\/袖子结构、衣长、腰线、下摆、图案、印花位置、刺绣、纽扣、缝线、面料纹理以及整体比例/);
  assert.match(whitePrompt, /正面面对镜头站立/);
  assert.match(whitePrompt, /90年代末至2000年代初服装广告/);
  assert.equal(whitePrompt.includes("时尚内衣广告"), false);
  assert.match(whitePrompt, /背景为浅灰偏白色无缝摄影棚背景，干净柔和，没有家具、复杂装饰或明显地平线。/);

  const customPrompt = buildProductSuitePrompts(normalizeProductSuiteInput({ backgroundMode: "custom" }))["model-front"];
  assert.match(customPrompt, /背景使用用户上传的统一背景图，并与整套图片保持一致，最终合成中保持底图不变。/);
  assert.equal(customPrompt.includes("背景为纯净浅灰偏白色无缝摄影棚背景"), false);
});

test("side and back prompts lock identity to the front image and keep the product as clothing source", () => {
  const prompts = buildProductSuitePrompts(normalizeProductSuiteInput({}));

  for (const slot of ["model-angle", "model-back"]) {
    assert.match(prompts[slot], /正面图中的同一位/);
    assert.match(prompts[slot], /不重新生成或更换模特/);
    assert.match(prompts[slot], /正面成品图仅用于锁定人物身份/);
    assert.match(prompts[slot], /用户上传的商品图片是唯一的服装来源/);
    assert.match(prompts[slot], /背景为浅灰偏白色无缝摄影棚背景，干净柔和，没有家具、复杂装饰或明显地平线。/);
  }
});

test("3D product prompt uses the ghost mannequin apparel presentation", () => {
  const prompt = buildProductSuitePrompts(normalizeProductSuiteInput({}))["product-3d"];

  assert.match(prompt, /高真实感3D立体服装展示图/);
  assert.match(prompt, /只展示服装，不出现真人模特、不出现人体、不出现衣架/);
  assert.match(prompt, /Ghost Mannequin \/ Invisible Mannequin 隐形模特效果/);
  assert.match(prompt, /上传什么就生成什么，只生成参考图中明确存在的服装单品/);
  assert.match(prompt, /参考图只有上衣、背心、T恤等上装，只展示该上装/);
  assert.match(prompt, /只有在参考图明确包含上下装时，才分别展示其中实际存在的每一件服装/);
  assert.match(prompt, /颜色、领口、袖型、袖长、肩线、衣长、腰线、下摆、剪裁、缝线、包边、图案、印花、面料纹理和整体比例/);
  assert.equal(prompt.includes("服装上下装分开悬浮展示"), false);
  assert.equal(prompt.includes("下装位于画面下方"), false);
  assert.equal(prompt.includes("裤腰高度"), false);
  assert.equal(prompt.includes("裤腿长度"), false);
  assert.equal(prompt.includes("裤裆位置"), false);
  assert.match(prompt, /浅灰偏白色无缝摄影棚背景，干净柔和，没有家具、复杂装饰或明显地平线/);
  assert.equal(prompt.includes("暖米灰色 / 浅米色渐变摄影棚背景"), false);
  assert.match(prompt, /premium ecommerce product photography/);
  assert.equal(prompt.includes("皮肤有自然微光"), false);
});

test("3D product prompt locks one level front-facing view", () => {
  const prompt = buildProductSuitePrompts(normalizeProductSuiteInput({}))["product-3d"];

  assert.match(prompt, /只允许单一正面正视图/);
  assert.match(prompt, /镜头与服装正面平行，机位与服装中心基本齐平/);
  assert.match(prompt, /禁止背面、侧面、三分之二视角、斜下方45度角/);
  assert.match(prompt, /禁止俯拍、仰拍、旋转透视和多角度拼图/);
});

test("product suite no longer exposes a product detail generation slot", () => {
  const prompts = buildProductSuitePrompts(normalizeProductSuiteInput({}));

  assert.equal(productSuiteHelpers.productSuiteSlot("product-detail"), null);
  assert.equal(prompts["product-detail"], undefined);
});

test("new product suite prompts use the fixed ecommerce visual style instead of a removed style field", () => {
  const prompts = buildProductSuitePrompts({ style: "这段旧风格不应再被使用" });
  for (const prompt of Object.values(prompts)) {
    assert.equal(prompt.includes("这段旧风格不应再被使用"), false);
    if (!prompt.includes("Ghost Mannequin")) assert.match(prompt, /整体风格：高级电商摄影，真实、干净、突出商品。/);
  }
});

test("product suite generation plans the front image before identity-dependent views", () => {
  const items = PRODUCT_SUITE_SLOTS.map(({ slot }) => ({ slot, status: "queued" }));
  const plan = productSuiteHelpers.productSuiteGenerationPlan(items);

  assert.deepEqual(plan.independent.map((item) => item.slot), ["product-3d"]);
  assert.equal(plan.front.slot, "model-front");
  assert.deepEqual(plan.identityDependent.map((item) => item.slot), ["model-angle", "model-back"]);
});

test("side and back references include the completed front image as an identity anchor", () => {
  const references = productSuiteHelpers.productSuiteReferenceImages("model-angle", "product-url", "background-url", "front-url");
  assert.deepEqual(references, [
    { url: "product-url", fileName: "product-cutout.png" },
    { url: "background-url", fileName: "suite-background.png" },
    { url: "front-url", fileName: "model-front-identity.png" },
  ]);
  assert.deepEqual(productSuiteHelpers.productSuiteReferenceImages("model-front", "product-url", "background-url", "front-url"), [
    { url: "product-url", fileName: "product-cutout.png" },
    { url: "background-url", fileName: "suite-background.png" },
  ]);
});

test("product suite accepts multiple product references up to ten images", () => {
  const input = normalizeProductSuiteInput({});
  const validImages = Array.from({ length: PRODUCT_SUITE_MAX_PRODUCT_IMAGES }, (_, index) => ({ dataUrl: `data:image/png;base64,${index + 1}` }));

  assert.deepEqual(validateProductSuiteInput(input, validImages), []);
  assert.ok(validateProductSuiteInput(input, [...validImages, { dataUrl: "data:image/png;base64,11" }]).some((error) => error.includes("最多上传 10 张")));
});

test("product suite passes all available product references into image generation", () => {
  const references = productSuiteHelpers.productSuiteReferenceImages("product-3d", "product-cutout-url", "", "", "", ["product-front-url", "product-side-url"]);

  assert.deepEqual(references, [
    { url: "product-cutout-url", fileName: "product-cutout.png" },
    { url: "product-front-url", fileName: "product-reference-1.png" },
    { url: "product-side-url", fileName: "product-reference-2.png" },
  ]);
});

test("product suite keeps generated reference requests within the ten-image provider limit", () => {
  const references = productSuiteHelpers.productSuiteReferenceImages("model-back", "product-cutout-url", "background-url", "front-url", "model-reference-url", Array.from({ length: 10 }, (_, index) => `product-${index + 1}-url`));

  assert.equal(references.length, 10);
  assert.equal(references[0].fileName, "product-cutout.png");
  assert.equal(references[6].fileName, "product-reference-6.png");
  assert.equal(references[6].url, "product-6-url");
  assert.equal(references.at(-1).fileName, "model-front-identity.png");
});

test("all model views receive the uploaded model reference while 3D stays clothing-only", () => {
  assert.deepEqual(productSuiteHelpers.productSuiteReferenceImages("model-front", "product-url", "", "", "model-reference-url"), [
    { url: "product-url", fileName: "product-cutout.png" },
    { url: "model-reference-url", fileName: "model-reference.png" },
  ]);
  assert.deepEqual(productSuiteHelpers.productSuiteReferenceImages("model-back", "product-url", "", "front-url", "model-reference-url"), [
    { url: "product-url", fileName: "product-cutout.png" },
    { url: "model-reference-url", fileName: "model-reference.png" },
    { url: "front-url", fileName: "model-front-identity.png" },
  ]);
  assert.deepEqual(productSuiteHelpers.productSuiteReferenceImages("product-3d", "product-url", "", "", "model-reference-url"), [
    { url: "product-url", fileName: "product-cutout.png" },
  ]);
});

test("retrying the front image requeues the whole three-view identity group", () => {
  const items = [
    { slot: "product-3d", status: "done" },
    { slot: "model-front", status: "queued" },
    { slot: "model-angle", status: "queued" },
    { slot: "model-back", status: "queued" },
  ];
  const plan = productSuiteHelpers.productSuiteGenerationPlan(items, "model-front");

  assert.deepEqual(plan.independent, []);
  assert.equal(plan.front.slot, "model-front");
  assert.deepEqual(plan.identityDependent.map((item) => item.slot), ["model-angle", "model-back"]);
});

test("product suite rejects missing product or required custom background", () => {
  assert.ok(validateProductSuiteInput(normalizeProductSuiteInput({}), []).length > 0);
  assert.ok(validateProductSuiteInput(normalizeProductSuiteInput({ backgroundMode: "custom" }), [{ dataUrl: "data:image/png;base64,AA==" }]).some((error) => error.includes("背景")));
});
