import assert from "node:assert/strict";
import test from "node:test";
import {
  cutoutEnvKey,
  cutoutEndpointFor,
  cutoutModelInfo,
  cutoutPayloadFor,
  normalizeCutoutInput,
  validateCutoutInput,
} from "./cutoutModels.mjs";

test("describes the Bria extract-object model", () => {
  assert.deepEqual(cutoutModelInfo(), {
    id: "bria-extract-object",
    endpoint: "bria/extract-object",
    priceUsd: 0.02,
  });
  assert.equal(cutoutEnvKey(), "WAVESPEED_BRIA_EXTRACT_OBJECT_KEY");
});

test("normalizes a product cutout request", () => {
  assert.deepEqual(normalizeCutoutInput({ backgroundMode: "white", autocrop: true }), {
    kind: "cutout",
    prompt: "main product",
    backgroundMode: "white",
    forceBackgroundRemoval: true,
    autocrop: true,
  });
});

test("validates exactly one input image and a supported background mode", () => {
  assert.deepEqual(validateCutoutInput({ prompt: "red handbag", backgroundMode: "transparent" }, [{ id: "one" }]), []);
  assert.deepEqual(validateCutoutInput({ prompt: "", backgroundMode: "transparent" }, []), ["产品抠图需要 1 张输入图片。"]);
  assert.deepEqual(validateCutoutInput({ prompt: "red handbag", backgroundMode: "blue" }, [{ id: "one" }]), ["背景模式只能选择透明底或白底。"]);
  assert.deepEqual(validateCutoutInput({ prompt: "", backgroundMode: "transparent" }, [{ id: "one" }, { id: "two" }]), ["每个抠图任务只能包含 1 张输入图片。"]);
});

test("builds the WaveSpeed payload without exposing the background UI field", () => {
  assert.deepEqual(cutoutPayloadFor({ prompt: "red handbag", forceBackgroundRemoval: false, autocrop: true }, "https://files.example/product.png"), {
    image: "https://files.example/product.png",
    prompt: "red handbag",
    force_background_removal: false,
    autocrop: true,
  });
});

test("uses Bria remove-background when a real white background is requested", () => {
  assert.equal(cutoutEndpointFor({ backgroundMode: "white" }), "bria/remove-background");
  assert.deepEqual(cutoutPayloadFor({ backgroundMode: "white" }, "https://files.example/product.png"), {
    image: "https://files.example/product.png",
    preserve_alpha: false,
  });
});
