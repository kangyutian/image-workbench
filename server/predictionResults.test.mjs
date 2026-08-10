import assert from "node:assert/strict";
import test from "node:test";
import { mergePredictionIds, mergeResultUrls, predictionIdsFromResponse, recoveryPredictionIds } from "./predictionResults.mjs";

test("captures an immediate prediction ID even when the response also contains output data", () => {
  assert.deepEqual(predictionIdsFromResponse({ data: { id: "prediction-immediate", outputs: ["https://cdn.example/image.png"] } }), ["prediction-immediate"]);
});

test("recovers and merges every submitted prediction and result without dropping earlier data", () => {
  const task = { predictionId: "prediction-one", predictionIds: ["prediction-one", "prediction-two"], results: ["https://cdn.example/one.png"] };
  assert.deepEqual(recoveryPredictionIds(task), ["prediction-one", "prediction-two"]);
  assert.deepEqual(mergePredictionIds(["prediction-one"], { data: { id: "prediction-two" } }), ["prediction-one", "prediction-two"]);
  assert.deepEqual(mergeResultUrls(task.results, ["https://cdn.example/one.png", "https://cdn.example/two.png"]), ["https://cdn.example/one.png", "https://cdn.example/two.png"]);
});
