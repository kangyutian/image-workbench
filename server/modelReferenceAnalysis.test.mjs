import assert from "node:assert/strict";
import test from "node:test";
import { analyzeModelReferenceImage, buildModelReferencePrompt, modelReferenceAnalysisConfig, parseModelReferenceAnalysis } from "./modelReferenceAnalysis.mjs";

const analysisPayload = {
  ageAppearance: "25至35岁",
  genderPresentation: "女性",
  face: "椭圆脸，五官比例自然，眉眼清晰",
  skin: "自然浅肤色，肤色过渡均匀",
  hair: { style: "自然披发", length: "齐肩", texture: "轻微蓬松", color: "浅金色" },
  body: { silhouette: "健康匀称、略带自然曲线", shoulder: "肩宽与头宽比例自然", waistHips: "腰臀比例自然", limbs: "四肢比例匀称" },
  expression: "冷静自然",
  pose: "正面站立",
  camera: "棚拍正面半身视角",
};

test("Sol analysis uses the WaveSpeed OpenAI-compatible vision endpoint and keeps the key out of output", async () => {
  const calls = [];
  const result = await analyzeModelReferenceImage("data:image/jpeg;base64,AAAA", {
    apiKey: "secret-test-key",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(analysisPayload) } }], usage: { prompt_tokens: 12, completion_tokens: 34 } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(calls[0].url, "https://llm.wavespeed.ai/v1/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret-test-key");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "openai/gpt-5.6-sol");
  assert.equal(body.response_format.type, "json_object");
  assert.equal(body.messages[1].content[1].type, "image_url");
  assert.equal(body.messages[1].content[1].image_url.url, "data:image/jpeg;base64,AAAA");
  assert.deepEqual(result.analysis, analysisPayload);
  assert.deepEqual(result.usage, { prompt_tokens: 12, completion_tokens: 34 });
  assert.equal(JSON.stringify(result).includes("secret-test-key"), false);
});

test("Sol analysis rejects a non-JSON response", () => {
  assert.throws(() => parseModelReferenceAnalysis("not-json"), /人物参考分析结果不是有效的 JSON/);
});

test("reference analysis prompt includes visible traits and explicitly excludes product clothing", () => {
  const prompt = buildModelReferencePrompt(analysisPayload);

  assert.match(prompt, /人物唯一身份与外观来源/);
  assert.match(prompt, /浅金色/);
  assert.match(prompt, /健康匀称、略带自然曲线/);
  assert.match(prompt, /正面站立/);
  assert.match(prompt, /棚拍正面半身视角/);
  assert.match(prompt, /不得复制模特参考图中的服装/);
});

test("analysis configuration exposes the Sol model without exposing credentials", () => {
  assert.deepEqual(modelReferenceAnalysisConfig(), {
    baseUrl: "https://llm.wavespeed.ai/v1",
    endpoint: "https://llm.wavespeed.ai/v1/chat/completions",
    model: "openai/gpt-5.6-sol",
  });
});
