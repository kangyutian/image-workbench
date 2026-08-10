# Video Model Keys and Fast/Pro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved Seedance, Kling, and Grok image/video choices, route them to dedicated WaveSpeed credentials, and install all supplied credentials only in production systemd configuration.

**Architecture:** The model catalogue in `server/videoModels.mjs` remains the single source of video endpoint and request-shape behavior. A focused `server/grokModels.mjs` module owns Grok image endpoint and payload rules. `server.mjs` maps a model id to a non-secret environment-variable name. The React selector and union type enumerate the new ids. Credentials stay outside the repository in a systemd drop-in.

**Tech Stack:** Node.js ESM, React/TypeScript, Vite, Node built-in test runner, systemd.

## Global Constraints

- Never place an API key in source, test fixtures, `.env`, logs, task data, Git history, or GitHub.
- Use a distinct `WAVESPEED_*` environment variable for every model; never retain an API key in task data or source.
- Verify public wiring and credential presence without logging key values. Paid generation is outside this implementation plan.
- Preserve existing model ids and request shapes.

---

### Task 1: Add server model definitions with regression tests

**Files:**
- Modify: `server/videoModels.test.mjs`
- Modify: `server/videoModels.mjs`

**Interfaces:**
- Consumes: `videoModelInfo(modelId)` and `videoPayloadFor(input)`.
- Produces: model ids `seedance-2-fast-image-to-video` and `kling-3-pro-image-to-video` with their WaveSpeed endpoints and normalised payloads.

- [ ] **Step 1: Write failing model tests**

```js
assert.equal(videoModelInfo("seedance-2-fast-image-to-video").endpoint, "bytedance/seedance-2.0-fast/image-to-video");
assert.equal(videoModelInfo("kling-3-pro-image-to-video").endpoint, "kwaivgi/kling-v3.0-pro/image-to-video");
assert.equal(videoPayloadFor({ modelId: "kling-3-pro-image-to-video", prompt: "camera pan", referenceImages: [{ url: "https://example.test/image.png" }], duration: 5 }).duration, 5);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test server/videoModels.test.mjs`

Expected: FAIL because neither new model id exists.

- [ ] **Step 3: Add the minimal model definitions**

```js
"seedance-2-fast-image-to-video": {
  id: "seedance-2-fast-image-to-video",
  label: "Seedance 2.0 Fast",
  endpoint: "bytedance/seedance-2.0-fast/image-to-video",
  mode: "image-to-video",
},
"kling-3-pro-image-to-video": {
  id: "kling-3-pro-image-to-video",
  label: "Kling 3.0 Pro",
  endpoint: "kwaivgi/kling-v3.0-pro/image-to-video",
  mode: "image-to-video",
},
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --test server/videoModels.test.mjs`

Expected: PASS with no failed subtests.

### Task 2: Route new model ids to private environment variables

**Files:**
- Modify: `server.mjs`
- Test: `server/videoModels.test.mjs` or a focused server routing test if an existing server-test pattern is available.

**Interfaces:**
- Consumes: video request `modelId`.
- Produces: `WAVESPEED_SEEDANCE_2_FAST_KEY` or `WAVESPEED_KLING_3_PRO_I2V_KEY` as the selected environment-variable name.

- [ ] **Step 1: Add a failing assertion for environment-key selection**

```js
assert.equal(envKeyForRequest({ kind: "video", modelId: "seedance-2-fast-image-to-video" }), "WAVESPEED_SEEDANCE_2_FAST_KEY");
assert.equal(envKeyForRequest({ kind: "video", modelId: "kling-3-pro-image-to-video" }), "WAVESPEED_KLING_3_PRO_I2V_KEY");
```

- [ ] **Step 2: Run the relevant test and verify it fails**

Run: `node --test server/videoModels.test.mjs`

Expected: FAIL because the new routes are absent.

- [ ] **Step 3: Add the two entries to `videoKeys`**

```js
"seedance-2-fast-image-to-video": "WAVESPEED_SEEDANCE_2_FAST_KEY",
"kling-3-pro-image-to-video": "WAVESPEED_KLING_3_PRO_I2V_KEY",
```

- [ ] **Step 4: Run the relevant test and verify it passes**

Run: `node --test server/videoModels.test.mjs`

Expected: PASS.

### Task 3: Expose Fast and Pro in the client

**Files:**
- Modify: `src/lib/videoApi.ts`
- Modify: `src/App.tsx`
- Test: `npm run build`

**Interfaces:**
- Consumes: `VideoModelId` and the selected `<option>` value.
- Produces: valid requests carrying either new model id.

- [ ] **Step 1: Add the two ids to the `VideoModelId` union**

```ts
| "seedance-2-fast-image-to-video"
| "kling-3-pro-image-to-video"
```

- [ ] **Step 2: Add two selector options**

```tsx
<option value="seedance-2-fast-image-to-video">Seedance 2.0 Fast · 图生视频 · 快速低成本</option>
<option value="kling-3-pro-image-to-video">Kling 3.0 Pro · 图生视频 · 高质量成片</option>
```

- [ ] **Step 3: Build the client**

Run: `npm run build`

Expected: exit code 0.

### Task 4: Deploy private configuration and verify production wiring

**Files:**
- Modify on server only: `/etc/systemd/system/image-workbench.service.d/wavespeed-keys.conf`

**Interfaces:**
- Consumes: the six user-supplied credentials.
- Produces: six `WAVESPEED_*` variables accessible to `image-workbench.service`.

- [ ] **Step 1: Copy the built application to `/home/ubuntu/image-workbench` without `.env` or credential files**

Run: `rsync -az --delete --exclude node_modules --exclude .env --exclude data <local-project>/ ubuntu@43.134.126.128:/home/ubuntu/image-workbench/`

- [ ] **Step 2: Replace the systemd drop-in atomically with the six `Environment=` entries**

Use a root-owned temporary file on the server, set mode `0600`, validate it contains all six variable names and no source-file path, then move it to `/etc/systemd/system/image-workbench.service.d/wavespeed-keys.conf`.

- [ ] **Step 3: Reload and restart the service**

Run: `sudo systemctl daemon-reload && sudo systemctl restart image-workbench.service`

- [ ] **Step 4: Verify process state without reading secret values**

Run a root-owned script that reads `/proc/<pid>/environ` and prints only the six expected variable names plus value lengths; run `systemctl is-active image-workbench.service`.

Expected: service is `active`; all six names are present and non-empty.

- [ ] **Step 5: Verify the deployed UI and server tests**

Run: `node --test server/videoModels.test.mjs && npm run build && curl -fsS https://nxtnumber.com/image-workbench/ -o /dev/null`

Expected: test exit 0, build exit 0, public endpoint returns HTTP 200.

### Task 5: Add Grok image and video contracts

**Files:**
- Create: `server/grokModels.mjs`
- Create: `server/grokModels.test.mjs`
- Modify: `server/videoModels.mjs`
- Modify: `server/videoModels.test.mjs`
- Modify: `server.mjs`

**Interfaces:**
- Consumes: a model id, normalized image-generation request, and uploaded image URLs.
- Produces: the exact WaveSpeed endpoint and only the fields accepted by the selected Grok model.

- [ ] **Step 1: Write failing contract tests**

```js
assert.equal(grokImageModelInfo("grok-2-image").endpoint, "x-ai/grok-2-image");
assert.deepEqual(grokPayloadFor({ nanoModel: "grok-imagine-image-edit", prompt: "replace background" }, ["https://example.test/source.png"]), { prompt: "replace background", image: "https://example.test/source.png" });
assert.equal(videoModelInfo("grok-imagine-video-v1.5-image-to-video").endpoint, "x-ai/grok-imagine-video-v1.5/image-to-video");
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node --test server/grokModels.test.mjs server/videoModels.test.mjs`

Expected: FAIL because the Grok contracts do not exist.

- [ ] **Step 3: Implement the minimal contracts**

```js
export function grokPayloadFor(request, uploadedImages) {
  if (request.nanoModel === "grok-imagine-image-edit") {
    return { prompt: request.prompt, image: uploadedImages[0] };
  }
  // Text models receive their documented prompt, aspect/resolution, and count fields only.
}
```

- [ ] **Step 4: Route each Grok model to its dedicated environment-variable name**

```js
"grok-2-image": "WAVESPEED_GROK_2_IMAGE_KEY",
"grok-imagine-image-edit": "WAVESPEED_GROK_IMAGINE_IMAGE_EDIT_KEY",
"grok-imagine-image-quality": "WAVESPEED_GROK_IMAGINE_IMAGE_QUALITY_KEY",
"grok-imagine-video-v1.5-image-to-video": "WAVESPEED_GROK_IMAGINE_VIDEO_V15_I2V_KEY",
```

- [ ] **Step 5: Run the focused tests and verify they pass**

Run: `node --test server/grokModels.test.mjs server/videoModels.test.mjs`

Expected: PASS with no failed subtests.

### Task 6: Make the approved models selectable and remove unsupported controls

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/imageApi.ts`
- Modify: `src/lib/videoApi.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: the selected provider and model id.
- Produces: only compatible image/video controls, compact task cards, and wrap-safe labels.

- [ ] **Step 1: Extend provider and model unions**

```ts
export type ProviderId = "nanobanana" | "image2" | "grok";
export type VideoModelId = /* existing ids */ | "seedance-2-fast-image-to-video" | "kling-3-pro-image-to-video" | "grok-imagine-video-v1.5-image-to-video";
```

- [ ] **Step 2: Add selectable model metadata and normalize values**

Use a maximum of one reference image for Grok Edit, hide aspect/resolution from Grok 2 and Grok Edit, and limit Grok Image Quality to its documented aspect ratios, 1K/2K resolutions, and 1–4 outputs.

- [ ] **Step 3: Add targeted layout protections**

Ensure task-card columns can shrink (`min-width: 0`), long labels wrap within their cards, unsupported controls are absent rather than rendered as disabled empty panels, and incomplete video cards do not reserve a large fixed output space.

- [ ] **Step 4: Build the client**

Run: `cmd /c npm run build`

Expected: exit code 0.
