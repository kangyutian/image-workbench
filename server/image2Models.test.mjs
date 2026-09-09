import assert from "node:assert/strict";
import test from "node:test";
import { envKeyForImage2Model, image2EndpointFor, image2ModelInfo } from "./image2Models.mjs";

test("Image 2.5 Sunburst uses the WaveSpeed text and edit endpoints", () => {
  assert.equal(image2ModelInfo("gpt-image-2.5-sunburst").label, "GPT Image 2.5 Sunburst");
  assert.equal(image2EndpointFor("gpt-image-2.5-sunburst", false), "openai/gpt-image-2.5-sunburst/text-to-image");
  assert.equal(image2EndpointFor("gpt-image-2.5-sunburst", true), "openai/gpt-image-2.5-sunburst/edit");
});

test("Image 2.5 Sunburst uses a dedicated server key without changing Image 2", () => {
  assert.equal(envKeyForImage2Model("gpt-image-2.5-sunburst"), "WAVESPEED_IMAGE25_KEY");
  assert.equal(envKeyForImage2Model("gpt-image-2"), "WAVESPEED_IMAGE2_KEY");
});
