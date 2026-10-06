import type { CreateProductSuiteInput, ProductSuite, ProductSuiteMedia, ProductSuitePromptPreviewInput, ProductSuitePromptSet, ProductSuiteSlot } from "../productSuiteTypes";

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || `API request failed with ${response.status}`);
  return body;
}

export async function createProductSuite(input: CreateProductSuiteInput) {
  return (await request("/workbench/product-suites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).suite as ProductSuite;
}
export async function loadProductSuites() { return ((await request("/workbench/product-suites")).suites || []) as ProductSuite[]; }
export async function loadProductSuitePromptSets() { return ((await request("/workbench/product-suite-prompt-sets")).promptSets || []) as ProductSuitePromptSet[]; }
export async function previewProductSuitePrompts(promptSetId: string, input: ProductSuitePromptPreviewInput) {
  const result = await request("/workbench/product-suite-prompt-sets/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ promptSetId, input }) });
  return result as { promptSetId: string; promptSetName: string; requiresCustomBackground: boolean; prompts: Record<ProductSuiteSlot, string> };
}
export async function createProductSuitePromptSet(input: Pick<ProductSuitePromptSet, "name" | "prompts" | "requiresCustomBackground">) {
  return (await request("/workbench/product-suite-prompt-sets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).promptSet as ProductSuitePromptSet;
}
export async function updateProductSuitePromptSet(id: string, input: Pick<ProductSuitePromptSet, "name" | "prompts" | "requiresCustomBackground">) {
  return (await request(`/workbench/product-suite-prompt-sets/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).promptSet as ProductSuitePromptSet;
}
export async function deleteProductSuitePromptSet(id: string) { await request(`/workbench/product-suite-prompt-sets/${encodeURIComponent(id)}`, { method: "DELETE" }); }
export async function getProductSuite(id: string) { return (await request(`/workbench/product-suites/${encodeURIComponent(id)}`)).suite as ProductSuite; }
export async function updateProductSuitePrompts(id: string, prompts: Partial<Record<ProductSuiteSlot, string>>) {
  return (await request(`/workbench/product-suites/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompts }) })).suite as ProductSuite;
}
export async function retryProductSuiteItem(id: string, slot: ProductSuiteSlot) { return (await request(`/workbench/product-suites/${encodeURIComponent(id)}/retry/${encodeURIComponent(slot)}`, { method: "POST" })).suite as ProductSuite; }
export async function recoverProductSuiteBackground(id: string, backgroundImage: ProductSuiteMedia) {
  return (await request(`/workbench/product-suites/${encodeURIComponent(id)}/recover-background`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ backgroundImage }) })).suite as ProductSuite;
}
export async function deleteProductSuite(id: string) { await request(`/workbench/product-suites/${encodeURIComponent(id)}`, { method: "DELETE" }); }
export function productSuiteZipUrl(id: string) { return `/workbench/product-suites/${encodeURIComponent(id)}/download.zip`; }
