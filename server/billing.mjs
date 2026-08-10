const DEFAULT_BASE_URL = "https://api.wavespeed.ai/api/v3";
const RETRY_DELAYS_MS = [15_000, 60_000, 300_000, 1_800_000, 7_200_000, 86_400_000];

export function billingRetryDelayMs(attemptIndex) {
  const index = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, Number(attemptIndex) || 0));
  return RETRY_DELAYS_MS[index];
}

function billingItem(item, predictionIds) {
  const predictionId = String(item?.prediction?.uuid || "");
  const uuid = String(item?.uuid || "");
  const price = Number(item?.price);
  if (item?.billing_type !== "deduct" || !uuid || !predictionIds.has(predictionId) || !Number.isFinite(price)) return null;
  return { uuid, predictionId, price, createdAt: item?.created_at || null };
}

export async function searchBillingRecords({ apiKey, predictionIds, fetchImpl = fetch, baseUrl = DEFAULT_BASE_URL }) {
  const ids = [...new Set((predictionIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!apiKey || ids.length === 0) return [];
  const wanted = new Set(ids);
  const records = new Map();
  const pageSize = 100;
  for (let page = 1; ; page += 1) {
    const response = await fetchImpl(`${baseUrl}/billings/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ billing_type: "deduct", prediction_uuids: ids, page, page_size: pageSize }),
    });
    if (!response.ok) throw new Error(`WaveSpeed billing search failed with HTTP ${response.status}`);
    const body = await response.json().catch(() => ({}));
    const data = body?.data || {};
    for (const item of Array.isArray(data.items) ? data.items : []) {
      const record = billingItem(item, wanted);
      if (record) records.set(record.uuid, record);
    }
    const total = Number(data.total);
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0 || !Number.isFinite(total) || page * pageSize >= total) break;
  }
  return [...records.values()];
}
