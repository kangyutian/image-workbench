import type { CreateProductSuiteInput, ProductSuite, ProductSuiteSlot } from "../productSuiteTypes";

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
export async function getProductSuite(id: string) { return (await request(`/workbench/product-suites/${encodeURIComponent(id)}`)).suite as ProductSuite; }
export async function updateProductSuitePrompts(id: string, prompts: Partial<Record<ProductSuiteSlot, string>>) {
  return (await request(`/workbench/product-suites/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompts }) })).suite as ProductSuite;
}
export async function retryProductSuiteItem(id: string, slot: ProductSuiteSlot) { return (await request(`/workbench/product-suites/${encodeURIComponent(id)}/retry/${encodeURIComponent(slot)}`, { method: "POST" })).suite as ProductSuite; }
export async function deleteProductSuite(id: string) { await request(`/workbench/product-suites/${encodeURIComponent(id)}`, { method: "DELETE" }); }
export function productSuiteZipUrl(id: string) { return `/workbench/product-suites/${encodeURIComponent(id)}/download.zip`; }
