import assert from "node:assert/strict";
import test from "node:test";
import { canRecoverProductSuiteBackground, cutoutResultUrlForSuite } from "./productSuiteRecovery.mjs";

test("finds the completed cutout result for a product suite", () => {
  const url = cutoutResultUrlForSuite("suite-1", [
    { suiteId: "suite-1", kind: "image", slot: "cutout", status: "error", results: [] },
    { suiteId: "suite-1", kind: "image", slot: "cutout", status: "done", results: [{ url: "https://cdn.test/cutout.png" }] },
  ]);

  assert.equal(url, "https://cdn.test/cutout.png");
});

test("allows recovery only for an unfinished custom-background suite with a cutout", () => {
  const suite = {
    status: "error",
    productImageUrl: "",
    input: { backgroundMode: "custom" },
    items: [
      { slot: "product-3d", resultUrl: "" },
      { slot: "model-front", resultUrl: "" },
    ],
  };

  assert.equal(canRecoverProductSuiteBackground(suite, "https://cdn.test/cutout.png"), true);
  assert.equal(canRecoverProductSuiteBackground({ ...suite, status: "done" }, "https://cdn.test/cutout.png"), false);
  assert.equal(canRecoverProductSuiteBackground({ ...suite, input: { backgroundMode: "white" } }, "https://cdn.test/cutout.png"), false);
  assert.equal(canRecoverProductSuiteBackground({ ...suite, items: [{ slot: "product-3d", resultUrl: "https://cdn.test/result.png" }] }, "https://cdn.test/cutout.png"), false);
});
