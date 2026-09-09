import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("product suite uploads pass through the byte-limit compression helper", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/lib/productSuiteImageCompression.ts", import.meta.url), "utf8");

  assert.match(app, /prepareProductSuiteImage/);
  assert.match(app, /files\.map\(prepareProductSuiteImage\)/);
  assert.match(app, /readSuiteFile[\s\S]*prepareProductSuiteImage/);
  assert.match(helper, /IMAGE_UPLOAD_TARGET_BYTES/);
  assert.match(helper, /toDataURL/);
});
