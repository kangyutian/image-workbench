const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientFetchError(error) {
  const message = String(error?.message || "").toLowerCase();
  const causeCode = String(error?.cause?.code || "").toUpperCase();
  return message === "fetch failed"
    || message.includes("networkerror")
    || ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"].includes(causeCode);
}

export async function fetchWithRetry(url, options = {}, {
  fetchImpl = fetch,
  sleepImpl = sleep,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  retryOnNetworkError,
  timeoutMs = 60_000,
} = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const retryable = retryOnNetworkError ?? SAFE_METHODS.has(method);
  const attempts = Math.max(1, Number(maxAttempts) || 1);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const requestOptions = { ...options };
      if (!requestOptions.signal && timeoutMs > 0 && typeof AbortSignal?.timeout === "function") {
        requestOptions.signal = AbortSignal.timeout(timeoutMs);
      }
      return await fetchImpl(url, requestOptions);
    } catch (error) {
      const canRetry = retryable && isTransientFetchError(error) && attempt < attempts - 1;
      if (!canRetry) throw error;
      await sleepImpl(baseDelayMs * 2 ** attempt);
    }
  }

  throw new Error("WaveSpeedAI request failed.");
}
