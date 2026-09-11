# Video Start and End Frames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional end-frame image to supported video models while preserving the existing one-image workflow.

**Architecture:** A shared model policy defines which video models accept an end frame and the maximum reference-image count. The server validates ordered `referenceImages` and maps index 0/1 to provider-specific payload fields. The React screen keeps separate start/end frame state, uploads both concurrently, and submits them in order.

**Tech Stack:** React 18, TypeScript, Vite, Node.js ESM, Node test runner, WaveSpeed REST API.

## Global Constraints

- The first image is required and remains sufficient to create a video task.
- The second image is optional and is always the end frame.
- Seedance 2.0 Mini, Seedance 2.0, and Seedance 2.0 Fast use `last_image`.
- Kling 3.0 Standard and Kling 3.0 Pro use `end_image`.
- Grok Imagine Video v1.5 and Kling motion-control accept exactly one image.
- More than two images must be rejected; unsupported models must reject a second image rather than silently dropping it.
- Do not add reference-to-video models or change billing, authentication, or image-task behavior.

---

### Task 1: Shared video frame policy and server payload contract

**Files:**
- Create: `shared/videoFramePolicy.mjs`
- Create: `shared/videoFramePolicy.d.ts`
- Create: `server/videoFramePolicy.test.mjs`
- Modify: `server/videoModels.mjs`
- Modify: `server/videoModels.test.mjs`

**Interfaces:**
- Produces: `supportsVideoEndFrame(modelId: string): boolean`
- Produces: `maxVideoReferenceImages(modelId: string): 1 | 2`
- Consumes: ordered `referenceImages: Array<{ url: string }>` where index 0 is start and index 1 is end.

- [ ] **Step 1: Write the failing shared-policy and payload tests**

```js
test("only documented image-to-video models support an end frame", () => {
  for (const id of [
    "seedance-2-mini-image-to-video",
    "seedance-2-image-to-video",
    "seedance-2-fast-image-to-video",
    "kling-3-std-image-to-video",
    "kling-3-pro-image-to-video",
  ]) assert.equal(maxVideoReferenceImages(id), 2);
  assert.equal(maxVideoReferenceImages("grok-imagine-video-v1.5-image-to-video"), 1);
  assert.equal(maxVideoReferenceImages("kling-3-std-motion-control"), 1);
});

test("serializes optional end frames with provider-specific fields", () => {
  const refs = [{ url: "https://cdn/start.png" }, { url: "https://cdn/end.png" }];
  assert.equal(videoPayloadFor(seedanceInput(refs)).last_image, "https://cdn/end.png");
  assert.equal(videoPayloadFor(klingInput(refs)).end_image, "https://cdn/end.png");
});

test("keeps one-image payloads backward compatible", () => {
  const payload = videoPayloadFor(seedanceInput([{ url: "https://cdn/start.png" }]));
  assert.equal(payload.image, "https://cdn/start.png");
  assert.equal("last_image" in payload, false);
});

test("rejects a second image for single-image models", () => {
  const refs = [{ url: "https://cdn/start.png" }, { url: "https://cdn/end.png" }];
  assert.match(validateVideoInput(grokInput(refs))[0], /only supports one image/i);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test server/videoFramePolicy.test.mjs server/videoModels.test.mjs`

Expected: FAIL because the shared policy does not exist and payloads omit `last_image` / `end_image`.

- [ ] **Step 3: Implement the shared policy and server validation**

```js
const END_FRAME_MODELS = new Set([
  "seedance-2-mini-image-to-video",
  "seedance-2-image-to-video",
  "seedance-2-fast-image-to-video",
  "kling-3-std-image-to-video",
  "kling-3-pro-image-to-video",
]);

export function supportsVideoEndFrame(modelId) {
  return END_FRAME_MODELS.has(String(modelId || ""));
}

export function maxVideoReferenceImages(modelId) {
  return supportsVideoEndFrame(modelId) ? 2 : 1;
}
```

Update `validateVideoInput()` to require at least one image and reject counts above `maxVideoReferenceImages(model.id)`. In `videoPayloadFor()`, map `referenceImages[1]?.url` to `last_image` for Seedance models and `end_image` for Kling image-to-video models, omitting the field when no end frame exists.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test server/videoFramePolicy.test.mjs server/videoModels.test.mjs`

Expected: all focused tests PASS.

- [ ] **Step 5: Commit the server contract**

```bash
git add shared/videoFramePolicy.mjs shared/videoFramePolicy.d.ts server/videoFramePolicy.test.mjs server/videoModels.mjs server/videoModels.test.mjs
git commit -m "Add video start and end frame contract"
```

---

### Task 2: Frontend start/end frame state and upload flow

**Files:**
- Create: `server/videoFrameSelection.test.mjs`
- Modify: `shared/videoFramePolicy.mjs`
- Modify: `shared/videoFramePolicy.d.ts`
- Modify: `src/App.tsx`
- Modify: `src/lib/videoApi.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `supportsVideoEndFrame(modelId)` from Task 1.
- Produces: `orderedVideoReferences(startUrl, endUrl, modelId)` returning one or two ordered URL objects.
- Produces: video task input with ordered `referenceImages`.

- [ ] **Step 1: Write the failing ordered-selection tests**

```js
test("keeps a single start frame valid", () => {
  assert.deepEqual(orderedVideoReferences("start", "", "seedance-2-image-to-video"), [{ url: "start" }]);
});

test("includes the end frame only for supported models", () => {
  assert.deepEqual(orderedVideoReferences("start", "end", "kling-3-std-image-to-video"), [{ url: "start" }, { url: "end" }]);
  assert.deepEqual(orderedVideoReferences("start", "end", "grok-imagine-video-v1.5-image-to-video"), [{ url: "start" }]);
});
```

- [ ] **Step 2: Run the selection test and verify RED**

Run: `node --test server/videoFrameSelection.test.mjs`

Expected: FAIL because `orderedVideoReferences` is not exported.

- [ ] **Step 3: Implement ordered selection and React state**

Add to the shared policy:

```js
export function orderedVideoReferences(startUrl, endUrl, modelId) {
  const result = startUrl ? [{ url: startUrl }] : [];
  if (endUrl && supportsVideoEndFrame(modelId)) result.push({ url: endUrl });
  return result;
}
```

In `src/App.tsx`:

- Rename `videoImage` to `videoStartImage`.
- Add `videoEndImage` state.
- Clear `videoEndImage` when switching to a model without end-frame support.
- Render “首帧图片（必填）” and, conditionally, “尾帧图片（可选）” dropzones with independent preview, replace, and remove controls.
- Keep “用于生成视频” assigning only `videoStartImage`.
- Upload selected frames with `Promise.all`, then build `referenceImages` in start/end order.

```ts
const [startUrl, endUrl] = await Promise.all([
  uploadVideoMedia(videoStartImage, "image", videoModel),
  videoEndImage ? uploadVideoMedia(videoEndImage, "image", videoModel) : Promise.resolve(""),
]);
const referenceImages = orderedVideoReferences(startUrl, endUrl, videoModel).map((item, index) => ({
  ...item,
  fileName: index === 0 ? videoStartImage.fileName : videoEndImage?.fileName,
}));
```

Update `VideoTask` typing so `referenceImages` remains an ordered array and document index 0/1 semantics. Add responsive CSS so both frame slots align on desktop and stack on narrow screens without overflow.

- [ ] **Step 4: Run selection tests and production build**

Run: `node --test server/videoFrameSelection.test.mjs && npm run build`

Expected: selection tests PASS and Vite build exits 0.

- [ ] **Step 5: Commit the frontend flow**

```bash
git add shared/videoFramePolicy.mjs shared/videoFramePolicy.d.ts server/videoFrameSelection.test.mjs src/App.tsx src/lib/videoApi.ts src/styles.css
git commit -m "Add optional video end frame upload"
```

---

### Task 3: Full regression, UI inspection, and release commit

**Files:**
- Modify if needed: `README.md`
- Verify: all files changed in Tasks 1–2

**Interfaces:**
- Consumes: completed server and frontend behavior.
- Produces: release-ready local `master` with clean tests and no secrets.

- [ ] **Step 1: Run the complete automated verification**

Run: `npm test && npm run build && git diff --check`

Expected: all Node tests PASS, Vite build succeeds, and `git diff --check` produces no errors.

- [ ] **Step 2: Run the secret and sensitive-file scan**

Run: `rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!dist/**' 'wsk_live_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}' .`

Expected: no matches. Confirm `git status --short` contains no `data/`, `.env`, `dist/`, archive, or credential file.

- [ ] **Step 3: Inspect the built UI locally**

Start: `npm start`

Verify in a browser:

- Supported Seedance/Kling models show both frame slots.
- Grok and motion-control show only the required image slot.
- One-frame creation remains enabled.
- Two-frame creation sends two ordered references.
- Switching to Grok clears and hides the end frame.
- Long filenames wrap inside the card and mobile layout has no horizontal overflow.

- [ ] **Step 4: Update documentation only if the UI copy needs explanation**

Add a concise README sentence: “Supported Seedance and Kling image-to-video models accept an optional end frame; Grok and motion-control remain single-image.”

- [ ] **Step 5: Commit any verification-driven fixes**

```bash
git add README.md src/App.tsx src/styles.css server/videoModels.mjs server/videoModels.test.mjs shared/videoFramePolicy.mjs shared/videoFramePolicy.d.ts
git commit -m "Polish video frame upload workflow"
```

Skip this commit when Step 3 finds no changes.

---

### Task 4: Production deployment and smoke test

**Files:**
- Deploy from: repository working tree at verified HEAD
- Preserve on server: `/home/ubuntu/image-workbench/.env`, `/home/ubuntu/image-workbench/data`, `/home/ubuntu/image-workbench/node_modules`
- Backup to: `/home/ubuntu/image-workbench-backups/`

**Interfaces:**
- Consumes: clean verified local release.
- Produces: active `image-workbench.service` serving the new UI and payload behavior.

- [ ] **Step 1: Create a recoverable server backup**

Create a timestamped tarball under `/home/ubuntu/image-workbench-backups/`, excluding `.env`, `data`, `node_modules`, and `.git`. Verify the archive exists and has non-zero size.

- [ ] **Step 2: Package and upload the verified release**

Create a release archive excluding `.git`, `.env*`, `data`, `node_modules`, generated TypeScript build-info files, deploy archives, and test fixtures. Inspect its file list for credential or data paths before upload.

- [ ] **Step 3: Replace only application code and restart**

Resolve `/home/ubuntu/image-workbench` to its exact path, preserve `.env`, `data`, and `node_modules`, extract the release, run `node --check server.mjs`, then execute:

```bash
sudo -n systemctl daemon-reload
sudo -n systemctl restart image-workbench.service
systemctl is-active image-workbench.service
```

Expected: `active`.

- [ ] **Step 4: Run production smoke tests**

Verify:

- `https://nxtnumber.com/image-workbench/` returns HTTP 200.
- Unauthenticated `/image-workbench/admin/usage` returns HTTP 401.
- Server journal contains a fresh “listening” line and no startup error.
- Deployed `server.mjs` contains the shared end-frame payload integration.
- Existing systemd WaveSpeed key drop-in remains root-owned and mode `0600` without printing values.

- [ ] **Step 5: Report release and rollback information**

Report deployed commit, test count, service state, public smoke-test results, and exact backup archive path. Do not claim real video generation succeeded unless a real one-frame and two-frame task were submitted and completed.
