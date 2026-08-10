import assert from "node:assert/strict";
import test from "node:test";
import { billingRetryDelayMs, searchBillingRecords } from "./billing.mjs";

test("searches paginated fake billing responses and matches only deduction records by prediction UUID", async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const payload = JSON.parse(options.body);
    calls.push(payload);
    const body = payload.page === 1
      ? {
          data: {
            page: 1,
            total: 101,
            items: [
              { uuid: "billing-1", billing_type: "deduct", price: 0.12, prediction: { uuid: "prediction-1" } },
              { uuid: "refund-1", billing_type: "refund", price: -0.12, prediction: { uuid: "prediction-1" } },
            ],
          },
        }
      : {
          data: {
            page: 2,
            total: 101,
            items: [
              { uuid: "billing-2", billing_type: "deduct", price: 0.25, prediction: { uuid: "prediction-2" } },
              { uuid: "other", billing_type: "deduct", price: 9, prediction: { uuid: "prediction-other" } },
            ],
          },
        };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };

  const records = await searchBillingRecords({
    apiKey: "fake-billing-key",
    predictionIds: ["prediction-1", "prediction-2"],
    fetchImpl,
    baseUrl: "https://billing.example/api/v3",
  });

  assert.deepEqual(records, [
    { uuid: "billing-1", predictionId: "prediction-1", price: 0.12, createdAt: null },
    { uuid: "billing-2", predictionId: "prediction-2", price: 0.25, createdAt: null },
  ]);
  assert.deepEqual(calls, [
    { billing_type: "deduct", prediction_uuids: ["prediction-1", "prediction-2"], page: 1, page_size: 100 },
    { billing_type: "deduct", prediction_uuids: ["prediction-1", "prediction-2"], page: 2, page_size: 100 },
  ]);
});

test("uses the approved retry schedule and never exposes the billing key in errors", async () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map(billingRetryDelayMs),
    [15_000, 60_000, 300_000, 1_800_000, 7_200_000, 86_400_000],
  );

  await assert.rejects(
    () => searchBillingRecords({ apiKey: "fake-secret-key", predictionIds: ["prediction-1"], fetchImpl: async () => new Response("denied", { status: 401 }), baseUrl: "https://billing.example/api/v3" }),
    (error) => error instanceof Error && error.message === "WaveSpeed billing search failed with HTTP 401" && !error.message.includes("fake-secret-key"),
  );
});
