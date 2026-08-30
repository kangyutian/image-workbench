export function cutoutResultUrlForSuite(suiteId, tasks = []) {
  const task = tasks.find((candidate) => candidate?.suiteId === suiteId
    && candidate?.kind === "image"
    && candidate?.slot === "cutout"
    && candidate?.status === "done");
  return task?.results?.find((result) => typeof result?.url === "string" && result.url)?.url || "";
}

export function canRecoverProductSuiteBackground(suite, productImageUrl = "") {
  const items = Array.isArray(suite?.items) ? suite.items : [];
  return suite?.status === "error"
    && suite?.input?.backgroundMode === "custom"
    && items.length > 0
    && items.every((item) => !item?.resultUrl)
    && Boolean(suite?.productImageUrl || productImageUrl);
}
