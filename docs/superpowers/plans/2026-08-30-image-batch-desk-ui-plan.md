# 图片创作批量工作台 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 仅重做“图片创作”选项卡，使其接近用户选定的批量工作台参考图，同时保持视频创作、产品抠图、印花提取和商品套图不变。

**Architecture:** 复用现有图片任务状态、模型选择、参数同步、提交、重试、下载和结果数据；仅替换图片页的 JSX 结构与作用域 CSS。图片页使用紧凑的顶部模式条、全局设置条和三列任务网格，其他功能仍走现有渲染分支。

**Tech Stack:** React 18, TypeScript, Vite, CSS, Node.js test runner.

## Global Constraints

- 只修改图片创作页面的可见布局与样式，不修改视频、抠图、印花提取、商品套图的功能和样式。
- 保留现有图片任务最多 10 个、参考图、模型、比例、分辨率、质量、提示词、生成、重试、下载和结果操作。
- 不新增 API、依赖、静态占位图片或模拟数据。
- 不保留图片页的大面积空白；图片页的任务卡和结果区域必须由真实任务状态驱动。
- 其他页面的现有 DOM 分支和核心类名不做无关重构。

---

### Task 1: Add image-only layout regression coverage

**Files:**
- Modify: `server/layoutRegression.test.mjs`
- Modify: `src/App.tsx`

**Interfaces:**
- The test reads `src/App.tsx` as source text and protects the image-only layout boundary.
- The image branch must expose `image-batch-desk`, `image-batch-toolbar`, and `image-task-grid` markers.

- [ ] **Step 1: Write the failing test**

Add a test that asserts the image creation branch contains the three new layout markers and the current functional labels `应用到所有任务卡`, `全部开始`, and `批量提示词`.

- [ ] **Step 2: Run the regression test to verify it fails**

Run:

```powershell
node --test server/layoutRegression.test.mjs
```

Expected: FAIL because the new image-only layout markers are not present yet.

### Task 2: Replace only the image creation shell with the Batch Desk layout

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Reuse existing callbacks and state: `applyGlobalSettingsToTasks`, `addTask`, `runAllTasks`, `clearCompletedResults`, `clearAllTasks`, `bulkPrompt`, `provider`, `nanoModel`, `count`, `aspectRatio`, `resolution`, and `quality`.
- Keep the existing task card loop and result actions available inside the new `image-task-grid`.

- [ ] **Step 1: Implement the compact image-only structure**

Replace the current image branch's large `batch-panel` wrapper with:

```tsx
<section className="image-batch-desk">
  <header className="image-batch-toolbar">…global model and image controls…</header>
  <div className="image-batch-command-row">…task count and batch actions…</div>
  <div className="image-task-grid">…existing task cards…</div>
  <footer className="image-batch-footer">…selected task summary and batch actions…</footer>
</section>
```

Keep all controls wired to the existing state and handlers. Keep the image task card markup functional; only adapt its surrounding layout and class names to the dense three-column grid.

- [ ] **Step 2: Run the targeted regression test**

Run:

```powershell
node --test server/layoutRegression.test.mjs
```

Expected: PASS with the image-only markers present.

### Task 3: Add scoped visual tokens and responsive behavior

**Files:**
- Modify: `src/styles.css`

**Interfaces:**
- New selectors are prefixed with `.image-batch-desk`, `.image-batch-toolbar`, `.image-task-grid`, or `.image-batch-footer`.
- Existing selectors used by other pages remain unchanged unless a shared rule is required to prevent overflow.

- [ ] **Step 1: Implement the reference-inspired visual system**

Use a restrained pale warm canvas, compact 12–14px controls, orange primary action, thin warm borders, small radii, and no large decorative shadows. Set the task grid to three columns at desktop widths, two columns at medium widths, and one column on mobile. Keep text wrapping safe for Chinese labels and long model names.

- [ ] **Step 2: Run the production build**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite build exit with code 0.

### Task 4: Verify behavior and visual fidelity

**Files:**
- Create: `design-qa.md`
- Modify: `server/layoutRegression.test.mjs` only if a verified regression gap is found.

- [ ] **Step 1: Run full automated verification**

Run:

```powershell
npm test
npm run build
git diff --check
```

Expected: zero test failures, successful production build, and no whitespace errors.

- [ ] **Step 2: Capture the image page at the reference viewport**

Run the local app, open the image creation page at the reference desktop viewport, and verify the selected image page against the supplied reference. Test adding a task, applying global settings, and opening another top-level tab to confirm its UI remains unchanged.

- [ ] **Step 3: Record design QA**

Write `design-qa.md` with the supplied source screenshot path, implementation screenshot path, viewport, state, full-view comparison, focused-region comparison, and final result. Fix any P0/P1/P2 visual issues before handoff.
