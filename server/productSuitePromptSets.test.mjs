import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageProductSuitePromptSet,
  normalizeProductSuitePromptSet,
  productSuitePromptSetView,
  renderProductSuitePromptSet,
  resolveProductSuitePromptSelection,
  validateProductSuitePromptSetInput,
} from "./productSuitePromptSets.mjs";

const prompts = {
  "product-3d": "3d {{productName}}",
  "model-front": "front {{skinTone}} {{backgroundDescription}}",
  "model-angle": "angle {{modelIdentity}}",
  "model-back": "back {{modelIdentity}}",
};

test("prompt sets require all four valid prompts and reject unknown placeholders", () => {
  assert.deepEqual(validateProductSuitePromptSetInput({ name: "Studio", prompts }), []);
  assert.match(validateProductSuitePromptSetInput({ name: "", prompts: { ...prompts, "model-back": "" } }).join(" "), /名称|背面/);
  assert.match(validateProductSuitePromptSetInput({ name: "Studio", prompts: { ...prompts, "model-back": "{{secret}}" } }).join(" "), /变量/);
});

test("only the owner or an administrator may manage a prompt set", () => {
  const set = { id: "set-1", ownerUsername: "alice", ownerAccountId: "account-a", prompts };
  assert.equal(canManageProductSuitePromptSet(set, { username: "alice", accountId: "account-a", role: "user" }), true);
  assert.equal(canManageProductSuitePromptSet(set, { username: "alice", accountId: "different-account", role: "user" }), false);
  assert.equal(canManageProductSuitePromptSet(set, { username: "admin", accountId: "account-admin", role: "admin" }), true);
  assert.equal(productSuitePromptSetView(set, { username: "bob", accountId: "account-b", role: "user" }).canEdit, false);
});

test("prompt rendering preserves model profile context and declares required background", () => {
  const set = normalizeProductSuitePromptSet({ name: "Studio", prompts, requiresCustomBackground: true });
  const rendered = renderProductSuitePromptSet(set, {
    productName: "Jacket",
    skinTone: "natural medium skin tone",
    backgroundDescription: "Use the uploaded charcoal texture.",
    modelIdentity: "same adult model as front view",
  });
  assert.equal(rendered["product-3d"], "3d Jacket");
  assert.equal(rendered["model-front"], "front natural medium skin tone Use the uploaded charcoal texture.");
  assert.equal(rendered["model-back"], "back same adult model as front view");
  assert.equal(set.requiresCustomBackground, true);
});

test("selected prompt version is snapshotted and enforces its background requirement", () => {
  const promptSet = { id: "set-1", name: "Studio", prompts, requiresCustomBackground: true };
  const store = { get: (id) => id === "set-1" ? promptSet : null };
  const input = { promptSetId: "set-1", prompts: { "model-front": "edited front" }, backgroundMode: "custom", backgroundImages: [{ dataUrl: "data:image/png;base64,AA==" }] };
  const result = resolveProductSuitePromptSelection({ store, input, defaultPrompts: prompts, values: { productName: "Jacket" } });
  assert.equal(result.promptSetName, "Studio");
  assert.equal(result.prompts["model-front"], "edited front");
  assert.equal(result.prompts["product-3d"], "3d Jacket");
  assert.throws(() => resolveProductSuitePromptSelection({ store, input: { ...input, backgroundMode: "white", backgroundImages: [] }, defaultPrompts: prompts, values: {} }), /自定义背景/);
});
