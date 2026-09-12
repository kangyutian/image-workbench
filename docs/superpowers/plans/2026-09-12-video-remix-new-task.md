# Video Remix New Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the video remix workspace reliably return to a blank upload state when the user chooses or clicks “new task”, while preserving existing projects across refreshes.

**Architecture:** Keep project persistence and refresh recovery unchanged. Add one local `startNewProject()` state transition in `src/VideoRemixWorkspace.tsx`, call it from both the project selector and a visible header button, and cover the behavior with the existing source-based UI test.

**Tech Stack:** React, TypeScript, Vite, Node.js built-in test runner.

## Global Constraints

- Do not delete or overwrite existing video remix projects.
- Do not create a backend project until the user uploads a video and starts analysis.
- Keep the existing project selector and refresh recovery behavior.
- Run the focused UI test, full test suite, production build, and diff checks before deployment.

---

### Task 1: Add the new-task state transition and UI entry points

**Files:**
- Modify: `src/VideoRemixWorkspace.tsx`
- Test: `server/videoRemixUi.test.mjs`

**Interfaces:**
- Produces `startNewProject(): void`, a local UI action that resets the current project selection and upload form to defaults.
- Consumes the existing `setProject`, `setDraftProject`, `setSourceFile`, `setSourceDuration`, `setTitle`, `setAspectRatio`, `setImageModelId`, `setVideoModelId`, `setViewStage`, `setError`, and `setBusy` setters.

- [ ] **Step 1: Write the failing test**

  Extend `server/videoRemixUi.test.mjs` with assertions that `VideoRemixWorkspace.tsx` contains `startNewProject`, renders `新建任务`, and handles the selector's `value === "new"` branch.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `node --test server/videoRemixUi.test.mjs`

  Expected: FAIL because the current workspace has no `startNewProject` action or functional `new` selector branch.

- [ ] **Step 3: Implement the minimal UI behavior**

  Add:

  ```tsx
  function startNewProject() {
    setProject(null);
    setDraftProject(null);
    setSourceFile(null);
    setSourceDuration(null);
    setTitle("视频再生项目");
    setAspectRatio("9:16");
    setImageModelId("gpt-image-2.5-sunburst");
    setVideoModelId("seedance-2-fast-image-to-video");
    setViewStage("storyboard");
    setBusy("");
    setError("");
  }
  ```

  Wire the selector so `event.target.value === "new"` calls `startNewProject()`, otherwise it selects the matching saved project. Add a `新建任务` secondary button beside the project selector that calls the same function.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `node --test server/videoRemixUi.test.mjs`

  Expected: all video remix UI tests pass.

- [ ] **Step 5: Run regression checks**

  Run: `npm test` and `npm run build`.

  Expected: all tests pass and Vite produces a production build.

- [ ] **Step 6: Commit the implementation**

  Run:

  ```bash
  git add src/VideoRemixWorkspace.tsx server/videoRemixUi.test.mjs docs/superpowers/specs/2026-09-12-video-remix-new-task-design.md docs/superpowers/plans/2026-09-12-video-remix-new-task.md
  git commit -m "fix: allow starting a new video remix task"
  ```

