import test from "node:test";
import assert from "node:assert/strict";
import { fetchWithRetry, isTransientFetchError } from "./wavespeedTransport.mjs";

test("retries a safe GET after a transient network failure", async () => {
  let calls = 0;
  const waits = [];
  const response = await fetchWithRetry("https://api.example/result", { method: "GET" }, {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return new Response("ok", { status: 200 });
    },
    sleepImpl: async (ms) => waits.push(ms),
    maxAttempts: 3,
    baseDelayMs: 25,
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [25]);
});

test("does not retry task submission POST requests by default", async () => {
  let calls = 0;
  await assert.rejects(
    fetchWithRetry("https://api.example/generate", { method: "POST" }, {
      fetchImpl: async () => {
        calls += 1;
        throw new TypeError("fetch failed");
      },
      sleepImpl: async () => {},
      maxAttempts: 3,
    }),
    (error) => error?.message === "fetch failed",
  );
  assert.equal(calls, 1);
});

test("allows an explicitly safe media upload POST to retry", async () => {
  let calls = 0;
  const response = await fetchWithRetry("https://api.example/media", { method: "POST" }, {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return new Response("ok", { status: 200 });
    },
    sleepImpl: async () => {},
    retryOnNetworkError: true,
    maxAttempts: 2,
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test("recognizes native fetch transport failures", () => {
  assert.equal(isTransientFetchError(new TypeError("fetch failed")), true);
  assert.equal(isTransientFetchError(new Error("WaveSpeedAI returned 401")), false);
});
