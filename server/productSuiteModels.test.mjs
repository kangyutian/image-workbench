import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_SUITE_SLOTS, buildProductSuitePrompts, normalizeProductSuiteInput, validateProductSuiteInput } from "./productSuiteModels.mjs";
import * as productSuiteHelpers from "./productSuiteModels.mjs";

test("product suite defaults to female balanced, white background, Kling O3 and five prompts", () => {
  const input = normalizeProductSuiteInput({});
  assert.deepEqual({ model: input.model, nanoModel: input.nanoModel, gender: input.gender, bodyType: input.bodyType, ageRange: input.ageRange, hairStyle: input.hairStyle, skinTone: input.skinTone, backgroundMode: input.backgroundMode, aspectRatio: input.aspectRatio, resolution: input.resolution }, { model: "kling", nanoModel: "kling-image-o3-edit", gender: "female", bodyType: "balanced", ageRange: "25-35", hairStyle: "natural-loose", skinTone: "natural", backgroundMode: "white", aspectRatio: "4:5", resolution: "2k" });
  const prompts = buildProductSuitePrompts(input);
  assert.deepEqual(Object.keys(prompts), PRODUCT_SUITE_SLOTS.map((item) => item.slot));
  assert.deepEqual(PRODUCT_SUITE_SLOTS.map((item) => item.slot), ["product-3d", "model-front", "model-angle", "model-back", "product-detail"]);
  assert.deepEqual(PRODUCT_SUITE_SLOTS.map((item) => item.fileName), ["01-product-3d.jpg", "02-model-front.jpg", "03-model-angle.jpg", "04-model-back.jpg", "05-product-detail.jpg"]);
  assert.equal(Object.hasOwn(prompts, "model-scene"), false);
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
    if (slot === "product-3d" || slot === "product-detail") {
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
    skinTone: "tan",
  });
  const prompts = buildProductSuitePrompts(input);

  for (const slot of ["model-front", "model-angle", "model-back"]) {
    assert.match(prompts[slot], /36至45岁/);
    assert.match(prompts[slot], /男性/);
    assert.match(prompts[slot], /运动紧实/);
    assert.match(prompts[slot], /低马尾/);
    assert.match(prompts[slot], /自然小麦肤色/);
  }
  assert.equal(prompts["model-front"].includes("25至35岁"), false);
  assert.equal(prompts["model-front"].includes("头发蓬松但整洁"), false);
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
  assert.equal(prompts["product-detail"].includes(proportionDirection), false);
});

test("front model prompt uses the detailed fashion direction and background-specific copy", () => {
  const whitePrompt = buildProductSuitePrompts(normalizeProductSuiteInput({}))["model-front"];
  assert.match(whitePrompt, /画面中是一位年轻女性模特。模特年龄为25至35岁，体型为身材健康匀称、略带自然曲线感，腰臀比例自然，双腿修长。/);
  assert.match(whitePrompt, /颜色、版型、领口、肩带\/袖子结构、衣长、腰线、下摆、图案、印花位置、刺绣、纽扣、缝线、面料纹理以及整体比例/);
  assert.match(whitePrompt, /正面面对镜头站立/);
  assert.match(whitePrompt, /90年代末至2000年代初时尚内衣广告/);
  assert.match(whitePrompt, /背景为浅灰偏白色无缝摄影棚背景，干净柔和，没有家具、复杂装饰或明显地平线。/);

  const customPrompt = buildProductSuitePrompts(normalizeProductSuiteInput({ backgroundMode: "custom" }))["model-front"];
  assert.match(customPrompt, /背景使用用户上传的统一背景图，并与整套图片保持一致。/);
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
  assert.match(prompt, /上衣位于画面上方，下装位于画面下方，中间保留适当间距/);
  assert.match(prompt, /颜色、领口、袖型、袖长、肩线、衣长、腰线、裤腰高度、裤腿长度、剪裁、缝线、包边、图案、印花、面料纹理和整体比例/);
  assert.match(prompt, /暖米灰色 \/ 浅米色渐变摄影棚背景/);
  assert.match(prompt, /premium ecommerce product photography/);
  assert.equal(prompt.includes("皮肤有自然微光"), false);
});

test("product detail prompt requests one clothing detail close-up with the default studio background", () => {
  const prompt = buildProductSuitePrompts(normalizeProductSuiteInput({}))["product-detail"];

  assert.match(prompt, /只选择一个/);
  assert.match(prompt, /最能体现商品卖点的服装局部/);
  assert.match(prompt, /近距离商品摄影或微距特写/);
  assert.match(prompt, /禁止整件服装、多个部位拼图、分格排版、真人、人体和衣架/);
  assert.match(prompt, /浅灰偏白色无缝摄影棚背景/);
  assert.equal(prompt.includes("整体风格"), false);
  assert.equal(prompt.includes("皮肤有自然微光"), false);

  const customPrompt = buildProductSuitePrompts(normalizeProductSuiteInput({ backgroundMode: "custom" }))["product-detail"];
  assert.match(customPrompt, /用户上传的统一背景图，并与整套图片保持一致/);
  assert.equal(customPrompt.includes("浅灰偏白色无缝摄影棚背景"), false);
});

test("new product suite prompts do not inject the retired overall visual style", () => {
  const prompts = buildProductSuitePrompts({ style: "这段旧风格不应再被使用" });
  for (const prompt of Object.values(prompts)) {
    assert.equal(prompt.includes("整体风格"), false);
    assert.equal(prompt.includes("高级电商摄影，真实、干净、突出商品"), false);
  }
});

test("product suite generation plans the front image before identity-dependent views", () => {
  const items = PRODUCT_SUITE_SLOTS.map(({ slot }) => ({ slot, status: "queued" }));
  const plan = productSuiteHelpers.productSuiteGenerationPlan(items);

  assert.deepEqual(plan.independent.map((item) => item.slot), ["product-3d", "product-detail"]);
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

test("retrying the front image requeues the whole three-view identity group", () => {
  const items = [
    { slot: "product-3d", status: "done" },
    { slot: "model-front", status: "queued" },
    { slot: "model-angle", status: "queued" },
    { slot: "model-back", status: "queued" },
    { slot: "product-detail", status: "done" },
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
