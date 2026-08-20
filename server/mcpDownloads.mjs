import { createHmac, timingSafeEqual } from "node:crypto";

function signature(secret, payload) {
  return createHmac("sha256", String(secret || "")).update(payload).digest("base64url");
}

export function issueDownloadToken(secret, claims, ttlMs = 15 * 60 * 1000, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...claims, exp: now + ttlMs })).toString("base64url");
  return `${payload}.${signature(secret, payload)}`;
}

export function verifyDownloadToken(secret, token, now = Date.now()) {
  const [payload, providedSignature] = String(token || "").split(".");
  if (!payload || !providedSignature) return null;
  const expectedSignature = signature(secret, payload);
  const actual = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!claims?.accountId || !claims?.kind || !claims?.id || Number(claims.exp) <= now) return null;
    const { accountId, kind, id } = claims;
    return { accountId, kind, id };
  } catch {
    return null;
  }
}
