import { randomUUID } from "node:crypto";
import { PRODUCT_SUITE_SLOTS } from "./productSuiteModels.mjs";

export const SYSTEM_PRODUCT_SUITE_PROMPT_SET_ID = "system-default";
export const MAX_PRODUCT_SUITE_PROMPT_LENGTH = 16000;

const promptSlots = new Set(PRODUCT_SUITE_SLOTS.map(({ slot }) => slot));
const allowedTokens = new Set([
  "productName", "sellingPoints", "gender", "bodyType", "ageRange", "hairStyle", "hairColor",
  "skinTone", "modelAppearance", "modelProfile", "modelIdentity", "backgroundDescription",
]);

export function validateProductSuitePromptSetInput(input = {}) {
  const errors = [];
  const name = String(input.name || "").trim();
  if (!name) errors.push("请填写提示词版本名称。");
  else if (name.length > 60) errors.push("提示词版本名称不能超过 60 个字符。");
  if (!input.prompts || typeof input.prompts !== "object" || Array.isArray(input.prompts)) {
    errors.push("请提供四个画面的提示词。");
    return errors;
  }
  for (const { slot, label } of PRODUCT_SUITE_SLOTS) {
    const prompt = input.prompts[slot];
    if (typeof prompt !== "string" || !prompt.trim()) errors.push(`请填写“${label}”提示词。`);
    else if (prompt.length > MAX_PRODUCT_SUITE_PROMPT_LENGTH) errors.push(`“${label}”提示词不能超过 ${MAX_PRODUCT_SUITE_PROMPT_LENGTH} 个字符。`);
    else {
      const tokens = [...prompt.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1]);
      const unknown = tokens.find((token) => !allowedTokens.has(token));
      if (unknown) errors.push(`提示词包含不支持的变量：{{${unknown}}}。`);
    }
  }
  return errors;
}

export function normalizeProductSuitePromptSet(input = {}) {
  const errors = validateProductSuitePromptSetInput(input);
  if (errors.length) throw new Error(errors[0]);
  return {
    name: String(input.name).trim(),
    prompts: Object.fromEntries(PRODUCT_SUITE_SLOTS.map(({ slot }) => [slot, String(input.prompts[slot]).trim()])),
    requiresCustomBackground: Boolean(input.requiresCustomBackground),
  };
}

export function canManageProductSuitePromptSet(promptSet, actor) {
  if (!promptSet || !actor) return false;
  if (actor.role === "admin") return true;
  return promptSet.ownerAccountId
    ? promptSet.ownerAccountId === actor.accountId
    : promptSet.ownerUsername === actor.username;
}

export function productSuitePromptSetView(promptSet, actor) {
  const canEdit = canManageProductSuitePromptSet(promptSet, actor);
  return {
    id: promptSet.id,
    name: promptSet.name,
    prompts: { ...promptSet.prompts },
    requiresCustomBackground: Boolean(promptSet.requiresCustomBackground),
    ownerUsername: promptSet.ownerUsername,
    createdAt: promptSet.createdAt,
    updatedAt: promptSet.updatedAt,
    canEdit,
    canDelete: canEdit,
  };
}

export function renderProductSuitePromptSet(promptSet, values = {}) {
  return Object.fromEntries(PRODUCT_SUITE_SLOTS.map(({ slot }) => [slot, String(promptSet.prompts[slot] || "").replace(/\{\{([^{}]+)\}\}/g, (_, key) => String(values[key] ?? ""))]));
}

export function resolveProductSuitePromptSelection({ store, input = {}, defaultPrompts, values = {}, enforceBackground = true }) {
  const id = String(input.promptSetId || SYSTEM_PRODUCT_SUITE_PROMPT_SET_ID);
  let result;
  if (id === SYSTEM_PRODUCT_SUITE_PROMPT_SET_ID) {
    const prompts = Object.fromEntries(PRODUCT_SUITE_SLOTS.map(({ slot }) => [slot, String(input.prompts?.[slot] || defaultPrompts?.[slot] || "").trim()]));
    result = { promptSetId: id, promptSetName: "系统默认", requiresCustomBackground: false, prompts };
  } else {
    const promptSet = store?.get(id);
    if (!promptSet) throw Object.assign(new Error("所选提示词版本不存在，请刷新后重新选择。"), { statusCode: 404 });
    if (enforceBackground && promptSet.requiresCustomBackground
      && (input.backgroundMode !== "custom" || !Array.isArray(input.backgroundImages) || input.backgroundImages.length !== 1)) {
      throw Object.assign(new Error("此提示词版本要求上传灰黑纹理背景，请先选择并上传 1 张自定义背景图。"), { statusCode: 400 });
    }
    const rendered = renderProductSuitePromptSet(promptSet, values);
    const prompts = Object.fromEntries(PRODUCT_SUITE_SLOTS.map(({ slot }) => [slot, String(input.prompts?.[slot] || rendered[slot] || "").trim()]));
    result = { promptSetId: promptSet.id, promptSetName: promptSet.name, requiresCustomBackground: Boolean(promptSet.requiresCustomBackground), prompts };
  }
  const invalidSlot = PRODUCT_SUITE_SLOTS.find(({ slot }) => !result.prompts[slot] || result.prompts[slot].length > MAX_PRODUCT_SUITE_PROMPT_LENGTH);
  if (invalidSlot) throw Object.assign(new Error(`“${invalidSlot.label}”提示词为空或过长，请检查提示词版本。`), { statusCode: 400 });
  return result;
}

export function productSuitePromptSetId() {
  return randomUUID();
}
