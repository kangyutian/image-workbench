import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uploads video remix product media directly to the project endpoint", async () => {
  const apiSource = await readFile(new URL("../src/lib/videoRemixApi.ts", import.meta.url), "utf8");
  const serverSource = await readFile(new URL("../server.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(apiSource, /request\("\/workbench\/stage-image"/);
  assert.match(apiSource, /product-images.*JSON\.stringify\(\{ media \}\)/s);
  assert.match(serverSource, /async function handleVideoRemixProductImage[\s\S]*body\?\.media/);
});
