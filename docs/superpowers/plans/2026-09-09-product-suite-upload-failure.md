# 商品套图上传限制与失败状态 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Prevent oversized product-suite inputs from reaching the asynchronous worker and make queued suite items show the parent failure reason when setup fails.

**Architecture:** Share the strict provider byte limit through a small `shared` policy module. The browser-only suite media helper will preserve compliant files and re-encode oversized files below a safety target before the existing API request. The server-side `ProductSuiteStore` will expose one atomic helper that marks only queued suite items as failed, and the suite worker will call it from its top-level error path.

**Tech Stack:** React + TypeScript, browser FileReader/Image/Canvas APIs, Node.js ESM tests with `node:test`, existing Vite build.

## Global Constraints

- WaveSpeedAI image files must remain strictly smaller than `10 * 1024 * 1024` bytes.
- Only product-suite browser inputs are changed; ordinary image-task uploads keep their current behavior.
- Existing user changes in `server/productSuiteModels.mjs` and `server/productSuiteModels.test.mjs` must remain untouched.
- Do not change models, prompts, generation order, concurrency, API keys, `.env`, or production data.
- Failed suite children must retain `done`, `error`, and `running` states; only `queued` items are converted to `error`.

---

### Task 1: Add a shared strict image-size policy

**Files:**
- Create: `shared/imageUploadPolicy.mjs`
- Create: `shared/imageUploadPolicy.d.ts`
- Test: `server/imageUploadPolicy.test.mjs`
- Modify: `server/imageUploads.mjs:11-18`
- Test: `server/imageUploads.test.mjs:WaveSpeed image upload limit test`

**Interfaces:**
- Produces `IMAGE_UPLOAD_MAX_BYTES`, `IMAGE_UPLOAD_TARGET_BYTES`, and `needsImageCompression(size)` from `shared/imageUploadPolicy.mjs`.
- Keeps `WAVESPEED_MAX_IMAGE_BYTES` as a compatibility export from `server/imageUploads.mjs`.

- [ ] **Step 1: Write the failing policy tests**

Add tests asserting:

```js
assert.equal(IMAGE_UPLOAD_MAX_BYTES, 10 * 1024 * 1024);
assert.equal(IMAGE_UPLOAD_TARGET_BYTES, 8 * 1024 * 1024);
assert.equal(needsImageCompression(IMAGE_UPLOAD_MAX_BYTES - 1), false);
assert.equal(needsImageCompression(IMAGE_UPLOAD_MAX_BYTES), true);
assert.equal(needsImageCompression(IMAGE_UPLOAD_MAX_BYTES + 1), true);
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `node --test server/imageUploadPolicy.test.mjs`

Expected: FAIL because `shared/imageUploadPolicy.mjs` does not exist yet.

- [ ] **Step 3: Implement the shared constants and compatibility import**

Export the exact constants and predicate from the shared module, add matching declarations for TypeScript, and replace the duplicate numeric constant in `server/imageUploads.mjs` with an import/re-export.

- [ ] **Step 4: Run the focused tests**

Run: `node --test server/imageUploadPolicy.test.mjs server/imageUploads.test.mjs`

Expected: PASS, including the existing strict `< 10MB` upload test.

### Task 2: Add browser compression for product-suite media

**Files:**
- Create: `src/lib/productSuiteImageCompression.ts`
- Modify: `src/App.tsx:331-345, 518-539`
- Create: `server/productSuiteUploadUi.test.mjs`

**Interfaces:**
- Produces `prepareProductSuiteImage(file: File): Promise<ProductSuiteMedia>`.
- Uses the shared policy to leave compliant files unchanged and compress only files at or above the strict limit.
- Returns a normal `ProductSuiteMedia` object with updated `dataUrl`, `mimeType`, `fileName`, and byte `size`.

- [ ] **Step 1: Write failing UI integration assertions**

Create a static regression test that reads `src/App.tsx` and `src/lib/productSuiteImageCompression.ts` and asserts:

```js
assert.match(app, /prepareProductSuiteImage/);
assert.match(app, /files\.map\(prepareProductSuiteImage\)/);
assert.match(app, /readSuiteFile[\s\S]*prepareProductSuiteImage/);
assert.match(helper, /IMAGE_UPLOAD_TARGET_BYTES/);
assert.match(helper, /toDataURL/);
```

- [ ] **Step 2: Run the focused UI test and verify it fails**

Run: `node --test server/productSuiteUploadUi.test.mjs`

Expected: FAIL because the helper and App integration do not exist.

- [ ] **Step 3: Implement the browser helper**

Implement `prepareProductSuiteImage` with these exact behaviors:

1. Read the original file into a data URL when `file.size < IMAGE_UPLOAD_MAX_BYTES`.
2. For oversized files, load the image, cap the long edge at `4096` pixels, draw it to a canvas, and try WebP quality values `0.9`, `0.8`, `0.7`, `0.6`, and `0.5`.
3. If no result is below `IMAGE_UPLOAD_TARGET_BYTES`, reduce the canvas scale by `0.85` and retry until the output is below target or the canvas becomes invalid.
4. Return a renamed `.webp` file with the encoded byte size when WebP succeeds; otherwise throw `图片文件超过10MB，自动压缩失败，请换用 JPG、WebP 或更小的图片。`.
5. Never return a result whose byte size is greater than or equal to `IMAGE_UPLOAD_MAX_BYTES`.

- [ ] **Step 4: Wire the helper into every suite upload input**

Replace `readSuiteFile` with `prepareProductSuiteImage`, and replace `readImages(files)` inside `addSuiteImages` with `Promise.all(files.map(prepareProductSuiteImage))`. Keep ordinary image-task `readImages` unchanged. Update the suite upload copy to say files at or above 10MB are automatically compressed and show each selected file’s formatted byte size.

- [ ] **Step 5: Run the focused UI test and the TypeScript build**

Run: `node --test server/productSuiteUploadUi.test.mjs && npm.cmd run build`

Expected: PASS and a successful Vite/TypeScript build.

### Task 3: Synchronize queued suite items on parent failure

**Files:**
- Modify: `server/productSuiteStore.mjs:75-83`
- Test: `server/productSuiteStore.test.mjs`
- Modify: `server.mjs:1074-1078`

**Interfaces:**
- Produces `ProductSuiteStore.failQueuedItems(id, error)` that updates only items with `status === "queued"`, sets their `status` to `"error"`, sets the supplied error, recomputes the internal suite item status, persists once, and returns the cloned suite.

- [ ] **Step 1: Write the failing store regression test**

Add a suite with queued, done, error, and running items, call `failQueuedItems`, and assert:

```js
assert.equal(updated.items.find((item) => item.slot === "queued-slot").status, "error");
assert.equal(updated.items.find((item) => item.slot === "queued-slot").error, "upload failed");
assert.equal(updated.items.find((item) => item.slot === "done-slot").status, "done");
assert.equal(updated.items.find((item) => item.slot === "running-slot").status, "running");
```

- [ ] **Step 2: Run the focused store test and verify it fails**

Run: `node --test server/productSuiteStore.test.mjs`

Expected: FAIL because `failQueuedItems` does not exist.

- [ ] **Step 3: Implement the atomic queued-item transition**

Add `failQueuedItems` beside `patchItem`, use one timestamp for the affected items, persist the suite once, and leave non-queued items unchanged.

- [ ] **Step 4: Call it from the suite worker catch block**

Compute the existing error message once, call `productSuiteStore.failQueuedItems(suite.id, message)`, then keep the existing parent suite and parent task error updates. Do not change the child-task error handling already performed by `runSuiteImage` or cutout execution.

- [ ] **Step 5: Run focused server tests**

Run: `node --test server/productSuiteStore.test.mjs server/productSuiteModels.test.mjs server/imageUploads.test.mjs`

Expected: PASS with queued suite items now covered by regression tests.

### Task 4: Full verification and review

**Files:**
- Verify: all modified files and the existing user changes.

- [ ] **Step 1: Run the full test suite**

Run: `npm.cmd test`

Expected: zero failures.

- [ ] **Step 2: Run production validation**

Run: `npm.cmd run build; node --check server.mjs; git diff --check`

Expected: all commands exit successfully.

- [ ] **Step 3: Review the final diff**

Run: `git status --short; git diff --stat; git diff -- src/App.tsx src/lib/productSuiteImageCompression.ts server/productSuiteStore.mjs server.mjs shared server/*Upload*test.mjs`

Confirm the diff contains only the upload-size handling, queued-item failure synchronization, tests, and documentation; do not deploy until separately requested.
