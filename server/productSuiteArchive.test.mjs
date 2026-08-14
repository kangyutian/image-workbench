import assert from "node:assert/strict";
import test from "node:test";
import { createZipArchive } from "./productSuiteArchive.mjs";

test("zip archive contains only completed suite image files with safe names", async () => {
  const archive = await createZipArchive([
    { name: "01-product-3d.jpg", url: "data:image/jpeg;base64,ZmFrZQ==" },
    { name: "../secret.txt", url: "data:text/plain;base64,c2VjcmV0" },
    { name: "02-model-front.jpg", url: "data:image/jpeg;base64,ZnJvbnQ=" },
    { name: "03-model-angle.jpg", url: "data:image/jpeg;base64,YW5nbGU=" },
    { name: "04-model-back.jpg", url: "data:image/jpeg;base64,YmFjaw==" },
    { name: "05-model-scene.jpg", url: "data:image/jpeg;base64,c2NlbmU=" },
    { name: "06-product-detail.jpg", url: "data:image/jpeg;base64,ZGV0YWls" },
  ]);
  const text = archive.toString("latin1");
  assert.match(text, /01-product-3d\.jpg/);
  assert.match(text, /04-model-back\.jpg/);
  assert.match(text, /05-model-scene\.jpg/);
  assert.match(text, /06-product-detail\.jpg/);
  assert.doesNotMatch(text, /secret\.txt/);
});
