import assert from "node:assert/strict";
import test from "node:test";
import { mergePredictionIds, mergeResultUrls, predictionIdsFromResponse, recoveryPredictionIds, reconcileRecoveryResults } from "./predictionResults.mjs";

test("captures an immediate prediction ID even when the response also contains output data", () => {
  assert.deepEqual(predictionIdsFromResponse({ data: { id: "prediction-immediate", outputs: ["https://cdn.example/image.png"] } }), ["prediction-immediate"]);
});

test("recovers and merges every submitted prediction and result without dropping earlier data", () => {
  const task = { predictionId: "prediction-one", predictionIds: ["prediction-one", "prediction-two"], results: ["https://cdn.example/one.png"] };
  assert.deepEqual(recoveryPredictionIds(task), ["prediction-one", "prediction-two"]);
  assert.deepEqual(mergePredictionIds(["prediction-one"], { data: { id: "prediction-two" } }), ["prediction-one", "prediction-two"]);
  assert.deepEqual(mergeResultUrls(task.results, ["https://cdn.example/one.png", "https://cdn.example/two.png"]), ["https://cdn.example/one.png", "https://cdn.example/two.png"]);
});

test("keeps fulfilled recovery results when another prediction fails", () => {
  const result = reconcileRecoveryResults(
    [{ url: "https://cdn.example/existing.png" }],
    [
      { status: "fulfilled", value: ["https://cdn.example/recovered.png"] },
      { status: "rejected", reason: new Error("prediction failed") },
    ],
  );
  assert.deepEqual(result.urls, ["https://cdn.example/existing.png", "https://cdn.example/recovered.png"]);
  assert.equal(result.status, "error");
  assert.equal(result.failedCount, 1);
  assert.equal(result.error, "One or more predictions failed during recovery.");
});
