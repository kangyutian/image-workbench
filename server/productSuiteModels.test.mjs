import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_SUITE_SLOTS, buildProductSuitePrompts, normalizeProductSuiteInput, validateProductSuiteInput } from "./productSuiteModels.mjs";

test("product suite defaults to female slim, white background, Kling O3 and six prompts", () => {
  const input = normalizeProductSuiteInput({});
  assert.deepEqual({ model: input.model, nanoModel: input.nanoModel, gender: input.gender, bodyType: input.bodyType, backgroundMode: input.backgroundMode, aspectRatio: input.aspectRatio, resolution: input.resolution }, { model: "kling", nanoModel: "kling-image-o3-edit", gender: "female", bodyType: "slim", backgroundMode: "white", aspectRatio: "4:5", resolution: "2k" });
  const prompts = buildProductSuitePrompts(input);
  assert.deepEqual(Object.keys(prompts), PRODUCT_SUITE_SLOTS.map((item) => item.slot));
  assert.deepEqual(PRODUCT_SUITE_SLOTS.map((item) => item.slot), ["product-3d", "model-front", "model-angle", "model-back", "model-scene", "product-detail"]);
  assert.deepEqual(PRODUCT_SUITE_SLOTS.map((item) => item.fileName), ["01-product-3d.jpg", "02-model-front.jpg", "03-model-angle.jpg", "04-model-back.jpg", "05-model-scene.jpg", "06-product-detail.jpg"]);
  assert.match(prompts["model-back"], /model-back|背面|背对镜头/);
  assert.match(prompts["model-front"], /女性/);
  assert.match(prompts["model-front"], /偏瘦/);
});

test("product suite accepts independent gender and body choices and custom background", () => {
  const input = normalizeProductSuiteInput({ gender: "male", bodyType: "hourglass", backgroundMode: "custom", backgroundImages: [{ dataUrl: "data:image/png;base64,AA==" }] });
  assert.equal(validateProductSuiteInput(input, [{ dataUrl: "data:image/png;base64,AA==" }]).length, 0);
  assert.match(buildProductSuitePrompts(input)["model-front"], /男性/);
  assert.match(buildProductSuitePrompts(input)["model-front"], /身体曲线好/);
});

test("product suite rejects missing product or required custom background", () => {
  assert.ok(validateProductSuiteInput(normalizeProductSuiteInput({}), []).length > 0);
  assert.ok(validateProductSuiteInput(normalizeProductSuiteInput({ backgroundMode: "custom" }), [{ dataUrl: "data:image/png;base64,AA==" }]).some((error) => error.includes("背景")));
});
