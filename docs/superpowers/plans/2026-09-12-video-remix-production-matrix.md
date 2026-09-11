# Video Remix Production Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-ready “视频再生” module that accepts a video of 20 seconds or less, analyzes its visual structure with GPT, lets the user edit and approve a storyboard using up to five product references, generates each storyboard image with Image2 or Nano Banana, and generates a separate five-second Kling or Seedance clip from every approved image.

**Architecture:** Introduce a persisted `VideoRemixProject` aggregate whose shots form the workflow state machine. A dedicated upload/probe/frame-extraction path keeps large video bytes out of JSON, an OpenAI Responses adapter turns sampled frames into strict structured output, and the existing image/video task scheduler performs paid generation while project-level orchestration mirrors child task results back into each shot. The frontend is a focused `VideoRemixWorkspace` that implements the selected Product Design “分镜生产矩阵” inside the existing `image ai -- ice` shell.

**Tech Stack:** React 18, TypeScript, Vite, Node.js ESM HTTP server, Node test runner, existing WaveSpeed image/video adapters, OpenAI Responses API, `ffmpeg-static`, `ffprobe-static`, Lucide React, CSS.

## Global Constraints

- Source videos must be MP4, WebM, or MOV and no longer than 20.0 seconds; validate in the browser for fast feedback and again on the server as the authority.
- Analyze visuals only. Do not transcribe, copy, retain, or regenerate the source video's audio.
- GPT must return one overall script plus 3–8 ordered shots. Each shot includes timing, scene summary, image prompt, and video-motion prompt.
- The output recreates structure, pacing, and marketing logic with the user's product; it must not copy source branding, faces, copyrighted text, or unrelated products.
- The user must explicitly choose `9:16`, `16:9`, or `1:1`; do not infer the output ratio from the source video.
- Product references are optional during analysis but required before storyboard generation; accept 1–5 images and treat the first as primary.
- One image model and one video model apply to the whole project. Image choices are Image2 and Nano Banana families already present in the application. Video choices are Seedance image-to-video and Kling image-to-video only.
- Every generated clip is fixed at five seconds. Return separate clips only; do not stitch clips into one video.
- Users can edit script and prompts, add/delete/reorder shots while keeping 3–8 shots, regenerate one storyboard image, approve images individually, and retry one failed video clip.
- Editing an approved shot prompt invalidates that shot's image approval and any downstream video result; editing script structure invalidates all generated storyboard and video state after explicit confirmation.
- Source video, extracted keyframes, product references, and project records live for the project lifetime and are deleted when the project is deleted.
- Private staged paths and OpenAI/WaveSpeed credentials must never appear in public API responses, browser bundles, logs, or persisted frontend state.
- Read `OPENAI_API_KEY` only from the server environment. Read `OPENAI_VIDEO_ANALYSIS_MODEL`, defaulting to `gpt-5.6-terra`; surface a clear configuration error if the account cannot use that model.
- Match the selected option 3 visual: deep navy sidebar, cyan active state, six-step progress header, compact project settings row, dense shot matrix, inline expanded product-reference panel, sticky approval footer.
- Use TDD for every behavior: add one focused test, run it and confirm the expected failure, implement the minimum code, rerun the focused test, then run the full suite before committing.

## Approved Execution Decisions

- Product reference images are uploaded during the script-review step, after GPT analysis and before storyboard generation.
- Implement the full V1 workflow in one pass, including script editing, shot add/delete/reorder, per-shot storyboard approval/retry, and independent video retry/download.
- Validate locally first. Production deployment and the real provider happy path are separate follow-up work after server credentials are confirmed.

## Implementation Checkpoint

- Domain state, owner-scoped persistence, upload/probe/frame extraction, OpenAI analysis adapter, task orchestration, authenticated routes, browser API, workbench integration, and the selected production-matrix UI are implemented in the current worktree.
- Local verification currently covers 187 automated tests, a production build, authenticated create/get/delete route smoke tests, and a real 2-second MP4 upload/probe smoke test.
- The Product Design comparison remains a local QA checkpoint: the in-app browser is currently exposing a 666 × 794 viewport, while the selected reference is 1440 × 1024 and represents a populated matrix state. Do not treat the visual handoff as complete until that same-size populated-state comparison is captured.

---

## File Map

**Create**

- `shared/videoRemixModels.mjs` — canonical statuses, model allowlists, normalization, validation, public serialization, and invalidation rules.
- `server/videoRemixStore.mjs` — atomic JSON persistence and owner-scoped CRUD for projects and shots.
- `server/videoRemixUploads.mjs` — authenticated streaming upload, size/MIME enforcement, exact-path cleanup, and project media layout.
- `server/videoProbe.mjs` — ffprobe duration/dimensions and ffmpeg visual-frame extraction.
- `server/openaiVideoAnalysis.mjs` — OpenAI Responses request, strict schema, response parsing, and error mapping.
- `server/videoRemixOrchestrator.mjs` — project transitions, child image/video task creation, result synchronization, restart recovery.
- `src/videoRemixTypes.ts` — browser-safe project and shot contracts.
- `src/lib/videoRemixApi.ts` — typed browser API including raw-file streaming upload.
- `src/VideoRemixWorkspace.tsx` — upload, analysis review, matrix approval, generation, retry, and download UI.
- `server/videoRemixModels.test.mjs`
- `server/videoRemixStore.test.mjs`
- `server/videoRemixUploads.test.mjs`
- `server/videoProbe.test.mjs`
- `server/openaiVideoAnalysis.test.mjs`
- `server/videoRemixOrchestrator.test.mjs`
- `server/videoRemixApi.test.mjs`
- `server/videoRemixUi.test.mjs`
- `design-qa.md` — visual comparison log required by the Product Design workflow.

**Modify**

- `package.json` and lockfile — add pinned ffmpeg/ffprobe binary packages.
- `server.mjs:1-70` — initialize project store, media roots, analysis worker, and orchestration dependencies.
- `server.mjs:1288-1365` — synchronize existing image/video child task completions into remix shots.
- `server.mjs:1884-2055` — register authenticated remix routes before static serving.
- `src/App.tsx:1-25` — import the new workspace.
- `src/App.tsx:1192-1212` — add `remix` to the creation mode and navigation.
- `src/App.tsx:1218-1692` — render `VideoRemixWorkspace` as an isolated module rather than adding more inline JSX.
- `src/styles.css` — add `creation-remix` layout and matrix styles using existing brand tokens.
- `.env.example` — document OpenAI analysis configuration without secrets.
- `README.md` — document system dependencies, workflow, storage, and operating checks.

---

### Task 1: Define the project state machine and validation contract

**Files:**
- Create: `shared/videoRemixModels.mjs`
- Create: `server/videoRemixModels.test.mjs`

**Interfaces:**
- Produces: `VIDEO_REMIX_LIMITS`, `VIDEO_REMIX_IMAGE_MODELS`, `VIDEO_REMIX_VIDEO_MODELS`, `normalizeVideoRemixSettings(input)`, `validateVideoRemixDraft(input)`, `recomputeVideoRemixStatus(shots)`, `invalidateShotAfterPromptEdit(shot)`, `publicVideoRemixProject(project)`.

- [ ] **Step 1: Write failing normalization and allowlist tests**

```js
test("normalizes a remix to explicit supported project-wide settings", () => {
  assert.deepEqual(normalizeVideoRemixSettings({
    aspectRatio: "9:16",
    imageModelId: "gpt-image-2.5-sunburst",
    videoModelId: "seedance-2-fast-image-to-video",
  }), {
    aspectRatio: "9:16",
    imageModelId: "gpt-image-2.5-sunburst",
    videoModelId: "seedance-2-fast-image-to-video",
    clipDuration: 5,
  });
});

test("rejects motion control and non-five-second remix output", () => {
  assert.match(validateVideoRemixDraft({
    aspectRatio: "9:16",
    imageModelId: "gpt-image-2.5-sunburst",
    videoModelId: "kling-3-std-motion-control",
    clipDuration: 10,
  })[0], /仅支持 Kling 或 Seedance 图生视频/);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the module does not exist**

Run: `node --test server/videoRemixModels.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `shared/videoRemixModels.mjs`.

- [ ] **Step 3: Implement constants, normalization, status precedence, and public serialization**

```js
export const VIDEO_REMIX_LIMITS = Object.freeze({
  maxVideoBytes: 100 * 1024 * 1024,
  maxDurationSeconds: 20,
  minShots: 3,
  maxShots: 8,
  maxProductImages: 5,
  clipDuration: 5,
});

export const VIDEO_REMIX_VIDEO_MODELS = new Set([
  "seedance-2-mini-image-to-video",
  "seedance-2-fast-image-to-video",
  "seedance-2-image-to-video",
  "kling-3-std-image-to-video",
  "kling-3-pro-image-to-video",
]);

export function invalidateShotAfterPromptEdit(shot) {
  return {
    ...shot,
    imageStatus: shot.imageResultUrl ? "ready" : "idle",
    imageApprovedAt: null,
    videoStatus: "idle",
    videoTaskId: "",
    videoResultUrl: "",
    videoError: "",
  };
}
```

The public serializer must recursively remove `stagedPath`, `absolutePath`, upload tokens, and internal OpenAI response bodies while preserving browser-safe preview/result URLs.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test server/videoRemixModels.test.mjs && npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/videoRemixModels.mjs server/videoRemixModels.test.mjs
git commit -m "feat: define video remix workflow model"
```

### Task 2: Persist owner-scoped remix projects and shot mutations

**Files:**
- Create: `server/videoRemixStore.mjs`
- Create: `server/videoRemixStore.test.mjs`

**Interfaces:**
- Consumes: `recomputeVideoRemixStatus(shots)`.
- Produces: `VideoRemixStore.create(input)`, `.get(id)`, `.forOwner(owner)`, `.patch(id, changes)`, `.patchShot(id, shotId, changes)`, `.replaceShots(id, shots)`, `.remove(id)`.

- [ ] **Step 1: Write failing persistence, ownership, and atomic shot-update tests**

```js
test("persists one shot update without changing sibling shots", async () => {
  const store = new VideoRemixStore({ file });
  store.create({ id: "remix-1", owner: "alice", accountId: "acct-a", shots: [
    { id: "shot-1", imageStatus: "idle" },
    { id: "shot-2", imageStatus: "idle" },
  ] });
  store.patchShot("remix-1", "shot-2", { imageStatus: "ready", imageResultUrl: "https://cdn.test/2.png" });
  const restored = new VideoRemixStore({ file }).get("remix-1");
  assert.equal(restored.shots[0].imageStatus, "idle");
  assert.equal(restored.shots[1].imageStatus, "ready");
});

test("returns projects by account id before legacy username", () => {
  assert.deepEqual(store.forOwner({ username: "renamed", accountId: "acct-a" }).map((item) => item.id), ["remix-1"]);
});
```

- [ ] **Step 2: Verify red**

Run: `node --test server/videoRemixStore.test.mjs`

Expected: FAIL because `VideoRemixStore` is missing.

- [ ] **Step 3: Implement clone-on-read, temp-file rename writes, and timestamped mutations**

Use the existing `ProductSuiteStore` persistence convention: write `<file>.tmp` with mode `0o600`, then rename it over the JSON file. `replaceShots` must reject duplicate shot IDs and any list outside 3–8 items.

- [ ] **Step 4: Verify green**

Run: `node --test server/videoRemixStore.test.mjs && npm test`

Expected: all tests PASS and no temporary file remains.

- [ ] **Step 5: Commit**

```bash
git add server/videoRemixStore.mjs server/videoRemixStore.test.mjs
git commit -m "feat: persist video remix projects"
```

### Task 3: Add streamed video upload, authoritative probe, and frame extraction

**Files:**
- Modify: `package.json`
- Modify: package lockfile
- Create: `server/videoRemixUploads.mjs`
- Create: `server/videoProbe.mjs`
- Create: `server/videoRemixUploads.test.mjs`
- Create: `server/videoProbe.test.mjs`

**Interfaces:**
- Produces: `receiveVideoUpload(req, { root, owner, maxBytes })`, `probeVideo(path, { ffprobePath })`, `extractAnalysisFrames(path, { outputDir, durationSeconds, maxFrames, ffmpegPath })`, `removeVideoRemixDirectory(projectId, { root })`.

- [ ] **Step 1: Write failing tests for byte limits, MIME checks, duration checks, and safe cleanup**

```js
test("rejects a probed source video longer than twenty seconds", async () => {
  await assert.rejects(
    validateProbedVideo({ durationSeconds: 20.01, width: 1080, height: 1920 }),
    /20 秒以内/,
  );
});

test("cleanup cannot escape the configured remix media root", async () => {
  assert.throws(
    () => resolveProjectMediaDirectory("../outside", { root }),
    /无效的项目目录/,
  );
});
```

Add a tiny generated fixture video in the test's temporary directory by invoking the pinned ffmpeg binary with a color source; do not commit binary fixtures.

- [ ] **Step 2: Verify red**

Run: `node --test server/videoRemixUploads.test.mjs server/videoProbe.test.mjs`

Expected: FAIL because upload/probe helpers are missing.

- [ ] **Step 3: Add pinned binaries and implement streaming**

Install: `npm install --save-exact ffmpeg-static ffprobe-static`

`receiveVideoUpload` must stream `req` to a random temporary file, count bytes while receiving, stop at the configured limit, delete partial files after errors, and rename only after a successful probe. Accepted MIME values are `video/mp4`, `video/webm`, and `video/quicktime`.

`extractAnalysisFrames` must produce at most 12 JPEG files, scaled within 1024×1024, at evenly distributed visual timestamps. Return:

```js
[
  { index: 0, timestampSeconds: 0.83, stagedPath: "remix-1/frames/frame-001.jpg", mimeType: "image/jpeg" },
]
```

- [ ] **Step 4: Verify green and inspect one extracted frame**

Run: `node --test server/videoRemixUploads.test.mjs server/videoProbe.test.mjs && npm test`

Expected: PASS; the test reports 1–12 non-empty JPEG frames and no leaked temporary files.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json server/videoRemixUploads.mjs server/videoProbe.mjs server/videoRemixUploads.test.mjs server/videoProbe.test.mjs
git commit -m "feat: stream and inspect remix source videos"
```

### Task 4: Analyze sampled frames with a strict OpenAI response schema

**Files:**
- Create: `server/openaiVideoAnalysis.mjs`
- Create: `server/openaiVideoAnalysis.test.mjs`
- Modify: `.env.example`

**Interfaces:**
- Consumes: extracted frame objects and source metadata.
- Produces: `analyzeVideoFrames({ frames, durationSeconds, aspectRatio, fetchImpl, apiKey, model }) -> Promise<{ title, overallScript, shots }>`.

- [ ] **Step 1: Write failing request-shape and response-validation tests**

```js
test("sends timestamped image inputs and requests strict 3-8 shot JSON", async () => {
  const result = await analyzeVideoFrames({
    frames: [{ timestampSeconds: 1.2, dataUrl: "data:image/jpeg;base64,AAAA" }],
    durationSeconds: 12,
    aspectRatio: "9:16",
    apiKey: "test-key",
    model: "gpt-5.6-terra",
    fetchImpl: async (_url, init) => jsonResponse(validOpenAiBody),
  });
  assert.equal(result.shots.length, 3);
  assert.equal(result.shots[0].startSeconds, 0);
});
```

Also cover missing key, 401/403, unavailable model, malformed JSON, fewer than 3 shots, more than 8 shots, overlapping timing, and a final end time beyond source duration.

- [ ] **Step 2: Verify red**

Run: `node --test server/openaiVideoAnalysis.test.mjs`

Expected: FAIL because `analyzeVideoFrames` is missing.

- [ ] **Step 3: Implement the Responses adapter**

Send `POST https://api.openai.com/v1/responses` with `Authorization: Bearer ${apiKey}` and `text.format.type = "json_schema"`. The prompt must say:

```text
Analyze only the visual track. Preserve shot order, pacing, camera language, and marketing intent, but do not copy brands, faces, logos, written claims, or unrelated products. Return 3–8 shots covering the full source duration. Write product-neutral Chinese prompts that can later substitute the user's reference product. Each image prompt must describe composition, camera, lighting, environment, and product role. Each video prompt must describe only five seconds of motion and camera behavior.
```

Normalize output into stable IDs `shot-01` … `shot-08`, clamp timestamps to the source duration, and reject rather than silently repairing overlapping or unordered shots.

- [ ] **Step 4: Verify green**

Run: `node --test server/openaiVideoAnalysis.test.mjs && npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/openaiVideoAnalysis.mjs server/openaiVideoAnalysis.test.mjs .env.example
git commit -m "feat: analyze remix videos with OpenAI"
```

### Task 5: Expose project, upload, analysis, review, and media-preview routes

**Files:**
- Create: `server/videoRemixApi.test.mjs`
- Modify: `server.mjs:1-70`
- Modify: `server.mjs:1884-2055`

**Interfaces:**
- Produces authenticated routes:
  - `POST /workbench/video-remix/uploads/video` — raw file body, returns upload metadata after server probe.
  - `POST /workbench/video-remixes` — creates a project from a claimed upload and explicit settings.
  - `GET /workbench/video-remixes` — current owner's projects.
  - `GET /workbench/video-remixes/:id` — one public project.
  - `PATCH /workbench/video-remixes/:id/script` — edit title/script/shots with optimistic `updatedAt` guard.
  - `POST /workbench/video-remixes/:id/analyze` — queue frame extraction and GPT analysis.
  - `POST /workbench/video-remixes/:id/confirm-script` — require valid 3–8 shots and 1–5 product images.
  - `GET /workbench/video-remixes/:id/media/:mediaId` — owner-checked source/keyframe/product preview.
  - `DELETE /workbench/video-remixes/:id` — delete project and exact media directory.

- [ ] **Step 1: Write failing route tests through an exported request handler**

```js
test("a user cannot read another account's remix project", async () => {
  const response = await requestAs("bob", "/workbench/video-remixes/remix-alice");
  assert.equal(response.status, 404);
});

test("creating a project requires an explicit aspect ratio", async () => {
  const response = await postAs("alice", "/workbench/video-remixes", { uploadId: "upload-1" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /画面比例/);
});
```

- [ ] **Step 2: Verify red**

Run: `node --test server/videoRemixApi.test.mjs`

Expected: FAIL with 404/handler-missing assertions.

- [ ] **Step 3: Implement route handlers and project initialization**

Create projects with status `draft`, source metadata, empty script/shots, and no staged path in the response. The analysis route must return `202` immediately with status `analyzing`; duplicate calls while analyzing return `409`. Use the current `requireUser` identity and account-first ownership convention.

- [ ] **Step 4: Verify green**

Run: `node --test server/videoRemixApi.test.mjs && npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server.mjs server/videoRemixApi.test.mjs
git commit -m "feat: add video remix project API"
```

### Task 6: Orchestrate storyboard image generation and per-shot regeneration

**Files:**
- Create: `server/videoRemixOrchestrator.mjs`
- Create: `server/videoRemixOrchestrator.test.mjs`
- Modify: `server.mjs:1288-1365`

**Interfaces:**
- Produces: `queueStoryboardImages(projectId)`, `retryStoryboardImage(projectId, shotId)`, `approveStoryboardImage(projectId, shotId)`, `syncRemixChildTask(task)`.
- Adds routes:
  - `POST /workbench/video-remixes/:id/storyboards`
  - `POST /workbench/video-remixes/:id/shots/:shotId/retry-image`
  - `POST /workbench/video-remixes/:id/shots/:shotId/approve-image`

- [ ] **Step 1: Write failing orchestration tests**

```js
test("storyboard generation creates one image task per shot with source and product references", () => {
  const tasks = orchestrator.queueStoryboardImages("remix-1");
  assert.equal(tasks.length, 5);
  assert.equal(tasks[0].kind, "image");
  assert.equal(tasks[0].input.images.length, 6);
  assert.equal(tasks[0].remixShotId, "shot-01");
});

test("retrying one image clears only that shot and its downstream video", () => {
  const updated = orchestrator.retryStoryboardImage("remix-1", "shot-03");
  assert.equal(updated.shots[2].imageStatus, "queued");
  assert.equal(updated.shots[2].videoStatus, "idle");
  assert.equal(updated.shots[1].imageStatus, "approved");
});
```

- [ ] **Step 2: Verify red**

Run: `node --test server/videoRemixOrchestrator.test.mjs`

Expected: FAIL because the orchestrator is missing.

- [ ] **Step 3: Implement image child-task creation using existing task/usage infrastructure**

For every shot, build references in this order: source keyframe first, primary product second, remaining product references after it. Append this fixed constraint to the editable prompt:

```text
Use the uploaded product references as the only product identity. Preserve its exact shape, color, materials, proportions, logo placement, and visible details. Do not add accessories, companion products, garments, packaging, text, or extra product parts that are absent from the references.
```

Create ordinary image tasks so existing WaveSpeed charging, concurrency, retry, and result polling remain the source of truth. Store `remixProjectId`, `remixShotId`, and `remixStage: "storyboard"` on each task. Synchronize terminal child states into the shot and set every still-queued sibling to `error` if project-level setup fails before dispatch.

- [ ] **Step 4: Verify green**

Run: `node --test server/videoRemixOrchestrator.test.mjs && npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/videoRemixOrchestrator.mjs server/videoRemixOrchestrator.test.mjs server.mjs
git commit -m "feat: orchestrate remix storyboard images"
```

### Task 7: Generate and retry separate five-second Kling/Seedance clips

**Files:**
- Modify: `server/videoRemixOrchestrator.mjs`
- Modify: `server/videoRemixOrchestrator.test.mjs`
- Modify: `server.mjs:1288-1365`

**Interfaces:**
- Produces: `queueVideoClips(projectId)`, `retryVideoClip(projectId, shotId)`.
- Adds routes:
  - `POST /workbench/video-remixes/:id/videos`
  - `POST /workbench/video-remixes/:id/shots/:shotId/retry-video`

- [ ] **Step 1: Write failing approval-gate and payload tests**

```js
test("video generation is blocked until every storyboard is approved", () => {
  assert.throws(() => orchestrator.queueVideoClips("remix-with-one-unapproved-shot"), /确认全部分镜/);
});

test("creates one silent five-second video task per approved shot", () => {
  const tasks = orchestrator.queueVideoClips("remix-approved");
  assert.equal(tasks.length, 5);
  assert.equal(tasks[0].input.duration, 5);
  assert.equal(tasks[0].input.generateAudio, false);
  assert.deepEqual(tasks[0].input.referenceImages, [{ url: "https://cdn.test/shot-01.png" }]);
});
```

- [ ] **Step 2: Verify red**

Run: `node --test server/videoRemixOrchestrator.test.mjs`

Expected: FAIL because clip orchestration is not implemented.

- [ ] **Step 3: Implement video child-task creation and synchronization**

Use only `VIDEO_REMIX_VIDEO_MODELS`, force `duration: 5`, `generateAudio: false`, and one approved storyboard result as the start frame. Store `remixStage: "video"`. A failed clip marks only that shot failed and leaves successful clips downloadable. Project status becomes `complete` only when all shots are done, otherwise `partial` when terminal states are mixed.

- [ ] **Step 4: Verify green**

Run: `node --test server/videoRemixOrchestrator.test.mjs && npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/videoRemixOrchestrator.mjs server/videoRemixOrchestrator.test.mjs server.mjs
git commit -m "feat: generate remix video clips"
```

### Task 8: Recover interrupted projects and delete their retained media safely

**Files:**
- Modify: `server/videoRemixOrchestrator.mjs`
- Modify: `server/videoRemixOrchestrator.test.mjs`
- Modify: `server/videoRemixUploads.mjs`
- Modify: `server.mjs:80-105`

**Interfaces:**
- Produces: `recoverVideoRemixProjects(projects, tasks)`, `failUndispatchedShots(projectId, stage, message)`.

- [ ] **Step 1: Write failing restart and deletion tests**

```js
test("restart requeues child tasks but does not duplicate a linked task id", () => {
  const actions = recoverVideoRemixProjects([project], [linkedQueuedTask]);
  assert.deepEqual(actions, [{ action: "enqueue", taskId: "task-1" }]);
});

test("deleting a project removes only its resolved media directory", async () => {
  await removeVideoRemixDirectory("remix-1", { root });
  assert.equal(existsSync(join(root, "remix-1")), false);
  assert.equal(existsSync(join(root, "remix-2")), true);
});
```

- [ ] **Step 2: Verify red**

Run: `node --test server/videoRemixOrchestrator.test.mjs server/videoRemixUploads.test.mjs`

Expected: FAIL for missing recovery/deletion behavior.

- [ ] **Step 3: Implement idempotent recovery and exact-target cleanup**

On startup, re-enqueue linked `queued` tasks and recover `running` tasks according to the existing scheduler's prediction-ID rules. If analysis was interrupted before an OpenAI result was persisted, reset it to `analysis_error` with a retryable message. Before recursive deletion, resolve both root and target and verify `target.startsWith(root + sep)`.

- [ ] **Step 4: Verify green**

Run: `node --test server/videoRemixOrchestrator.test.mjs server/videoRemixUploads.test.mjs && npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/videoRemixOrchestrator.mjs server/videoRemixOrchestrator.test.mjs server/videoRemixUploads.mjs server/videoRemixUploads.test.mjs server.mjs
git commit -m "feat: recover and clean up remix projects"
```

### Task 9: Add the typed browser API and polling behavior

**Files:**
- Create: `src/videoRemixTypes.ts`
- Create: `src/lib/videoRemixApi.ts`
- Create: `server/videoRemixUi.test.mjs`

**Interfaces:**
- Produces browser types `VideoRemixProject`, `VideoRemixShot`, `VideoRemixStatus`, `ShotImageStatus`, `ShotVideoStatus`.
- Produces API methods `uploadRemixVideo(file)`, `createVideoRemix(input)`, `loadVideoRemixes()`, `getVideoRemix(id)`, `analyzeVideoRemix(id)`, `saveVideoRemixScript(id, input)`, `confirmVideoRemixScript(id, productImages)`, `generateStoryboards(id)`, `retryStoryboard(id, shotId)`, `approveStoryboard(id, shotId)`, `generateVideos(id)`, `retryVideo(id, shotId)`, `deleteVideoRemix(id)`.

- [ ] **Step 1: Write failing source-contract tests**

```js
test("video upload sends the File body instead of a base64 JSON payload", async () => {
  const source = await readFile(new URL("../src/lib/videoRemixApi.ts", import.meta.url), "utf8");
  assert.match(source, /body:\s*file/);
  assert.doesNotMatch(source, /FileReader|dataUrl/);
});

test("the client contract fixes every generated clip to five seconds", async () => {
  const source = await readFile(new URL("../src/videoRemixTypes.ts", import.meta.url), "utf8");
  assert.match(source, /clipDuration:\s*5/);
});
```

- [ ] **Step 2: Verify red**

Run: `node --test server/videoRemixUi.test.mjs`

Expected: FAIL because the client files do not exist.

- [ ] **Step 3: Implement the browser-safe types and API wrapper**

Use a single JSON request helper for project endpoints and a dedicated raw-file function:

```ts
export async function uploadRemixVideo(file: File): Promise<VideoRemixUpload> {
  const response = await fetch("/workbench/video-remix/uploads/video", {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  return parseResponse(response);
}
```

The UI polls only while the project or one of its shots is non-terminal, using a two-second interval that is cleared on unmount and project switch.

- [ ] **Step 4: Verify green**

Run: `node --test server/videoRemixUi.test.mjs && npm run build && npm test`

Expected: typecheck, build, and all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/videoRemixTypes.ts src/lib/videoRemixApi.ts server/videoRemixUi.test.mjs
git commit -m "feat: add video remix client API"
```

### Task 10: Build the six-step workflow and selected production-matrix UI

**Files:**
- Create: `src/VideoRemixWorkspace.tsx`
- Modify: `src/styles.css`
- Modify: `server/videoRemixUi.test.mjs`

**Interfaces:**
- Consumes: all methods from `src/lib/videoRemixApi.ts`.
- Produces: `<VideoRemixWorkspace />` with upload, analysis, script review, storyboard matrix, video generation, and clip-download states.

- [ ] **Step 1: Write failing UI source tests for the selected design and critical actions**

```js
test("video remix workspace exposes the full gated journey", async () => {
  const source = await readFile(new URL("../src/VideoRemixWorkspace.tsx", import.meta.url), "utf8");
  for (const label of ["上传视频", "智能拆分", "分镜图确认", "生成视频", "结果预览", "下载素材"]) {
    assert.match(source, new RegExp(label));
  }
  for (const action of ["确认全部分镜", "重新生成本镜头", "前往生成视频"]) {
    assert.match(source, new RegExp(action));
  }
});
```

- [ ] **Step 2: Verify red**

Run: `node --test server/videoRemixUi.test.mjs`

Expected: FAIL because the workspace component is missing.

- [ ] **Step 3: Implement steps 1–2: upload and analysis**

Render a drag/drop zone with MP4/WebM/MOV and “≤20 秒” copy, a required ratio selector, source preview, upload progress, and “开始智能分析”. Browser validation must read `video.duration` from an object URL, reject values above 20 seconds, revoke the URL, then stream the accepted file.

During analysis show these deterministic phases from project status: “上传完成”, “提取关键帧”, “GPT 分析画面结构”, and “生成可编辑分镜”. Preserve the original video preview while polling.

- [ ] **Step 4: Implement step 3 script confirmation**

Provide editable project title, overall script, and 3–8 shot cards with start/end times, scene summary, image prompt, and motion prompt. Add explicit buttons for adding, deleting, moving, and merging shots. A destructive structure edit after generation opens a native confirmation dialog whose accepted path clears all storyboard/video results through the server patch.

Product upload accepts 1–5 images, marks the first “主参考”, supports reorder/remove, and does not allow script confirmation with zero product references.

- [ ] **Step 5: Implement the selected “分镜生产矩阵”**

Use the selected reference at `C:/Users/kangy/.codex/generated_images/01a08432-d4f2-7772-83a4-f234285840b4/exec-0899fcce-c623-4394-824a-f61331bfd3ec.png` as the visual target. The desktop matrix columns are:

```text
镜头 / 时间 | 原视频关键帧 | 商品再生分镜图 | 图像提示词 | 状态 / 操作
```

Each row supports expand/collapse, inline prompt editing, status, approve, and regenerate. The expanded row shows up to five product references and the cyan “重新生成本镜头” action. The sticky footer shows `已确认 N / M 个分镜`; “前往生成视频” remains disabled until all images are approved.

- [ ] **Step 6: Implement steps 4–6: clips, preview, and download**

The video-generation matrix replaces image approval actions with per-shot clip status, retry, inline `<video controls preload="metadata">`, and “下载视频”. “下载全部素材” downloads each finished clip separately with filenames `shot-01.mp4` … `shot-08.mp4`; it must not create a stitched file.

- [ ] **Step 7: Add responsive behavior without changing desktop hierarchy**

At widths below 980px, keep the six-step bar horizontally scrollable, turn settings into a two-column grid, and render each matrix row as a stacked card in the same information order. Do not hide prompts, approval state, retry, or download actions.

- [ ] **Step 8: Verify green**

Run: `node --test server/videoRemixUi.test.mjs && npm run build && npm test`

Expected: all tests PASS with no TypeScript or Vite warnings.

- [ ] **Step 9: Commit**

```bash
git add src/VideoRemixWorkspace.tsx src/styles.css server/videoRemixUi.test.mjs
git commit -m "feat: build video remix production matrix"
```

### Task 11: Integrate “视频再生” into the existing workbench shell

**Files:**
- Modify: `src/App.tsx:1-25`
- Modify: `src/App.tsx:1192-1212`
- Modify: `src/App.tsx:1218-1692`
- Modify: `src/styles.css`
- Modify: `server/sidebarNavigation.test.mjs`

**Interfaces:**
- Consumes: `<VideoRemixWorkspace />`.
- Produces: `creationKind: "image" | "video" | "cutout" | "print" | "suite" | "remix"` and a visible “视频再生” navigation control.

- [ ] **Step 1: Write the failing navigation test**

```js
test("workbench navigation includes the video remix module", async () => {
  const source = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /setCreationKind\("remix"\)/);
  assert.match(source, />视频再生<\/button>/);
  assert.match(source, /<VideoRemixWorkspace/);
});
```

- [ ] **Step 2: Verify red**

Run: `node --test server/sidebarNavigation.test.mjs`

Expected: FAIL because the new creation mode is absent.

- [ ] **Step 3: Add the mode without restructuring existing creation flows**

Import and render the isolated workspace, add the top navigation button after “商品套图”, set the page title to “视频再生”, and apply `creation-remix`. Keep all current image, ordinary video, cutout, print, and product-suite behavior unchanged.

- [ ] **Step 4: Verify green**

Run: `node --test server/sidebarNavigation.test.mjs && npm run build && npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/styles.css server/sidebarNavigation.test.mjs
git commit -m "feat: add video remix workbench navigation"
```

### Task 12: Run end-to-end workflow and Product Design visual QA

**Files:**
- Create: `design-qa.md`
- Modify: `README.md`

**Interfaces:**
- Produces: a verified local module and a written visual/functional acceptance record.

- [ ] **Step 1: Document runtime configuration and operator checks**

Add these exact environment names to `.env.example`/README without values:

```dotenv
OPENAI_API_KEY=
OPENAI_VIDEO_ANALYSIS_MODEL=gpt-5.6-terra
WORKBENCH_MAX_VIDEO_UPLOAD_BYTES=104857600
```

Document that the OpenAI key must be configured on the server, source audio is ignored, project deletion removes retained media, and output is a set of separate five-second clips.

- [ ] **Step 2: Run automated verification**

Run:

```bash
npm test
npm run build
```

Expected: both commands exit 0 with no failing tests or TypeScript errors.

- [ ] **Step 3: Start the app and exercise the complete happy path**

Run: `npm run dev`

In the Codex in-app browser, use a local ≤20-second MP4 and 1–5 product images. Confirm: upload, server probe, GPT analysis, script edits, script confirmation, all storyboard generation, one prompt edit/regeneration, all approvals, all clip generation, one clip retry, separate downloads, reload persistence, and project deletion.

- [ ] **Step 4: Exercise required failure paths**

Verify visible Chinese errors for: 20.01-second video, unsupported MIME, 101MB upload, missing ratio, missing product image, unavailable OpenAI model/key, malformed OpenAI response, one failed image child, one failed video child, and reload during queued/running work.

- [ ] **Step 5: Perform blocking Product Design comparison QA**

Capture the implementation at the same 1440×1024 viewport and the same five-row/third-row-expanded state as the selected reference. Combine the reference and implementation screenshots side-by-side in one image input. Compare hierarchy, spacing, typography, borders, radii, column widths, thumbnail crops, cyan actions, status colors, sticky footer, and overflow behavior.

Write `design-qa.md` with:

```markdown
# Video Remix Design QA

- Reference: selected Product Design option 3
- Viewport: 1440×1024
- State: five shots, shot 03 expanded, four approved
- P0 findings: none
- P1 findings: none
- P2 findings: none
- Functional checks: navigation, edit, regenerate, approve, gated generation, retry, download passed
- Final result: passed
```

If any P0/P1/P2 mismatch exists, record it, fix it, recapture both views together, and repeat until `Final result: passed` is truthful.

- [ ] **Step 6: Run final verification after QA fixes**

Run: `npm test && npm run build && git status --short`

Expected: tests/build PASS; only intentional source, test, documentation, and lockfile changes appear.

- [ ] **Step 7: Commit**

```bash
git add README.md .env.example design-qa.md
git commit -m "docs: verify video remix production workflow"
```

---

## Acceptance Checklist

- [ ] A 20.0-second supported video uploads without base64 conversion; a 20.01-second video is rejected by the server.
- [ ] GPT returns an editable overall script and 3–8 ordered visual shots with source keyframes and two prompts per shot.
- [ ] The user explicitly chooses output ratio, one image model, and one Kling/Seedance video model for the project.
- [ ] One to five product references are retained for project life, with the first treated as primary.
- [ ] The selected production matrix supports prompt editing, per-shot regeneration, individual approval, and a clear N/M approval count.
- [ ] Changing a prompt invalidates only the affected shot and its downstream clip; changing structure invalidates all downstream output after confirmation.
- [ ] Video generation is impossible until every storyboard image is approved.
- [ ] Every generated clip is exactly five seconds, silent, independently retryable, previewable, and downloadable.
- [ ] No automatic stitching or source-audio processing exists.
- [ ] Child-task failures synchronize into the correct shot and never leave siblings indefinitely “排队中”.
- [ ] Restart recovery does not duplicate paid child tasks.
- [ ] Cross-account project/media access returns 404 and public JSON contains no private file paths or credentials.
- [ ] Deleting a project removes only that project's retained source, frames, and product references.
- [ ] Existing 图片创作、视频创作、产品抠图、印花提取、商品套图 modules remain green.
- [ ] Product Design comparison QA reaches `Final result: passed` at 1440×1024.

## Self-Review Result

- Spec coverage: all six requested workflow stages, model selection, per-shot editing/retry, separate clip output, UI partitioning, retention, validation, recovery, and security have an owning task.
- Placeholder scan: every task names exact files, interfaces, test command, expected failure, implementation behavior, verification command, and commit.
- Type consistency: project/shot status, model IDs, route names, and orchestration method names are consistent from the shared contract through server routes and browser API.
