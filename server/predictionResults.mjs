function text(value) {
  return String(value || "").trim();
}

function resultUrl(value) {
  if (typeof value === "string") return value;
  return typeof value?.url === "string" ? value.url : "";
}

export function predictionIdsFromResponse(body) {
  const id = text(body?.data?.id);
  return id ? [id] : [];
}

export function mergePredictionIds(existing = [], responseOrIds = []) {
  const incoming = Array.isArray(responseOrIds) ? responseOrIds : predictionIdsFromResponse(responseOrIds);
  return [...new Set([...existing, ...incoming].map(text).filter(Boolean))];
}

export function recoveryPredictionIds(task = {}) {
  return mergePredictionIds(task.predictionIds, task.predictionId ? [task.predictionId] : []);
}

export function mergeResultUrls(existing = [], incoming = []) {
  return [...new Set([...existing, ...incoming].map(resultUrl).filter(Boolean))];
}

export function reconcileRecoveryResults(existingResults = [], settledResults = []) {
  const fulfilled = settledResults
    .filter((result) => result?.status === "fulfilled")
    .flatMap((result) => Array.isArray(result.value) ? result.value : []);
  const failedCount = settledResults.filter((result) => result?.status === "rejected").length;
  return {
    urls: mergeResultUrls(existingResults, fulfilled),
    status: failedCount > 0 ? "error" : "done",
    failedCount,
    error: failedCount > 0 ? "One or more predictions failed during recovery." : "",
  };
}
