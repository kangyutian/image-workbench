import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IMAGE2_ASPECT_RATIOS } from "./imageAspectRatios.mjs";

const appSource = readFileSync(fileURLToPath(new URL("../src/App.tsx", import.meta.url)), "utf8");

test("changing the global image ratio synchronizes idle task cards before submission", () => {
  assert.match(appSource, /function changeBatchAspectRatio\(nextAspectRatio: string\)/);
  assert.match(appSource, /aspectRatio: normalizeAspect\(task\.provider, task\.nanoModel, nextAspectRatio\)/);
  assert.match(appSource, /onChange=\{\(event\) => changeBatchAspectRatio\(event\.target\.value\)\}/);
});

test("all Image 2 aspect ratios are present and task-specific ratios stay valid", () => {
  for (const ratio of IMAGE2_ASPECT_RATIOS) {
    assert.match(appSource, new RegExp(`value: "${ratio.replace(":", "\\:")}"`));
  }
  assert.match(appSource, /aspectRatio: normalizeAspect\(task\.provider, task\.nanoModel, nextAspectRatio\)/);
});
