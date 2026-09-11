import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appSource = readFileSync(fileURLToPath(new URL("../src/App.tsx", import.meta.url)), "utf8");
const expectedImage2Ratios = ["1:1", "1:2", "2:1", "1:3", "3:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "9:21", "21:9"];

test("Image 2 UI exposes all supported aspect-ratio presets", () => {
  const block = appSource.match(/const image2AspectOptions = \[[\s\S]*?\];/)?.[0];
  assert.ok(block, "Image 2 aspect-ratio option block is missing");
  for (const ratio of expectedImage2Ratios) assert.match(block, new RegExp(`value: "${ratio.replace(":", "\\:")}"`));
  assert.match(appSource, /if \(provider === "image2"\) return image2AspectOptions;/);
});
