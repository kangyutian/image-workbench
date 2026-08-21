# 图片生成比例补全 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Image 2 图片生成补全 WaveSpeed GPT Image 2 支持的 15 个比例，并让前端选项与服务端归一化规则保持一致。

**Architecture:** 保留现有其他图片模型的比例集合，只为 `image2` 增加专用完整比例列表。服务端抽取一个可测试的比例规则模块，由 `server.mjs` 调用；前端在现有比例下拉框中使用 Image 2 专用列表，任务切换模型时继续沿用现有归一化流程。

**Tech Stack:** React 18、TypeScript、Vite、Node.js ESM、Node built-in test runner。

## Global Constraints

- Image 2 支持：`1:1`、`1:2`、`2:1`、`1:3`、`3:1`、`2:3`、`3:2`、`3:4`、`4:3`、`4:5`、`5:4`、`9:16`、`16:9`、`9:21`、`21:9`。
- 不增加任意宽高输入，只扩展下拉预设。
- 不修改视频、产品套图、抠图和印花提取的比例逻辑。
- 不改变现有默认比例和任务创建流程。
- 不提交或修改任何服务器 `.env`、用户数据或任务数据。

### Task 1: Extract and test Image 2 aspect-ratio rules

**Files:**
- Create: `server/imageAspectRatios.mjs`
- Create: `server/imageAspectRatios.test.mjs`
- Modify: `server.mjs:250-295`

**Interfaces:**
- Produces `IMAGE2_ASPECT_RATIOS`, `COMMON_ASPECT_RATIOS`, `EDIT_MULTI_ASPECT_RATIOS`, `aspectRatiosFor(request)`, and `normalizeAspectRatio(request)` for the server request path.

- [ ] **Step 1: Write the failing tests**

  Add Node tests that assert Image 2 exposes exactly the 15 approved values, preserves a valid value, and falls back to the first approved value for an invalid value. Add a regression assertion that a non-Image-2 generic request still uses the existing five common ratios.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run `npm test -- server/imageAspectRatios.test.mjs`.

  Expected result: FAIL because `server/imageAspectRatios.mjs` does not exist yet.

- [ ] **Step 3: Implement the minimal server module**

  Define the three frozen arrays and implement:

  ```js
  export function aspectRatiosFor(request = {}) {
    if (request.provider === "image2") return IMAGE2_ASPECT_RATIOS;
    if (request.provider === "nanobanana" && request.nanoModel === "nano-banana-pro-edit-multi") return EDIT_MULTI_ASPECT_RATIOS;
    return COMMON_ASPECT_RATIOS;
  }

  export function normalizeAspectRatio(request = {}) {
    const allowed = aspectRatiosFor(request);
    if (!allowed.includes(request.aspectRatio)) request.aspectRatio = allowed[0];
    return request;
  }
  ```

- [ ] **Step 4: Run the focused test and verify it passes**

  Run `npm test -- server/imageAspectRatios.test.mjs`.

  Expected result: PASS with zero failures.

- [ ] **Step 5: Wire the server request path**

  Replace the local generic arrays and `allowedAspectRatiosFor` branch in `server.mjs` with imports from `server/imageAspectRatios.mjs`, then call `normalizeAspectRatio(request)` inside `normalizeRequestOptions` for non-Grok and non-Kling requests. Keep Grok and Kling model-specific normalization untouched.

- [ ] **Step 6: Run the focused regression tests**

  Run `npm test -- server/imageAspectRatios.test.mjs server/grokModels.test.mjs server/klingImageModels.test.mjs`.

  Expected result: PASS with zero failures.

### Task 2: Add all Image 2 choices to the UI

**Files:**
- Modify: `src/App.tsx:76-102`
- Create: `server/imageAspectRatiosUi.test.mjs`

**Interfaces:**
- Consumes the server-supported Image 2 ratio values from Task 1.
- Produces a complete `image2AspectOptions` list consumed by `aspectOptionsFor` for provider `image2`.

- [ ] **Step 1: Write the failing UI regression test**

  Add a Node test that reads `src/App.tsx`, extracts the `image2AspectOptions` declaration, and asserts that it contains exactly the 15 approved values and that `aspectOptionsFor` routes `provider === "image2"` to it. This protects the static UI configuration without adding a browser-test dependency.

- [ ] **Step 2: Run the focused UI test and verify it fails**

  Run `npm test -- server/imageAspectRatiosUi.test.mjs`.

  Expected result: FAIL because the Image 2-specific option block does not exist yet.

- [ ] **Step 3: Implement the minimal UI change**

  Add `image2AspectOptions` with all 15 values and update `aspectOptionsFor` so `provider === "image2"` returns it. Keep `aspectOptions` unchanged for Nano Banana and Kling, and keep Grok-specific lists unchanged.

- [ ] **Step 4: Run the focused UI test and verify it passes**

  Run `npm test -- server/imageAspectRatiosUi.test.mjs`.

  Expected result: PASS with zero failures; all 15 values are present and Image 2 routes to the new list.

### Task 3: Full verification and handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-08-21-image-aspect-ratios-design.md` only if verification finds a documented mismatch.

- [ ] **Step 1: Run the full automated test suite**

  Run `npm test`.

  Expected result: exit code 0 with zero failed tests.

- [ ] **Step 2: Run the production type check and build**

  Run `npm run build`.

  Expected result: TypeScript and Vite both exit successfully and produce `dist/`.

- [ ] **Step 3: Check patch hygiene**

  Run `git diff --check` and `git status --short`.

  Expected result: no whitespace errors; only the planned code, test, and documentation files are changed.

- [ ] **Step 4: Review the final diff**

  Run `git diff -- server/imageAspectRatios.mjs server/imageAspectRatios.test.mjs server.mjs src/App.tsx docs/superpowers/specs/2026-08-21-image-aspect-ratios-design.md docs/superpowers/plans/2026-08-21-image-aspect-ratios-plan.md`.

  Confirm no server secrets, deployment commands, unrelated UI changes, or changes to video/product-suite ratio handling are present.

- [ ] **Step 5: Commit and push to GitHub only after verification**

  Run `git add server/imageAspectRatios.mjs server/imageAspectRatios.test.mjs server.mjs src/App.tsx docs/superpowers/specs/2026-08-21-image-aspect-ratios-design.md docs/superpowers/plans/2026-08-21-image-aspect-ratios-plan.md; git commit -m "feat: expand image generation aspect ratios"; git push origin feat/remote-mcp`.

  Do not deploy or restart the production service in this task.
