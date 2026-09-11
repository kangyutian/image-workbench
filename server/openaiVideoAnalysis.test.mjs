import assert from "node:assert/strict";
import test from "node:test";
import { analyzeVideoFrames } from "./openaiVideoAnalysis.mjs";

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

const validAnalysis = {
  title: "户外保温杯广告再生",
  overallScript: "以户外使用场景展示产品耐用性和便携性。",
  shots: [
    { startSeconds: 0, endSeconds: 2, sceneSummary: "手持产品特写", imagePrompt: "户外自然光下的产品特写", videoPrompt: "镜头缓慢推进" },
    { startSeconds: 2, endSeconds: 5, sceneSummary: "背包行走", imagePrompt: "山野环境中的产品展示", videoPrompt: "镜头跟随人物移动" },
    { startSeconds: 5, endSeconds: 8, sceneSummary: "使用产品", imagePrompt: "自然人物使用产品", videoPrompt: "人物自然抬手使用产品" },
  ],
};

test("sends timestamped image inputs and requests strict structured JSON", async () => {
  let request;
  const result = await analyzeVideoFrames({
    frames: [
      { timestampSeconds: 1.2, dataUrl: "data:image/jpeg;base64,AAAA" },
      { timestampSeconds: 3.4, dataUrl: "data:image/jpeg;base64,BBBB" },
    ],
    durationSeconds: 8,
    aspectRatio: "9:16",
    apiKey: "test-key",
    model: "gpt-5.6-terra",
    fetchImpl: async (_url, init) => {
      request = JSON.parse(init.body);
      return response({ output_text: JSON.stringify(validAnalysis) });
    },
  });

  assert.equal(result.shots.length, 3);
  assert.equal(result.shots[0].startSeconds, 0);
  assert.equal(request.model, "gpt-5.6-terra");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.input[0].content[1].type, "input_image");
  assert.match(request.input[0].content[0].text, /1\.2/);
  assert.equal(request.input[1].content[1].image_url, "data:image/jpeg;base64,BBBB");
});

test("rejects missing credentials and upstream authorization failures", async () => {
  await assert.rejects(
    analyzeVideoFrames({ frames: [], durationSeconds: 8, aspectRatio: "9:16", fetchImpl: async () => response({}) }),
    /未配置 OPENAI_API_KEY/,
  );
  await assert.rejects(
    analyzeVideoFrames({ frames: [{ timestampSeconds: 1, dataUrl: "data:image/jpeg;base64,AAAA" }], durationSeconds: 8, aspectRatio: "9:16", apiKey: "test-key", fetchImpl: async () => response({ error: { message: "unauthorized" } }, 401) }),
    /OpenAI 鉴权失败/,
  );
});

test("rejects malformed or invalid shot output instead of silently repairing it", async () => {
  await assert.rejects(
    analyzeVideoFrames({ frames: [{ timestampSeconds: 1, dataUrl: "data:image/jpeg;base64,AAAA" }], durationSeconds: 8, aspectRatio: "9:16", apiKey: "test-key", fetchImpl: async () => response({ output_text: "not-json" }) }),
    /结构化分析结果无效/,
  );

  const invalid = { ...validAnalysis, shots: validAnalysis.shots.slice(0, 2) };
  await assert.rejects(
    analyzeVideoFrames({ frames: [{ timestampSeconds: 1, dataUrl: "data:image/jpeg;base64,AAAA" }], durationSeconds: 8, aspectRatio: "9:16", apiKey: "test-key", fetchImpl: async () => response({ output_text: JSON.stringify(invalid) }) }),
    /3–8/,
  );
});
